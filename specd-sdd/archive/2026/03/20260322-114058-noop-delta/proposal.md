# Proposal: noop-delta

## Motivation

When a change modifies multiple specs but only some require updates to a particular artifact (e.g. `verify.md`), the artifact gets stuck in `in-progress` state, blocking the entire DAG. This is a significant friction point for changes that touch many specs mechanically — most specs only need a requirement change in `spec.md`, but their verify scenarios remain valid.

## Current behaviour

For `scope: spec` artifacts with `delta: true`, the manifest creates one file entry per specId. When a spec doesn't need a delta for a given artifact:

1. No file exists in the change directory (neither `specs/` nor `deltas/`)
2. `_deriveFileStatus` returns `missing`
3. `ValidateArtifacts` skips the file (line 240: `file.status === 'missing'`)
4. `markComplete` is never called — `validatedHash` stays `null`
5. `ChangeArtifact.status` aggregates some `complete` + some `missing` = `in-progress`
6. Downstream artifacts are blocked

Current workarounds are all noisy: create empty no-op delta files manually, remove specs that don't need changes from `specIds`, or draft the change and handle the block manually.

## Proposed solution

Introduce two additions to the delta format:

1. **`op: no-op`** — a new delta operation that explicitly declares "this artifact doesn't need changes for this spec." A `no-op` entry must be the **only** entry in the delta array — if other entries coexist with `no-op`, `parseDelta` must throw a validation error explaining that `no-op` cannot be mixed with other operations. Application produces the base artifact unchanged.

2. **`description`** — an optional field on all `DeltaEntry` values (not just `no-op`) that documents what the delta does or why. Ignored during application.

The `no-op` delta resolves the issue naturally: the delta file exists on disk, so it's not `missing`; `ValidateArtifacts` parses it and recognizes the `no-op` — it skips `deltaValidations` and delta application, uses the base content for structural validation, and calls `markComplete`. The artifact file becomes `complete`.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/delta-format`: Add `no-op` as a fourth operation with exclusivity constraint — `parseDelta` must reject deltas that mix `no-op` with other operations, reporting a clear error. Add `description` as an optional field on `DeltaEntry`. Define `applyDelta` behaviour for `no-op` (return base AST unchanged).
- `core:core/artifact-parser-port`: Update `DeltaEntry` shape to include `'no-op'` in the `op` union type and add `description?: string`.
- `core:core/validate-artifacts`: When a delta contains only `no-op` entries, skip `deltaValidations` and delta application — use the base artifact content for structural validation and `markComplete`.

## Impact

- **Domain types**: `DeltaEntry` interface gains `'no-op'` in `op` union + `description` field
- **Parsing**: `deltaEntrySchema` (Zod) in `yaml-parser.ts` — add `'no-op'` to enum, add `description`, add exclusivity validation
- **Application**: `applyDelta` in `apply-delta.ts` — handle `no-op` entries (return cloned base AST)
- **Validation**: `ValidateArtifacts` use case — detect `no-op` deltas and skip `deltaValidations` + application
- **Instructions**: All 4 parser `deltaInstructions()` methods + `schema-std/schema.yaml` `deltaInstruction` fields — document `no-op` and `description`
- **No changes** to `_deriveFileStatus`, `effectiveStatus`, `FsChangeRepository.scaffold`, or the state machine

## Open questions

_(none — the approach was explored and agreed upon before creating this change)_
