# Spec Compliance Audit — change `fix-archiving-lifecycle-trap`

**Date:** 2026-05-25  
**Mode:** change (`--change fix-archiving-lifecycle-trap`)  
**State:** `verifying`  
**Graph:** stale (diagnostics best-effort; 1935 core tests PASS at audit time)

## Executive summary

| Metric                                | Value                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Specs in scope                        | 4 (`core:change`, `core:archive-change`, `core:lifecycle-engine`, `core:transition-change`) |
| Code requirements (implementation)    | **Pass** — core behavior matches merged deltas                                              |
| Verify scenarios with automated tests | **12 pass / 6 missing / 4 partial** (archive-change heavy)                                  |
| Blocking issues                       | **0**                                                                                       |
| Should-fix before archive             | **1 MEDIUM**, **6 LOW** test/process gaps                                                   |

**Verdict:** Implementation is **fit to merge** from a behavior standpoint. The main gap is **test coverage** for multi-spec restore, orphan edge cases, metadata ordering assertions, and debug-log verification — not missing production logic.

---

## Aggregated findings

### Blocking (0)

_none_

### Should fix (1)

| ID  | Spec                | Severity   | Issue                                                                                                                                                                                                                        | Recommendation                                                                                       |
| --- | ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A-1 | core:archive-change | **MEDIUM** | `createArchiveChange(context, FsArchiveChangeOptions)` builds `FsArchiveBatchSnapshot` with empty layouts when `workspaceSpecLayouts` omitted → snapshot throws at runtime. CLI/SpecdConfig path supplies layouts correctly. | Require `workspaceSpecLayouts` in options type or derive from `specRepositories` / workspace config. |

### Nice to have (9)

| ID  | Area                   | Issue                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------- |
| A-4 | Process                | Implementation links incomplete (noop, ports, errors, tests not tracked). |
| C-1 | core:change            | No integration test: `archiving → designing` with artifact downgrade.     |
| T-1 | core:transition-change | Verify scenario for designing downgrade untested.                         |
| —   | archive-change         | Multi-spec partial publish failure + restore (verify scenario).           |
| —   | archive-change         | Foreign orphan backup abort (verify scenario).                            |
| —   | archive-change         | Partial restore leaves `archiving` (verify scenario).                     |
| —   | archive-change         | Metadata generated only after `archive()` (spy test).                     |
| —   | archive-change         | Delta retry idempotency after restore (verify scenario).                  |
| —   | archive-change         | Debug logging scenarios (Logger spy — task 5.7).                          |

### Informational (1)

| ID  | Note                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1 | Lifecycle infers incomplete restore via `commitStarted` + state `archiving` instead of explicit `restoreCompleted` on event — acceptable per design. |

---

## Per-spec rollup

| Spec                   | Impl          | Tests    | Discrepancies |
| ---------------------- | ------------- | -------- | ------------- |
| core:change            | ✓             | Mostly ✓ | 0 blocking    |
| core:transition-change | ✓             | 1 gap    | 0 blocking    |
| core:lifecycle-engine  | ✓             | ✓        | 0 blocking    |
| core:archive-change    | ✓ (1 footgun) | 6 gaps   | A-1 MEDIUM    |

---

## Detailed findings

<!-- verbatim partials -->

# Partial audit: core:change, core:transition-change, core:lifecycle-engine

## core:change

### Requirements summary (delta)

- `Archiving escape transitions`: `archiving` → `archivable` | `designing`; reject `implementing`
- `Archive outcome history`: `archive-failed` diagnostics; rollback to `archivable` on successful restore; stay `archiving` on partial restore

### Implementation status

| Requirement                     | Status          | Code                                               |
| ------------------------------- | --------------- | -------------------------------------------------- |
| Escape transitions in graph     | **Implemented** | `change-state.ts` `VALID_TRANSITIONS['archiving']` |
| Transition to archivable        | **Implemented** | `transition-change.ts` recovery path               |
| Transition to designing         | **Implemented** | existing invalidation path                         |
| Reject implementing             | **Implemented** | `isValidTransition`                                |
| Rollback to archivable          | **Implemented** | `archive-change.ts` `_handleCommitFailure`         |
| Partial restore stays archiving | **Implemented** | throws `ArchiveBatchRestoreError`, no transition   |

### Discrepancies

| ID  | Severity | Finding                                                                                                                                                          | Spec vs code                           |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| C-1 | LOW      | `TransitionChange` success for `archiving → designing` with artifact downgrade is not covered by an integration test (only `change-state` unit tests for graph). | Verify scenario exists; test gap only. |

### Test coverage

| Scenario                          | Covered                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| Archiving → archivable            | YES — `transition-change.spec.ts`                                          |
| Archiving → designing             | PARTIAL — graph only; no downgrade assertion                               |
| Archiving → implementing rejected | YES — `change-state.spec.ts`                                               |
| Successful restore → archivable   | YES — `archive-change.spec.ts` (publish failure)                           |
| Failed restore → archiving        | PARTIAL — logic in `_handleCommitFailure`; no test forcing partial restore |

---

## core:transition-change

### Requirements summary (delta)

- `Transition from archiving to archivable`: no hooks, no workflow `requires`
- `Transition to designing from any state`: includes `archiving`

### Implementation status

| Requirement                             | Status          | Code                        |
| --------------------------------------- | --------------- | --------------------------- |
| archivable recovery skip hooks/requires | **Implemented** | `isArchivingRecovery` guard |
| designing from archiving                | **Implemented** | existing invalidation block |

### Discrepancies

| ID  | Severity | Finding                                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------- |
| T-1 | LOW      | Verify scenario "Transition from archiving to designing downgrades artifacts" has no dedicated test. |

### Test coverage

| Scenario                             | Covered |
| ------------------------------------ | ------- |
| archiving → archivable without hooks | YES     |
| archiving → designing + downgrade    | NO      |

---

## core:lifecycle-engine

### Requirements summary (delta)

- Expose `archivable` / `designing` in verdict; no `requires` blockers for `archivable`
- `nextAction` → designing when incomplete restore

### Implementation status

| Requirement                               | Status          | Code                                                                                 |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Escape transitions in `validTransitions`  | **Implemented** | `VALID_TRANSITIONS`                                                                  |
| Skip requires blockers for archivable     | **Implemented** | `transitionBlockers` + `_requestedTargetBlockers`                                    |
| `availableTransitions` for escape targets | **Implemented** | filter branch for `archiving`                                                        |
| Incomplete restore nextAction             | **Implemented** | `_nextAction` uses last `archive-failed` + `commitStarted` + state still `archiving` |

### Discrepancies

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                   |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1 | INFO     | Spec text says "batch restore did not complete successfully"; implementation infers this from `commitStarted` + remaining in `archiving` rather than an explicit `restoreCompleted` event field. Behavior aligns for partial restore; ambiguous if restore never ran but state unchanged. |

### Test coverage

| Scenario                                | Covered                          |
| --------------------------------------- | -------------------------------- |
| Exposes escape transitions              | YES — `lifecycle-engine.spec.ts` |
| Incomplete restore recommends designing | YES — `lifecycle-engine.spec.ts` |

### Summary

- Requirements implemented: **11/11** (code)
- Test gaps: **3 LOW**
- Discrepancies blocking merge: **0**

---

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

---

## Recommended next actions

1. **Proceed** — transition `verifying → done → archivable` if accepting test gaps as follow-up.
2. **Fix implementation** — address **A-1** (`workspaceSpecLayouts` in explicit composition) + add missing integration tests.
3. **Update specs** — only if you want to narrow verify scenarios to match current test level.
4. **Both** — fix A-1 + tests, then re-run `/specd-verify`.

Report artifacts:

- `reports/20260525-064204/_partial-core-lifecycle.md`
- `reports/20260525-064204/_partial-core-archive-change.md`
- This file
