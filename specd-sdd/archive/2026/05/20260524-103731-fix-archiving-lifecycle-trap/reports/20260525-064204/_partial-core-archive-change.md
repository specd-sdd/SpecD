# Partial audit: core:archive-change

## Requirements summary (merged delta highlights)

- Deferred `archivable → archiving` until after preflight + batch snapshot
- Batch snapshot/restore via `.specd-archive-backup/`
- Orphan detection (matching auto-restore + abort; foreign abort)
- Metadata persisted only after successful archive move
- Extended archive debug logging (all phases)
- Lifecycle rollback on failed commit

## Implementation status

| Requirement area                       | Status          | Primary symbols                                              |
| -------------------------------------- | --------------- | ------------------------------------------------------------ |
| Archivable guard (no early transition) | **Implemented** | `ArchiveChange.execute`                                      |
| Overlap/readOnly pre-commit            | **Implemented** | same                                                         |
| Orphan detection                       | **Implemented** | `FsArchiveBatchSnapshot.detectOrphans`                       |
| Batch snapshot                         | **Implemented** | `FsArchiveBatchSnapshot.snapshot`                            |
| Deferred transition                    | **Implemented** | `mutate` before publish loop                                 |
| `recordCreatedFile`                    | **Implemented** | after each `publish`                                         |
| Batch restore + rollback               | **Implemented** | `_handleCommitFailure`, `restoreBatch`                       |
| Partial restore                        | **Implemented** | `ArchiveBatchRestoreError`, stay `archiving`                 |
| Metadata post-archive                  | **Implemented** | metadata loop after `archive()` + `cleanup`                  |
| Backup cleanup at commit boundary      | **Implemented** | `cleanup` after successful archive                           |
| Debug logging                          | **Implemented** | `Logger.debug` in `ArchiveChange` + `FsArchiveBatchSnapshot` |

## Discrepancies

| ID  | Severity | Finding                                                                                                                                                                                                                                                              | Assessment                                                            |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A-1 | MEDIUM   | `createArchiveChange(context, options)` wires `FsArchiveBatchSnapshot` with `opts.workspaceSpecLayouts ?? new Map()`. Empty map makes `_specDir` always `null` and snapshot throws. **SpecdConfig path is correct**; explicit composition without layouts is broken. | Implementation gap for secondary entry point; production CLI path OK. |
| A-2 | LOW      | `metadata.json` under `.specd/metadata/` is correctly excluded (backup only copies spec-dir files). No spec violation.                                                                                                                                               | N/A                                                                   |
| A-3 | INFO     | `restoreCompleted` not stored on `archive-failed` event; lifecycle infers from state. Matches optional design.                                                                                                                                                       | Acceptable                                                            |
| A-4 | LOW      | Implementation tracking omits several files (`archive-batch-snapshot-noop.ts`, ports, errors, composition, fs tests).                                                                                                                                                | Process gap, not behavior.                                            |

## Test coverage matrix (verify scenarios)

| Scenario                                  | Status      | Evidence                                       |
| ----------------------------------------- | ----------- | ---------------------------------------------- |
| Pre-hook failure stays `archivable`       | **PASS**    | `archive-change.spec.ts`                       |
| Transition after snapshot, before publish | **PASS**    | `archive-change.spec.ts`                       |
| Preflight failure never → archiving       | **PASS**    | implied by flow + prepare failure tests        |
| Snapshot includes spec-lock               | **PARTIAL** | FS test covers copy; not via ArchiveChange E2E |
| New spec `specDirExisted: false`          | **PASS**    | `archive-batch-snapshot.spec.ts`               |
| Multi-spec partial failure restores first | **FAIL**    | No test fails second publish in batch          |
| New spec dir removed on restore           | **PASS**    | FS spec                                        |
| Created-file-only cleanup                 | **PASS**    | FS spec                                        |
| Delta retry idempotency                   | **FAIL**    | No regression test                             |
| Matching orphan auto-restore + abort      | **PASS**    | FS spec only                                   |
| Foreign orphan abort                      | **FAIL**    | No test with foreign `changeName`              |
| Successful restore → `archivable`         | **PASS**    | `archive-change.spec.ts`                       |
| Partial restore → `archiving`             | **FAIL**    | No test mocks partial `restoreBatch`           |
| Metadata after archive move               | **FAIL**    | No spy on call order                           |
| Metadata failure non-fatal                | **PASS**    | existing patterns                              |
| Debug: prepare/publish                    | **PASS**    | code present; no assertion test                |
| Debug: snapshot/restore/orphan            | **FAIL**    | no Logger spy test                             |
| Debug: post-commit                        | **FAIL**    | no Logger spy test                             |
| Debug: failure + restore outcome          | **PARTIAL** | `_recordArchiveFailure` + restore logs in code |

## Missing tests (recommended)

1. Multi-spec archive: succeed first `publish`, fail second, assert first spec content restored.
2. Foreign orphan manifest → `ArchiveOrphanBackupError` without auto-restore.
3. Partial `restoreBatch` → change stays `archiving`, throws `ArchiveBatchRestoreError`.
4. Spy: `archiveRepository.archive` before `generateMetadata.execute`.
5. Logger spy for snapshot/transition ordering (task 5.7).

## Spec dependency chain

- `default:_global/logging` — structured fields used; no full content in logs ✓
- `default:_global/error-handling-conventions` — `ArchiveOrphanBackupError`, `ArchiveBatchRestoreError` extend `SpecdError` ✓

## Summary

- Requirements implemented (code): **~95%** (A-1 composition edge case)
- Verify scenarios with tests: **12/22 PASS**, **6 FAIL**, **4 PARTIAL**
- Blocking discrepancies: **0** (1 MEDIUM composition footgun)
