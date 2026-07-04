# Spec Compliance Report — fix-change-repository-write-on-read

**Date:** 2026-07-03  
**Audit Mode:** Specific Change (`--change fix-change-repository-write-on-read`)  
**Status:** **PASSED**

---

## 1. Executive Summary

This compliance review covers the changes made to the `FsChangeRepository` read/write path under the change `fix-change-repository-write-on-read`.
All specifications and requirements are fully met, with corresponding unit test coverage in `change-repository.spec.ts`. No compliance gaps or architectural discrepancies were identified.

---

## 2. Requirements Summary

### Spec: `core:storage`

| Requirement                  | Scenario                                                | Code Compliance                                                        | Test Verification                               | Status         |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | -------------- |
| **Status derivation bypass** | Skip sync and drift check when `artifactTypes` is empty | Bypassed in `_manifestToChange` when `artifactTypes.length === 0`      | `change-repository.spec.ts` (uninit-drift-test) | **Conformant** |
| **Locks path derivation**    | Lock file created under `{configPath}/tmp/change-locks` | `this._locksPath = path.join(props.configPath, 'tmp', 'change-locks')` | Covered by lock tests                           | **Conformant** |

### Spec: `core:change-repository-port`

| Requirement                  | Scenario                                                       | Code Compliance                                                                    | Test Verification                             | Status         |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- | -------------- |
| **`mutate` optimistic lock** | Acquire outer lock, skip lock/write on inner load, save at end | `mutate` uses `_withChangeLock` and calls `_getInternal(..., { skipWrite: true })` | `change-repository.spec.ts` (mutate lock spy) | **Conformant** |
| **`get` auto-invalidation**  | Detect drift, lock, reload manifest, write updated manifest    | `get` calls `_getInternal(..., { skipWrite: false })` which locks and rewrites     | `change-repository.spec.ts` (drift-lock-test) | **Conformant** |
| **`list` alignment**         | Loaded changes with drift are written under lock safely        | `list()` loads changes by delegating to `this.get(name)`                           | Checked via existing `list()` tests           | **Conformant** |

---

## 3. Discrepancies and Findings

No discrepancies found. The implementation exactly mirrors the specified architectural patterns and invariants of both the change repository port and the storage specifications.

---

## 4. Test Coverage Analysis

All new behaviors are covered by high-quality unit tests using Vitest:

1. **Uninitialized drift bypass**: Covered by `given an uninitialized repository (no artifactTypes) and a change with a drifted artifact...` which asserts that manifest files on disk are not rewritten and no state invalidation occurs.
2. **Lock-based auto-invalidation**: Covered by `given an initialized repository and a change with a drifted artifact, when get is called...` which spies on `_withChangeLock` to assert the lock is acquired exactly once and the manifest on disk is updated with the invalidated state.
3. **Mutate load bypass**: Covered by `given a change with drifted artifacts loaded inside mutate...` which asserts that `mutate()` acquires the lock exactly once, bypassing nested lock acquisition during its internal loading.

All unit tests compiled and passed successfully.
