# Design: overlap-invalidation-on-archive

## Affected areas

### Domain layer

- `packages/core/src/domain/entities/change.ts`:
  - `InvalidatedEvent.cause` union type — add `'spec-overlap-conflict'`
  - `Change.invalidate()` — method signature already accepts `InvalidatedEvent['cause']`; adding a new union member is backward-compatible
- `packages/core/src/domain/services/detect-spec-overlap.ts` — no changes, reused as-is

### Application layer

- `packages/core/src/application/use-cases/archive-change.ts`:
  - Overlap guard section (lines 152-166) — when `allowOverlap=true`, run overlap detection and invalidate overlapping changes instead of skipping
  - `ArchiveChangeResult` interface (lines 52-65) — add `invalidatedChanges` field
  - `SYSTEM_ACTOR` import from `change.ts` — used as the actor for invalidation events triggered by the system during archive
- `packages/core/src/application/use-cases/get-status.ts`:
  - `ReviewSummary` interface (line 60-69) — extend `reason` type, add `overlapDetail`
  - Review derivation logic (lines 287-323) — check latest `invalidated` event cause for `'spec-overlap-conflict'`

### CLI adapter

- `packages/cli/src/commands/change/archive.ts` — report `invalidatedChanges` in text and JSON output
- `packages/cli/src/commands/change/status.ts` — display `spec-overlap-conflict` reason and `overlapDetail` in text and JSON output

## New constructs

### `InvalidatedChangesEntry`

Added to `archive-change.ts`:

```ts
interface InvalidatedChangesEntry {
  readonly name: string
  readonly specIds: readonly string[]
}
```

### `OverlapEntry`

Added to `get-status.ts`:

```ts
interface OverlapEntry {
  readonly archivedChangeName: string
  readonly overlappingSpecIds: readonly string[]
}
```

### `ArchiveChangeResult.invalidatedChanges`

New field on the existing result interface:

```ts
readonly invalidatedChanges: readonly InvalidatedChangesEntry[]
```

### `ReviewSummary.overlapDetail`

New field on the existing review summary — always present, empty when not applicable:

```ts
readonly overlapDetail: readonly OverlapEntry[]
```

## Approach

### 1. Domain: extend invalidation cause

`InvalidatedEvent.cause` becomes `'spec-change' | 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict'`.

`Change.invalidate()` already accepts `InvalidatedEvent['cause']` and handles rollback generically — no method body changes needed. The new cause flows through the same path: append `invalidated` event, optionally append `transitioned` event to `designing`, mark artifacts as `pending-review`.

### 2. Application: ArchiveChange overlap invalidation

The current overlap guard (lines 152-166) has two branches:

- `allowOverlap=false`: detect and throw `SpecOverlapError`
- `allowOverlap=true`: skip entirely

The new logic replaces the `allowOverlap=true` branch:

1. Always call `detectSpecOverlap` when there are other active changes
2. When `allowOverlap=false` and overlap exists: throw (unchanged)
3. When `allowOverlap=true` and overlap exists:
   a. For each overlapping change, call `ChangeRepository.mutate(name, fn)`
   b. Inside the callback, call `change.invalidate('spec-overlap-conflict', SYSTEM_ACTOR, message, affectedArtifacts)`
   c. Build the `message` from the archived change name and overlapping spec IDs
   d. Build `affectedArtifacts` from all artifacts that contain files for the overlapping spec IDs
   e. Collect `{ name, specIds }` for the result
4. When no overlap: proceed normally (unchanged)

The `SYSTEM_ACTOR` constant (`{ name: 'specd', email: 'system@getspecd.dev' }`) is used as the actor for the invalidation — this is an automated system action, not a user action.

The overlap invalidation runs after the archivable guard and `archiving` transition, but before pre-archive hooks — consistent with the current overlap guard position. If any invalidation fails (e.g. the overlapping change is in a state that cannot be invalidated), it throws and the archive is aborted.

### 3. Application: GetStatus reason derivation

Current derivation (lines 287-323) checks file states for drift and review. The new logic adds a step:

Priority order:

1. Files in `drifted-pending-review` → `'artifact-drift'`
2. Files in `pending-review` + unhandled overlap invalidations exist → `'spec-overlap-conflict'` with merged `overlapDetail`
3. Files in `pending-review` → `'artifact-review-required'`
4. No review needed → `null`

**Unhandled overlap collection:** `GetStatus` scans `change.history` in reverse (newest to oldest) collecting `invalidated` events with `cause: 'spec-overlap-conflict'`. The scan stops at the first `transitioned` event whose `to` field is not `'designing'` — this marks a boundary where the change previously moved forward from an invalidation, meaning older overlap events were already handled. If no such boundary event is found, all matching events are included.

Each collected event is parsed to build an `OverlapEntry`:

- `archivedChangeName` — extracted from the `invalidated.message` (the change name in single quotes after "change")
- `overlappingSpecIds` — extracted from the message (spec IDs after the colon)

The `overlapDetail` array is ordered newest-first. This preserves the full picture when multiple changes were archived with overlapping specs before the current change could address any of them. `overlapDetail` is always present (empty array when no unhandled overlaps).

### 4. CLI: archive output

In text mode, after the archive path line, conditionally print:

```
invalidated N overlapping changes:
  - beta (specs: core:core/config, core:core/kernel)
  - gamma (specs: core:core/config)
```

In JSON mode, add `invalidatedChanges` array to the output object.

### 5. CLI: status output

In text mode, when `review.reason` is `'spec-overlap-conflict'`, add an `overlap:` subsection under `review:` listing each entry as a bullet:

```
review:
  required:  yes
  route:     designing
  reason:    spec-overlap-conflict
  overlap:
    - archived: beta, specs: core:core/config
    - archived: alpha, specs: core:core/kernel
  affected:
    ...
```

Multiple entries are listed newest-first. The subsection is omitted for other reasons.

In JSON mode, `overlapDetail` is always present in the `review` object: an array of `OverlapEntry` objects when `reason` is `'spec-overlap-conflict'`, an empty array `[]` otherwise.

## Testing

### Unit tests

- `test/domain/entities/change.spec.ts` — add test for `invalidate('spec-overlap-conflict', ...)`:
  - Appends `invalidated` event with correct cause
  - Appends `transitioned` event to `designing`
  - Marks artifacts as `pending-review`
  - Message contains archived change name and spec IDs

- `test/application/use-cases/archive-change.spec.ts` — add tests:
  - `allowOverlap=true` with overlap: overlapping changes are invalidated, result includes `invalidatedChanges`
  - `allowOverlap=true` with overlap: each invalidation uses `ChangeRepository.mutate()`
  - `allowOverlap=true` without overlap: proceeds normally, empty `invalidatedChanges`
  - `allowOverlap=false` with overlap: throws `SpecOverlapError` (existing test, unchanged)
  - `allowOverlap=true` with multiple overlapping changes: all are invalidated

- `test/application/use-cases/get-status.spec.ts` — add tests:
  - Single unhandled `spec-overlap-conflict` invalidation → `review.reason` is `'spec-overlap-conflict'`, `overlapDetail` has one entry
  - Multiple unhandled `spec-overlap-conflict` invalidations → `overlapDetail` has all entries merged, newest-first
  - Overlap scan stops at forward transition boundary — older overlaps excluded
  - Drift + overlap conflict → drift takes priority, `overlapDetail` is `[]`
  - No invalidation → `overlapDetail` is `[]`

### CLI tests

- `test/commands/change/archive.spec.ts` — test text and JSON output with `invalidatedChanges`
- `test/commands/change/status.spec.ts` — test text and JSON output with `spec-overlap-conflict` reason, multiple overlap entries, and empty `overlapDetail` for other reasons

## Open questions

_none_
