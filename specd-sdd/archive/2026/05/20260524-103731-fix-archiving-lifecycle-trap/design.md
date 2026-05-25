# Design: fix-archiving-lifecycle-trap

## Non-goals

- Do not add `.gitignore` entries for `.specd-archive-backup/` — the directory is ephemeral and orphan detection handles leftovers.
- Do not roll back metadata generation failures or post-archive hook failures after a successful archive move.
- Do not make delta application idempotent — batch restore preserves pre-attempt canonical bases instead.
- Do not add transitions from `archiving` to `implementing`, `verifying`, or `done`.
- Do not change overlap invalidation, implementation sidecar materialization, or hook semantics beyond timing and recovery.

## Core principle

Archive commit has a narrow rollback boundary:

```text
archivable
  → guards + hooks + preflight
  → batch snapshot (.specd-archive-backup)
  → transition to archiving
  → publish all specs
  → archive move
  → delete backups            ← commit boundary
  → metadata (best-effort)
  → post-hooks (best-effort)
```

Before the boundary, failures leave the change in `archivable` with no canonical writes. After the boundary starts, failures run batch restore; lifecycle returns to `archivable` only when restore succeeds.

## Affected areas

- `packages/core/src/domain/value-objects/change-state.ts`
  - Extend `VALID_TRANSITIONS['archiving']` to `['archivable', 'designing']`.
  - Callers: lifecycle engine, `Change.transition`, tests · Risk: LOW

- `packages/core/src/application/use-cases/archive-change.ts`
  - Reorder execute flow: remove early archiving transition; add snapshot/restore orchestration; move metadata after archive move; lifecycle rollback in failure handler.
  - Callers: kernel, CLI archive command · Risk: HIGH

- `packages/core/src/application/use-cases/archive-batch-snapshot.ts` (new module, name flexible)
  - Pure orchestration helpers or small class for snapshot, restore, orphan detection, cleanup.
  - Keeps `ArchiveChange.execute()` readable.
  - Risk: MEDIUM

- `packages/core/src/infrastructure/fs/spec-repository.ts` or `archive-batch-snapshot-fs.ts`
  - Filesystem operations: copy pre-existing canonical files, write manifest, restore, delete created files, remove new spec dirs.
  - Reuses existing path confinement helpers from spec repository where possible.
  - Risk: MEDIUM

- `packages/core/src/domain/services/lifecycle-engine.ts`
  - Archiving-state `nextAction` guidance; ensure `archiving → archivable` bypasses workflow requires blockers.
  - Risk: LOW

- `packages/core/src/application/use-cases/transition-change.ts`
  - No structural change expected if `VALID_TRANSITIONS` updated; verify `archiving → archivable` skips target-step requires/hooks.
  - Risk: LOW

- `packages/core/test/domain/value-objects/change-state.spec.ts`
  - Update archiving transition expectations.
  - Risk: LOW

- `packages/core/test/application/use-cases/archive-change.spec.ts`
  - Primary regression surface for timing, restore, metadata ordering, lifecycle rollback.
  - Risk: HIGH

- `packages/core/test/application/use-cases/transition-change.spec.ts`
  - Archiving escape transitions.
  - Risk: LOW

- `packages/core/test/application/use-cases/get-status.spec.ts` (if nextAction assertions exist)
  - Archiving guidance.
  - Risk: LOW

## New constructs

### `ArchiveBatchManifest`

Stored at `<specDir>/.specd-archive-backup/manifest.json`.

```ts
interface ArchiveBatchManifest {
  readonly changeName: string
  readonly specDirExisted: boolean
  readonly existingFiles: readonly string[]
  readonly createdFiles: readonly string[]
}
```

`createdFiles` starts empty at snapshot time and is appended during publication.

### Snapshot / restore API

Introduce a focused helper (module or class) used by `ArchiveChange`:

```ts
interface ArchiveBatchSnapshotPort {
  detectOrphans(specIds: readonly string[], changeName: string): Promise<void>
  snapshot(specId: string, changeName: string): Promise<ArchiveBatchManifest>
  recordCreatedFile(specId: string, relativePath: string): Promise<void>
  restoreBatch(
    specIds: readonly string[],
    publishOrder: readonly string[],
  ): Promise<ArchiveBatchRestoreResult>
  cleanup(specIds: readonly string[]): Promise<void>
}

interface ArchiveBatchRestoreResult {
  readonly restoredSpecIds: readonly string[]
  readonly failedSpecIds: readonly string[]
}
```

Implementation lives in infrastructure (filesystem). `ArchiveChange` owns when each method runs.

### Restore algorithm (per spec)

1. Read manifest from `.specd-archive-backup/manifest.json`.
2. If `!specDirExisted` → delete spec directory if it exists.
3. If `specDirExisted`:
   - For each path in `existingFiles`, copy from backup over canonical path.
   - For each path in `createdFiles` not in `existingFiles`, delete canonical path if present.
4. Remove `.specd-archive-backup/`.

Batch restore iterates `publishOrder` in reverse.

## `ArchiveChange.execute()` reorder

Current early block:

```ts
// REMOVE: mutate + transition('archiving') at start
```

New sequence:

1. Schema guard
2. `assertArchivable()` on loaded change (no mutate)
3. Overlap + readOnly guards
4. Pre-archive hooks
5. Prepare plan + preflight (unchanged semantics)
6. **Orphan detection** across batch spec IDs
7. **Snapshot** each spec; collect manifests and `publishOrder`
8. **`mutate` → transition to `archiving`**
9. **Publish loop** — on each successful publish, append created file paths to manifest (`spec-lock.json`, new artifacts)
10. **`archiveRepository.archive()`**
11. **`cleanup` backups**
12. **Metadata generation** (moved from before step 10)
13. Post-archive hooks

Failure handling:

| Failure point | Restore?           | Lifecycle                                                         |
| ------------- | ------------------ | ----------------------------------------------------------------- |
| Before step 8 | No                 | Stay `archivable`                                                 |
| Steps 8–10    | Yes, reverse order | `→ archivable` if restore OK; stay `archiving` if restore partial |
| After step 11 | No                 | Archived; metadata/post-hook failures reported only               |

`_recordArchiveFailure` remains; add `transition('archivable')` inside mutate when restore succeeds.

## Orphan backup policy

At step 6, for each spec in batch:

- If `.specd-archive-backup/` exists and manifest `changeName` matches → auto-restore, delete backup, throw typed error (`ArchiveOrphanBackupError` or reuse existing archive error family) with repair message.
- If manifest `changeName` differs → throw with repair guide, do not publish.

## Lifecycle engine changes

When `change.state === 'archiving'`:

- `validTransitions` / `availableTransitions` include `archivable` and `designing`.
- `_requestedTargetBlockers` for `archiving → archivable` must not apply workflow-step `requires`.
- `_nextAction`: if latest `archive-failed.commitStarted === true` and restore incomplete (detect via error context or explicit manifest flag on change — prefer reading last `archive-failed.message` pattern or store `restoreIncomplete` on event in implementation), recommend `designing`; else recommend retry archive.

Optional: extend `archive-failed` event with `restoreCompleted: boolean` during implementation if message parsing is too fragile. Spec allows message-only; design prefers explicit boolean if cheap.

## TransitionChange changes

`archiving → archivable`:

- Must not execute target-step pre/post hooks.
- Must not enforce workflow `requires` for `archivable`.

Verify existing `_requestedTargetBlockers` / hook phases — add early exit when `from === 'archiving' && to === 'archivable'`.

`archiving → designing`:

- Existing designing invalidation path applies unchanged.

## Metadata ordering change

Move the persisted metadata loop to after successful archive move and backup cleanup.

Preflight still runs in-memory `extractMetadata` consistency checks — no behavioral change there.

Tests must assert `archiveRepository.archive` is called before `GenerateSpecMetadata.execute`.

## Error types

Prefer reusing archive error family:

- `ArchiveOrphanBackupError` — orphan backup detected (matching or foreign change)
- Extend `ArchiveBatchRestoreError` or use `ArchivePreflightError` variant for partial restore with `restoredSpecIds` / `failedSpecIds` in repair payload

Follow `default:_global/error-handling-conventions` for repair guidance.

## Testing strategy

### Archive timing

- Pre-hook failure → state stays `archivable`, no backup dirs
- Preflight failure → `archivable`, no backup dirs
- Transition occurs after snapshot, before first publish (spy on mutate vs publish call order)

### Batch restore

- Two-spec batch: first publishes, second fails → first restored, retry merges cleanly
- New spec: dir removed on restore
- Existing spec with only new file created: created file deleted, existing file restored from backup
- `spec-lock.json` present pre-archive → restored on failure

### Orphan handling

- Matching orphan → auto-restore + abort
- Foreign orphan → abort with repair message

### Lifecycle

- Successful restore → `archivable`
- Partial restore → stays `archiving`
- `TransitionChange`: `archiving → designing`, `archiving → archivable`

### Metadata

- Generated only after archive move
- Failure leaves change archived, populates `staleMetadataSpecPaths`

## Blast radius

Primary dependents of `ArchiveChange` and `change-state.ts` are CLI archive command, skills, and tests. No CLI contract change. `GetStatus` / `CompileContext` pick up new transitions via `LifecycleEngine` automatically.

Impact analysis on planned files shows MEDIUM risk concentrated in `archive-change.ts` tests and kernel wiring — no CRITICAL hotspots expected.

## Debug logging

The existing `Archive debug logging` requirement already covers prepare-plan and staged publication. This change extends coverage to every step in the reordered flow. Implementation MUST use the existing `Logger.debug` facade with structured context objects (same pattern as current `ArchiveChange` logs).

### Message conventions

Use stable, grep-friendly message prefixes:

| Component                | Prefix                   |
| ------------------------ | ------------------------ |
| `ArchiveChange`          | `ArchiveChange …`        |
| `FsArchiveBatchSnapshot` | `ArchiveBatchSnapshot …` |

Each log MUST include at minimum `change` when a change name is known; add `specId`, `step`, or `phase` when step-scoped.

### Per-step debug events

| Step                  | Component              | Suggested message                                         | Key fields                                      |
| --------------------- | ---------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| 1 Schema guard        | ArchiveChange          | `ArchiveChange passed schema guard`                       | `change`, `schema`                              |
| 2 Archivable guard    | ArchiveChange          | `ArchiveChange passed archivable guard`                   | `change`, `state`                               |
| 3 Overlap guard       | ArchiveChange          | `ArchiveChange overlap guard complete`                    | `change`, `overlapCount`, `invalidatedChanges`  |
| 4 ReadOnly guard      | ArchiveChange          | `ArchiveChange readOnly guard complete`                   | `change`, `specCount`                           |
| 5 Pre-archive hooks   | ArchiveChange          | `ArchiveChange pre-archive hooks started/completed`       | `change`, `phase`, `skipped`                    |
| 6 Prepare plan        | ArchiveChange          | _(existing)_                                              | `publicationCount`, `staleSpecCount`            |
| 7 Preflight           | ArchiveChange          | _(existing)_                                              | `publicationCount`                              |
| 8 Orphan detection    | FsArchiveBatchSnapshot | `ArchiveBatchSnapshot orphan check`                       | `specId`, `outcome`                             |
| 9 Snapshot            | FsArchiveBatchSnapshot | `ArchiveBatchSnapshot snapshot started/completed`         | `specId`, `specDirExisted`, `existingFileCount` |
| 10 Transition         | ArchiveChange          | `ArchiveChange transitioning to archiving`                | `change`, `actor`                               |
| 11 Publish loop       | ArchiveChange          | _(existing start/complete)_                               | `specId`, `artifactCount`                       |
| 11b recordCreatedFile | FsArchiveBatchSnapshot | `ArchiveBatchSnapshot recorded created file`              | `specId`, `relativePath`                        |
| 12 Archive move       | ArchiveChange          | `ArchiveChange archive repository call started/completed` | `change`, `archivedName`                        |
| 13 Cleanup backups    | FsArchiveBatchSnapshot | `ArchiveBatchSnapshot cleanup completed`                  | `specIds`                                       |
| 14 Metadata           | ArchiveChange          | `ArchiveChange metadata generation started/completed`     | `specId`, `skipped`                             |
| 15 Post-hooks         | ArchiveChange          | `ArchiveChange post-archive hooks started/completed`      | `change`, `phase`                               |
| Failure               | ArchiveChange          | _(existing `_recordArchiveFailure`)_                      | `step`, `commitStarted`, `message`              |
| Restore               | FsArchiveBatchSnapshot | `ArchiveBatchSnapshot restore started/completed`          | `restoredSpecIds`, `failedSpecIds`              |
| Lifecycle rollback    | ArchiveChange          | `ArchiveChange lifecycle rollback to archivable`          | `change`, `restoreCompleted`                    |

Do not log full artifact content, hook stderr, or actor email at debug level unless already established elsewhere — name is sufficient.

### Testing

Add log-capture assertions in `archive-change.spec.ts` for at least:

- snapshot + transition ordering visible in debug output
- restore path logs `restoredSpecIds` / `failedSpecIds`
- pre-hook failure produces no snapshot-related debug lines

Use the same test helper pattern as other use cases that assert `Logger.debug` calls (spy on `Logger.debug` module).

## Implementation order (for tasks artifact)

1. Update `VALID_TRANSITIONS` + unit tests
2. Implement snapshot/restore helper with filesystem tests
3. Reorder `ArchiveChange.execute()` and failure handler
4. Adjust `LifecycleEngine` archiving guidance
5. Verify `TransitionChange` hook/requires bypass for `archiving → archivable`
6. Integration tests in `archive-change.spec.ts`
7. Transition/get-status regression tests
8. Debug logging coverage in `ArchiveChange` and `FsArchiveBatchSnapshot`
