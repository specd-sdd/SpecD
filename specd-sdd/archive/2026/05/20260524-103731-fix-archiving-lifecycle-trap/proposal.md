# Proposal: fix-archiving-lifecycle-trap

## Motivation

A change that enters `archiving` cannot transition to any other lifecycle state, yet archive frequently fails before completion (hooks, guards, preflight, publish). Operators are left stuck with no recovery path except retrying archive, and even pre-hook failures trap the change in `archiving` despite no files being modified.

When a multi-spec archive partially publishes and is retried, delta merges run against an already-merged base — producing duplicated or corrupted content. The system has per-spec publish atomicity but no batch-level compensation.

## Current behaviour

`VALID_TRANSITIONS['archiving']` is empty — a dead end for `TransitionChange` and `LifecycleEngine`.

`ArchiveChange.execute()` transitions `archivable → archiving` as its first persisted mutation, before overlap/readOnly guards, pre-archive hooks, and preflight. Any failure in those steps leaves the change in `archiving` with normal lifecycle transitions unavailable.

`_recordArchiveFailure` appends an `archive-failed` event but does not roll back state or canonical spec files. Failures before prepare/commit (overlap, readOnly, hooks) do not even record `archive-failed`.

`SpecRepository.publish()` is atomic per spec (staging + swap), but once spec A completes, its temporary backup is discarded. If spec B fails, spec A remains merged. Retrying archive re-applies deltas on top of the already-merged base.

`metadata.json` generation currently runs **after publish but before** `archiveRepository.archive()`. It is best-effort and does not abort archive. Post-archive hooks run after the archive move; their failures are collected, not rolled back.

## Proposed solution

Three coordinated fixes:

### 1. Defer the lifecycle transition

Keep the change in `archivable` through schema guard, overlap/readOnly guards, pre-archive hooks, and full-batch preflight. Transition to `archiving` only immediately before canonical publication, inside a serialized `ChangeRepository.mutate` after preflight succeeds.

Pre-archive hooks continue to use workflow step `'archiving'`; they do not require lifecycle state `archiving`.

### 2. Add escape transitions

Extend `VALID_TRANSITIONS` so `archiving` may transition to `archivable` and `designing`.

- **`archiving → archivable`**: automatic after pre-commit failures, and after commit-phase failures once batch restore completes successfully.
- **`archiving → designing`**: manual escape when spec/delta revision is required, or when batch restore itself fails.

Transitions to `implementing`, `verifying`, or `done` from `archiving` remain excluded.

### 3. Batch backup and restore at commit time

Before the first `publish` in an archive attempt, snapshot every spec in the batch. On any commit-phase failure (publish or archive move), restore canonical storage to the pre-attempt state, then roll lifecycle back to `archivable`. On commit success, delete all snapshots.

#### Backup location

Inside each affected spec directory:

```text
specs/<workspace>/<capability-path>/.specd-archive-backup/
  manifest.json
  …copies of pre-existing canonical files…
```

Temporary directory only — no `.gitignore` entry required; presence after a failed attempt is exceptional and handled by orphan detection.

#### What to snapshot

For each spec in the archive batch, before any publish in this attempt:

1. Record whether the canonical spec directory **already existed**.
2. Record which canonical artifact paths **already existed** — including `spec-lock.json` when present.
3. Copy every **pre-existing** canonical file (including `spec-lock.json`) into `.specd-archive-backup/`.
4. Write `manifest.json` with at least:
   - `changeName`
   - `specDirExisted: boolean`
   - `existingFiles: string[]` — paths that existed before this attempt
   - `createdFiles: string[]` — populated as publish proceeds; paths created during this attempt

**Out of scope for backup:** `.specd/metadata/.../metadata.json` — generated output, not part of the commit contract.

#### Restore rules (on commit-phase failure)

Restore must undo **only what this archive attempt changed**, never collateral damage to pre-existing files:

| Case                                                                                     | Restore action                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Spec dir **did not exist** before attempt; dir was **created**                           | Remove the entire spec directory                                                                                      |
| Spec dir **existed** before attempt                                                      | Restore each file listed in `existingFiles` from `.specd-archive-backup/` (including `spec-lock.json` when backed up) |
| Files **created during** this attempt (listed in `createdFiles`, not in `existingFiles`) | Delete those files only                                                                                               |
| Pre-existing files **not touched** by this attempt                                       | Leave unchanged                                                                                                       |

Critical invariant: never delete or overwrite pre-existing canonical files that were not part of this attempt's writes.

#### Rollback boundary

Commit-phase rollback covers **publish + archive move** only. Once the change is archived and backups are deleted, the operation is committed:

| Phase                               | On failure                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| Pre-commit (hooks, preflight)       | Stay in `archivable`; no snapshot                           |
| Publish or archive move             | Restore batch → `archive-failed` → `archiving → archivable` |
| Metadata generation (after archive) | No restore; report in `staleMetadataSpecPaths`              |
| Post-archive hooks                  | No restore; report in `postHookFailures`                    |

#### Commit-phase flow

```text
preflight OK
  → snapshot all specs (.specd-archive-backup + manifest)
  → transition archivable → archiving
  → publish each spec (track createdFiles; spec-lock included in publish)
  → move change to archive
  → delete all .specd-archive-backup/          ← rollback boundary ends here
  → generate metadata.json (best-effort)
  → post-archive hooks (failures collected)
```

**Ordering change:** move `metadata.json` generation to **after** `archiveRepository.archive()`, not before. Preflight still validates metadata-extraction consistency in memory; only the persisted `metadata.json` write moves post-archive.

## Specs affected

### New specs

None.

### Modified specs

- `core:change`: Document `archiving` in the lifecycle table; define escape transitions; clarify rollback boundary (no lifecycle rollback after successful archive move).
  - Depends on (added): none

- `core:archive-change`: Defer transition timing; batch snapshot/restore via `.specd-archive-backup`; manifest and restore invariants; move persisted `metadata.json` generation after archive move; auto lifecycle rollback after successful restore only.
  - Depends on (added): none

- `core:lifecycle-engine`: Expose `archivable` and `designing` as valid/available transitions from `archiving`; actionable `nextAction` when stuck after failed archive.
  - Depends on (added): none

- `core:transition-change`: Permit transitions from `archiving` to `archivable` and `designing`.
  - Depends on (added): none

## Impact

- `packages/core/src/domain/value-objects/change-state.ts` — `VALID_TRANSITIONS['archiving']`
- `packages/core/src/application/use-cases/archive-change.ts` — transition timing; snapshot/restore; metadata ordering; failure handler
- `packages/core/src/infrastructure/fs/spec-repository.ts` (or dedicated snapshot helper) — copy/restore/delete `.specd-archive-backup`
- `packages/core/src/domain/services/lifecycle-engine.ts` — transitions and nextAction from `archiving`
- Tests: batch partial-failure restore, new-spec dir removal, created-file-only cleanup, delta retry idempotency, metadata-after-archive ordering, lifecycle rollback

No CLI contract changes required.

## Technical context

- Early transition to `archiving` was introduced for concurrency serialization (`serialize-change-mutations`, April 2026). The commit-boundary `mutate` before publish preserves that intent without trapping on hook failures.
- Per-spec `publish()` staging remains; batch backup is an additional cross-spec compensation layer.
- Delta re-merge duplication (issue `#55`) is addressed by restoring pre-attempt canonical state, not by making delta application idempotent.
- Related broader hardening in `harden-archive-reload-consistency` (manifest reload, validation chokepoints) remains separate unless design discovers overlap.

## Decisions

| Topic                               | Decision                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orphan `.specd-archive-backup/`** | If found at archive start and `manifest.changeName` matches → auto-restore, then abort with message to review and retry. If `changeName` differs → abort with repair guide.                 |
| **Restore failure mid-batch**       | Stay in `archiving`; no auto `→ archivable`. Surface critical repair guide listing restored vs failed specs. Manual escape: `archiving → designing` only. Restore in reverse publish order. |
| **`.gitignore`**                    | Not required — temporary directory; orphan handling covers exceptional leftovers.                                                                                                           |
| **`metadata.json` timing**          | Persist **after** archive move. Not part of rollback. Preflight consistency checks remain in-memory before publish.                                                                         |
| **Post-archive hooks**              | No rollback (unchanged). Failures collected in `postHookFailures`.                                                                                                                          |
| **`spec-lock.json` in backup**      | Yes — included in snapshot when pre-existing; restored on failure.                                                                                                                          |

## Open questions

None — all resolved.
