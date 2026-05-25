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
