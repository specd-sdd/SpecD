# Tasks: fix-archiving-lifecycle-trap

## 1. Lifecycle transitions

- [x] 1.1 Extend archiving escape transitions in VALID_TRANSITIONS
      `packages/core/src/domain/value-objects/change-state.ts`: `VALID_TRANSITIONS` — set `archiving: ['archivable', 'designing']`
      Approach: update the map entry only; keep `isValidTransition` unchanged
      (Req: Archiving escape transitions, Transition from archiving to archivable)

- [x] 1.2 Update change-state unit tests
      `packages/core/test/domain/value-objects/change-state.spec.ts`: archiving transition tests — expect `archivable` and `designing`; reject `implementing`
      Approach: replace "archiving has no valid transitions" assertions with positive/negative cases
      (Req: Archiving escape transitions)

## 2. Batch snapshot infrastructure

- [x] 2.1 Define snapshot port and manifest types
      `packages/core/src/application/ports/archive-batch-snapshot.ts` (new): `ArchiveBatchManifest`, `ArchiveBatchSnapshotPort`, `ArchiveBatchRestoreResult`
      Approach: mirror design interfaces; port lives in application layer, no fs imports
      (Req: Batch canonical snapshot before publication, Batch canonical restore on commit failure)

- [x] 2.2 Implement filesystem snapshot adapter
      `packages/core/src/infrastructure/fs/archive-batch-snapshot.ts` (new): `FsArchiveBatchSnapshot` — snapshot, recordCreatedFile, restoreBatch, cleanup, detectOrphans
      Approach: write `.specd-archive-backup/manifest.json`; copy pre-existing canonical files including `spec-lock.json`; restore in reverse publish order; delete only `createdFiles` not in `existingFiles`; remove entire spec dir when `specDirExisted === false`
      (Req: Batch canonical snapshot before publication, Batch canonical restore on commit failure, Orphan archive backup detection)

- [x] 2.3 Add typed archive errors for orphan and partial restore
      `packages/core/src/domain/errors/archive-orphan-backup-error.ts` (new), optionally `archive-batch-restore-error.ts`: repair payloads with spec IDs
      Approach: extend `SpecdError` family per error-handling conventions; include restored vs failed spec lists for partial restore
      (Req: Orphan archive backup detection, Batch canonical restore on commit failure)

- [x] 2.4 Wire snapshot port in archive composition
      `packages/core/src/composition/use-cases/archive-change.ts`: `createArchiveChange()` — inject `FsArchiveBatchSnapshot` (or factory) into `ArchiveChange`
      Approach: construct adapter with spec repo map + workspace routes; pass as new constructor dependency
      (Req: Batch canonical snapshot before publication)

- [x] 2.5 Add filesystem unit tests for snapshot/restore
      `packages/core/test/infrastructure/fs/archive-batch-snapshot.spec.ts` (new): new spec dir removal, existing spec created-file-only cleanup, spec-lock restore, orphan detect
      Approach: temp spec dirs with real files; assert canonical tree before/after restore
      (Req: Batch canonical restore on commit failure, Orphan archive backup detection)

- [x] 2.6 Add debug logging to snapshot adapter
      `packages/core/src/infrastructure/fs/archive-batch-snapshot.ts`: orphan check, snapshot start/complete, recordCreatedFile, restore start/complete, cleanup — use `ArchiveBatchSnapshot` message prefix and structured fields per design
      Approach: inject no logger port; use existing `Logger.debug` static facade like `ArchiveChange`
      (Req: Archive debug logging)

## 3. ArchiveChange reorder

- [x] 3.1 Remove early archiving transition
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` — delete initial `mutate` block that transitions to `archiving`; call `assertArchivable()` on loaded change without persisting transition
      Approach: keep actor resolution; guards/hooks/preflight run while state remains `archivable`
      (Req: Archivable guard, Deferred transition to archiving, Pre-archive hooks)

- [x] 3.2 Insert orphan detection and batch snapshot before commit
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` after preflight — call `detectOrphans`, then `snapshot` for each spec; collect `publishOrder`
      Approach: run before any `mutate` to `archiving`; abort on orphan policy (auto-restore + throw for matching changeName)
      (Req: Orphan archive backup detection, Batch canonical snapshot before publication)

- [x] 3.3 Defer transition and publish with createdFiles tracking
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` — `mutate` → `transition('archiving')` immediately before publish loop; after each successful `publish`, call `recordCreatedFile` for new artifacts and `spec-lock.json`
      Approach: compare pre-snapshot `existingFiles` vs published outputs to populate `createdFiles`
      (Req: Deferred transition to archiving, Batch canonical snapshot before publication)

- [x] 3.4 Move metadata generation after archive move
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` — relocate metadata loop to after `archiveRepository.archive()` and backup `cleanup`
      Approach: preflight in-memory extraction unchanged; only persisted `GenerateSpecMetadata` + `SaveSpecMetadata` move post-archive
      (Req: Spec metadata generation, Archive repository call)

- [x] 3.5 Implement commit failure restore and lifecycle rollback
      `packages/core/src/application/use-cases/archive-change.ts`: `_recordArchiveFailure` / catch blocks — on publish/archive failure call `restoreBatch`; on full restore success `mutate` → `transition('archivable')`; on partial restore stay in `archiving`
      Approach: set `commitStarted: true` on `archive-failed`; optionally add `restoreCompleted: boolean` to event payload
      (Req: Lifecycle rollback after failed commit, Batch canonical restore on commit failure)

- [x] 3.6 Delete backups only after successful archive move
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` — call `cleanup(specIds)` after successful `archiveRepository.archive()`
      Approach: also cleanup after successful restore on failure path
      (Req: Batch canonical restore on commit failure, Archive repository call)

- [x] 3.7 Add debug logging across reordered archive steps
      `packages/core/src/application/use-cases/archive-change.ts`: guards, orphan/snapshot orchestration, deferred transition, archive move, metadata, post-hooks, lifecycle rollback — extend existing `Logger.debug` calls; do not remove current prepare/publish/failure logs
      Approach: one debug line at step boundary with stable message prefix `ArchiveChange`; include `change`, `specId`, `step`, `phase` as applicable
      (Req: Archive debug logging)

## 4. Lifecycle engine and transitions

- [x] 4.1 Bypass workflow requires for archiving → archivable
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_requestedTargetBlockers` / transition blocker logic — skip workflow `requires` when `from === 'archiving' && to === 'archivable'`
      Approach: treat as lifecycle recovery, not workflow step entry
      (Req: Archiving escape transitions in lifecycle verdict)

- [x] 4.2 Add archiving-state nextAction guidance
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_nextAction()` — when state is `archiving`, recommend retry archive or `designing` based on latest `archive-failed` / restore outcome
      Approach: inspect last `archive-failed` event; if `commitStarted && !restoreCompleted` recommend designing escape
      (Req: Available steps and next action, Archiving escape transitions in lifecycle verdict)

- [x] 4.3 Skip hooks and requires for archiving → archivable in TransitionChange
      `packages/core/src/application/use-cases/transition-change.ts`: `execute()` — early path for `from === 'archiving' && to === 'archivable'` that delegates directly to `change.transition` without target-step hooks
      Approach: mirror designing invalidation skip pattern; no workflow step lookup for archivable target
      (Req: Transition from archiving to archivable, Transition to designing from any state)

## 5. Integration tests

- [x] 5.1 Archive timing regression tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: pre-hook failure stays `archivable`; transition after snapshot before publish; invert "transitions before pre-hooks" test
      Approach: spy `mutate` call order vs `publish` and hook execution; assert no `.specd-archive-backup` on pre-hook failure
      (Req: Pre-archive hooks, Deferred transition to archiving)

- [x] 5.2 Batch restore regression tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: multi-spec partial failure restores first spec; new spec dir removed; created-file-only cleanup; delta retry idempotency
      Approach: use real temp spec repos; fail second `publish`; assert first spec content matches pre-attempt snapshot
      (Req: Batch canonical restore on commit failure)

- [x] 5.3 Metadata-after-archive and lifecycle rollback tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: assert `archive` called before `generateMetadata`; successful restore → `archivable`; partial restore → `archiving`
      Approach: mock/spy ordering; inspect persisted change state after thrown errors
      (Req: Spec metadata generation, Lifecycle rollback after failed commit)

- [x] 5.4 Orphan backup tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: matching orphan auto-restores and aborts; foreign orphan aborts with repair message
      Approach: seed `.specd-archive-backup/manifest.json` on disk before execute
      (Req: Orphan archive backup detection)

- [x] 5.5 TransitionChange archiving escape tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: `archiving → archivable` without hooks; `archiving → designing` with artifact downgrade
      Approach: build change in `archiving` via history events; execute transitions
      (Req: Transition from archiving to archivable, Transition to designing from any state)

- [x] 5.6 LifecycleEngine archiving verdict tests
      `packages/core/test/application/use-cases/get-status.spec.ts` or new lifecycle-engine spec tests: validTransitions include escape targets; incomplete restore recommends designing
      Approach: evaluate engine directly or via GetStatus with change fixtures
      (Req: Archiving escape transitions in lifecycle verdict)

- [x] 5.7 Archive debug logging regression tests
      `packages/core/test/application/use-cases/archive-change.spec.ts`: spy `Logger.debug` — assert snapshot/transition ordering in logs; restore logs restored vs failed spec IDs; pre-hook failure emits no snapshot debug lines
      Approach: reuse existing logger spy patterns from core tests if present; otherwise module mock on `../logger.js`
      (Req: Archive debug logging)
