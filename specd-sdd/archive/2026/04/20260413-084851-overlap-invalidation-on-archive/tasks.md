## 1. Domain: extend invalidation cause

- [x] 1.1 Add `'spec-overlap-conflict'` to `InvalidatedEvent.cause` union type
      `packages/core/src/domain/entities/change.ts`: `InvalidatedEvent` — add `'spec-overlap-conflict'` to the cause union
      Approach: the union is at line 70; add `| 'spec-overlap-conflict'` to the existing three-value union. `Change.invalidate()` already accepts `InvalidatedEvent['cause']` so no method changes needed.
      (Req: History and event sourcing)

## 2. Application: ArchiveChange overlap invalidation

- [x] 2.1 Add `InvalidatedChangesEntry` interface and `invalidatedChanges` field to result
      `packages/core/src/application/use-cases/archive-change.ts`: `InvalidatedChangesEntry`, `ArchiveChangeResult` — add interface and new field
      Approach: define `InvalidatedChangesEntry` with `name: string` and `specIds: readonly string[]`; add `invalidatedChanges: readonly InvalidatedChangesEntry[]` to `ArchiveChangeResult`; initialize as empty array in execute
      (Req: Result shape)

- [x] 2.2 Implement overlap invalidation when `allowOverlap=true`
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` overlap guard section (lines 152-166) — replace the skip-with-no-op branch with invalidation logic
      Approach: when `allowOverlap=true` and overlap exists, iterate overlapping entries; for each unique overlapping change name, call `ChangeRepository.mutate()` with a callback that calls `change.invalidate('spec-overlap-conflict', SYSTEM_ACTOR, message, affectedArtifacts)`; build message as `"Invalidated because change '<archivedName>' was archived with overlapping specs: <specIds>"`; collect results into `invalidatedChanges`; import `SYSTEM_ACTOR` from `change.ts`
      (Req: Overlap guard)

## 3. Application: GetStatus overlap reason

- [x] 3.1 Extend `ReviewSummary` type with `'spec-overlap-conflict'` and `overlapDetail` array
      `packages/core/src/application/use-cases/get-status.ts`: `ReviewSummary` — extend `reason` type and add `overlapDetail` field
      Approach: extend `reason` type to `'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null`; add `OverlapEntry` interface with `archivedChangeName: string` and `overlappingSpecIds: readonly string[]`; add `overlapDetail: readonly OverlapEntry[]` to `ReviewSummary` (always present, empty array when not applicable)
      (Req: Returns lifecycle context)

- [x] 3.2 Derive `'spec-overlap-conflict'` reason from merged unhandled overlap history
      `packages/core/src/application/use-cases/get-status.ts`: review derivation logic (lines 287-323) — add spec-overlap-conflict check after drift check with merged history scan
      Approach: after checking for drift (priority 1), scan `change.history` in reverse collecting `invalidated` events with `cause: 'spec-overlap-conflict'`; stop the scan at the first `transitioned` event whose `to` is not `'designing'` (the forward-transition boundary); parse each collected event's message to build `OverlapEntry` objects; if any unhandled overlaps exist and files are in `pending-review`, set reason to `'spec-overlap-conflict'` and populate `overlapDetail` with the entries ordered newest-first; otherwise fall through to `'artifact-review-required'`
      (Req: Returns lifecycle context)

## 4. CLI: archive output

- [x] 4.1 Report invalidated changes in text and JSON output
      `packages/cli/src/commands/change/archive.ts`: action handler — add invalidated changes reporting after archive path
      Approach: after printing archive path in text mode, check if `result.invalidatedChanges.length > 0`; if so, print `"invalidated N overlapping changes:"` with each change name and specs; in JSON mode, include `invalidatedChanges` array in output object
      (Req: Output on success)

## 5. CLI: status output

- [x] 5.1 Display `'spec-overlap-conflict'` reason and merged overlap entries in text mode
      `packages/cli/src/commands/change/status.ts`: text output section — extend review section rendering
      Approach: when `review.reason === 'spec-overlap-conflict'`, add `overlap:` subsection listing each `OverlapEntry` as a bullet (`- archived: <name>, specs: <ids>`); entries are already ordered newest-first from `GetStatus`; no changes needed for other reasons
      (Req: Output format)

- [x] 5.2 Include `overlapDetail` array in JSON output
      `packages/cli/src/commands/change/status.ts`: JSON output section — add `overlapDetail` to review object
      Approach: add `overlapDetail: review?.overlapDetail ?? []` to the JSON `review` object; always present as array — non-empty when `reason` is `'spec-overlap-conflict'`, empty array otherwise
      (Req: Output format)

## 6. Tests

- [x] 6.1 Add domain test for `invalidate('spec-overlap-conflict')`
      `packages/core/test/domain/entities/change.spec.ts`: new test block — verify new cause appends correct events and marks artifacts
      Approach: create a change in `implementing` state, call `invalidate('spec-overlap-conflict', actor, message, affectedArtifacts)`, assert `invalidated` event cause, `transitioned` event to `designing`, and artifact states
      (Req: History and event sourcing, Scenario: Overlap conflict invalidation)

- [x] 6.2 Add ArchiveChange test for overlap invalidation
      `packages/core/test/application/use-cases/archive-change.spec.ts`: new describe block — verify invalidation of overlapping changes
      Approach: create two changes targeting the same spec, archive one with `allowOverlap: true`, assert the other is invalidated to `designing` with cause `'spec-overlap-conflict'`, and result includes `invalidatedChanges`
      (Req: Overlap guard, Scenario: Archive with allowOverlap invalidates overlapping changes)

- [x] 6.3 Add GetStatus test for `'spec-overlap-conflict'` reason with merged overlap history
      `packages/core/test/application/use-cases/get-status.spec.ts`: new test block — verify reason derivation and merged overlapDetail
      Approach: test four cases — (a) single unhandled invalidation → one overlapDetail entry; (b) two unhandled invalidations from different changes → two entries newest-first; (c) scan stops at forward transition boundary → older overlaps excluded; (d) drift + overlap → drift takes priority, overlapDetail is `[]`
      (Req: Returns lifecycle context, Scenario: Overlap detail merges multiple unhandled invalidations)

- [x] 6.4 Add CLI archive test for invalidated changes output
      `packages/cli/test/commands/change/archive.spec.ts`: new test block — verify text and JSON output format
      Approach: mock `ArchiveChange` to return `invalidatedChanges` with entries, assert text output contains "invalidated" section and JSON output contains the array
      (Req: Output on success, Scenario: Text output shows invalidated changes)

- [x] 6.5 Add CLI status test for `'spec-overlap-conflict'` reason display with multiple entries
      `packages/cli/test/commands/change/status.spec.ts`: new test block — verify text and JSON overlap detail with merged entries
      Approach: mock `GetStatus` to return `review.reason: 'spec-overlap-conflict'` with multiple `overlapDetail` entries, assert text output shows multiple bullets and JSON includes full array; also test empty array for non-overlap reasons
      (Req: spec-overlap-conflict review reason display, Scenario: Text output shows overlap entries)
