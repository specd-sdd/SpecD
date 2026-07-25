# Spec-Compliance Audit: `save-artifact-reopen-vs-drift`

**Change:** `save-artifact-reopen-vs-drift`  
**Report generated:** 2026-07-25  
**Scope:** `core:change-repository-port`, `core:fs-change-repository`, `core:create-change` (merged preview)  
**Method:** `spec-preview` + graph search/impact + implementation + test review  
**Mode:** Read-only audit — no code or spec modifications

---

## Requirements Summary

| Spec                          | Requirements | Change-critical | Sampled pre-existing |
| ----------------------------- | ------------ | --------------- | -------------------- |
| `core:change-repository-port` | 28           | 7               | 21                   |
| `core:fs-change-repository`   | 9            | 3               | 6                    |
| `core:create-change`          | 12           | 1               | 11                   |
| **Total**                     | **49**       | **11**          | **38**               |

### Change-critical requirements (focus of this change)

| ID     | Spec                     | Requirement                                                   | Summary                                                                                              |
| ------ | ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CRP-05 | `change-repository-port` | mutate serializes persisted change updates                    | Lock, fresh load (`skipWrite`), persist, **post-reconcile**, return `{ result, change }`             |
| CRP-06 | `change-repository-port` | mutateDraft serializes drafted change updates                 | Same return shape; reconcile after bucket move                                                       |
| CRP-07 | `change-repository-port` | Auto-invalidation on get when artifact files drift            | Shared `_getInternal` / `_manifestToChange`; `artifact-drift` invalidation                           |
| CRP-14 | `change-repository-port` | create persists a new change; save is internal                | Public `create`; no application-facing `save`; manifest writes only in mutate/mutateDraft/locked get |
| CRP-17 | `change-repository-port` | saveArtifact with optimistic concurrency                      | Mutate-window guard; bytes only; no in-memory status/hash/history mutation                           |
| CRP-25 | `change-repository-port` | Abstract class with abstract methods                          | `create` on port surface; `save` absent                                                              |
| FCR-07 | `fs-change-repository`   | create delegates to internal first persist                    | First directory + atomic manifest; refuse cross-bucket collision                                     |
| FCR-08 | `fs-change-repository`   | mutate and mutateDraft reconcile after persist                | Re-enter load/reconcile path; second persist if drift detected                                       |
| FCR-09 | `fs-change-repository`   | saveArtifact requires mutate window and does not touch Change | Tracking sets; reject outside window; no `setFileStatus` / manifest write                            |
| CC-10  | `create-change`          | Persistence and scaffolding                                   | `ChangeRepository.create` then `scaffold`; no public `save`                                          |

---

## Implementation Status

### `packages/core/src/application/ports/change-repository.ts`

| Requirement                     | Status       | Evidence                                                                                                                  |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| CRP-05 mutate return shape      | ✅ Compliant | `MutateResult<T>` with `result` + post-reconcile `change`; `mutate` abstract signature returns `Promise<MutateResult<T>>` |
| CRP-06 mutateDraft return shape | ✅ Compliant | Same `MutateResult<T>` for `mutateDraft`                                                                                  |
| CRP-14 create; no public save   | ✅ Compliant | `abstract create(change)` present; no `save` abstract method                                                              |
| CRP-17 saveArtifact contract    | ✅ Compliant | Docs: mutate-window only, bytes only, no in-memory mutation; returns `void`                                               |
| CRP-25 abstract surface         | ✅ Compliant | Abstract class; `create`, `mutate`, `mutateDraft`, `saveArtifact` declared abstract                                       |

**Note:** `get()` JSDoc (lines 78–81) still says drift “resets the artifact status to `in-progress`”. Spec and implementation use `invalidate('artifact-drift', …)` with `drifted-pending-review`. Behaviour matches spec; JSDoc is stale (see Discrepancies).

### `packages/core/src/infrastructure/fs/change-repository.ts`

| Requirement                                     | Status                   | Evidence                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRP-05 mutate flow                              | ✅ Compliant             | `mutate`: `_withChangeLock` → `_getInternal(skipWrite:true)` → track `_activeMutationInProgress` → `fn` → `_persistManifest` → `_reconcileChangeUnderLock` → `{ result, change: reconciled }` |
| CRP-06 mutateDraft flow                         | ✅ Compliant             | `mutateDraft`: lock → load draft → track `_draftMutationInProgress` → `fn` → `_persistManifest` → `_reconcileChangeUnderLock` → `{ result, change }`                                          |
| CRP-07 drift / shared read path                 | ✅ Compliant             | `_getInternal` shared by `get` and `mutate` initial load; `_manifestToChange` collects all drifted files, calls `change.invalidate('artifact-drift', SYSTEM_ACTOR, …)`                        |
| FCR-07 create                                   | ✅ Compliant             | `create` checks `_resolveDir` collision → `_persistManifest` (mkdir + atomic manifest)                                                                                                        |
| FCR-08 post-mutate reconcile                    | ✅ Compliant             | `_reconcileChangeUnderLock` reloads manifest, re-runs `_manifestToChange`, persists again when `hasChangesToPersist && _artifactTypesResolved`                                                |
| FCR-09 saveArtifact                             | ✅ Compliant             | Guards `_activeMutationInProgress` / `_draftMutationInProgress`; `fs.writeFile` only; no `setFileStatus`, no manifest write                                                                   |
| FCR-06 index on saveArtifact                    | ✅ Compliant (by design) | `saveArtifact` does not call `_syncChangeIndex`; index updates tied to manifest writes in `_persistManifest`                                                                                  |
| Pre-existing (index cache, factory, validation) | ✅ Compliant (sampled)   | `FsChangeIndexCache`, `createFsChangeStorageFactory`, constructor Zod validation present and exercised by existing tests                                                                      |

### `packages/core/src/application/use-cases/create-change.ts`

| Requirement              | Status                 | Evidence                                                                                          |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| CC-10 persistence        | ✅ Compliant           | Line 147: `await this._changes.create(change)`; line 148: `scaffold` after create; no `save` call |
| CC-05 name uniqueness    | ✅ Compliant           | Checks `get`, `getDraft`, `getDiscarded` before create; throws `ChangeAlreadyExistsError`         |
| CC-\* other requirements | ✅ Compliant (sampled) | Schema resolution, overlap check, specDependsOn seeding, actor/history construction match spec    |

### Related use cases calling `mutate` / `mutateDraft`

All production use cases in `packages/core/src/application/use-cases/` destructure `{ result }` and/or `{ change }` from `mutate` / `mutateDraft` (no caller invokes a removed `ChangeRepository.save`). Examples: `edit-change.ts`, `transition-change.ts`, `restore-change.ts`, `discard-change.ts`, `validate-artifacts.ts`, `archive-change.ts`.

`saveArtifact` is only implemented in `FsChangeRepository`; no core use case calls it directly today (CLI/higher layers expected to call inside `mutate` callbacks).

### Test helpers

`StubChangeRepository` (`packages/core/test/application/use-cases/helpers.ts`) implements `create` and `MutateResult`, but **`mutate` / `mutateDraft` return the callback `change` without a post-reconcile reload**. Production `FsChangeRepository` behaviour is stricter. This is a test-fidelity gap, not a production implementation gap.

---

## Discrepancies

### D-01 — Stale `get()` JSDoc on port (LOW)

| Field                 | Detail                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Location**          | `packages/core/src/application/ports/change-repository.ts` lines 78–81                                               |
| **Spec**              | CRP-07: drift → `drifted-pending-review` + `artifact-drift` invalidation                                             |
| **Observed**          | JSDoc: “A hash mismatch indicates drift and resets the artifact status to `in-progress`.”                            |
| **Runtime behaviour** | `FsChangeRepository._manifestToChange` invalidates with `artifact-drift` and `drifted-pending-review` (matches spec) |

**Possibility A — Spec drift:** Port JSDoc was not updated when reopen-vs-drift semantics were clarified. Fix: update JSDoc to match spec.

**Possibility B — Implementation bug:** If any code path relied on JSDoc and expected `in-progress` without invalidation, behaviour would differ. Graph/implementation review shows drift goes through `invalidate()`, not bare `in-progress`. **Implementation matches spec; JSDoc is wrong.**

---

## Test Coverage

### Change-critical scenarios — covered

| Scenario (from verify.md)                              | Test location                                   | Status     |
| ------------------------------------------------------ | ----------------------------------------------- | ---------- |
| `create` refuses colliding names                       | `change-repository.spec.ts` `create()`          | ✅         |
| `mutate` serializes concurrent updates                 | `mutate()` concurrent tests                     | ✅         |
| `mutate` failing callback does not persist             | `mutate()` throw test                           | ✅         |
| Internal load in `mutate` avoids nested lock           | drift + lock acquisition count test             | ✅         |
| `saveArtifact` outside mutate rejected                 | `ChangeMutationRequiredError` test              | ✅         |
| `saveArtifact` conflict / force / no originalHash      | `saveArtifact()` block                          | ✅         |
| Post-mutate reconcile after `saveArtifact` byte change | `.change` drift + invalidation test (line ~942) | ✅ partial |
| `CreateChange` uniqueness (active/draft/discarded)     | `create-change.spec.ts`                         | ✅         |
| `CreateChange` uses create + scaffold                  | indirect via store/path tests                   | ✅ partial |

### Change-critical scenarios — missing or weak

| Gap                                                                                                                                     | Spec reference                                                        | Severity |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| No explicit assertion that `mutate().change` equals a following `get()` after in-callback `saveArtifact`                                | CRP-05 verify: “Post-save reconcile detects disk drift”               | MEDIUM   |
| No test that in-callback `Change` object status/`validatedHash` unchanged immediately after `saveArtifact` (only post-mutate `.change`) | CRP-17 verify: “in-memory Change … unchanged by saveArtifact”         | MEDIUM   |
| No `saveArtifact` inside `mutateDraft` window test                                                                                      | CRP-17 verify: “saveArtifact inside mutateDraft may succeed”          | MEDIUM   |
| No `mutateDraft` return-shape / post-reconcile test (e.g. after restore bucket move)                                                    | CRP-06 verify: “mutateDraft returns result and post-reconcile change” | MEDIUM   |
| No `create()` test that artifact file content is not written                                                                            | CRP-14 / FCR-07 verify                                                | LOW      |
| No test that `saveArtifact` does not update list indexes                                                                                | FCR-06 verify                                                         | LOW      |
| No `DraftedChangeReadOnlyError` path for `saveArtifact` on drafted change outside window                                                | CRP-17                                                                | LOW      |
| `CreateChange` tests do not spy `repository.create` (wording still says “creates and saves”)                                            | CC-10 verify                                                          | LOW      |
| Composition test does not assert `resolveCreateChangeDeps` wiring detail                                                                | CC-12 verify scenario                                                 | LOW      |
| `StubChangeRepository` lacks post-reconcile semantics                                                                                   | test fidelity                                                         | LOW      |

### Pre-existing requirements (sampled)

List/count/reindex, drift invalidation suite, directory moves (draft/restore/discard), artifact path confinement, and most `CreateChange` input/history/overlap tests are present and passing patterns in existing files. Not re-audited exhaustively line-by-line.

---

## Missing Tests

Recommended additions (ordered by change-critical impact):

1. **`mutate` reconcile parity with `get`:** After `saveArtifact` inside `mutate`, assert `mutateResult.change` deep-equals (or matches on artifact/file status fields) `await repo.get(name)`.
2. **`saveArtifact` does not mutate callback `Change`:** Snapshot file status / `validatedHash` on the `loaded` object before and after `saveArtifact` inside the callback.
3. **`saveArtifact` inside `mutateDraft`:** Draft a change, call `saveArtifact` in `mutateDraft` callback, assert bytes written and no `ChangeMutationRequiredError`.
4. **`mutateDraft` post-reconcile return:** After restore via `mutateDraft`, assert `{ result, change }` where `change.isDrafted === false` and paths resolve under `changes/`.
5. **`create` no artifact bytes:** After `create`, assert change directory contains only `manifest.json` (and scaffold dirs if pre-scaffold), no artifact files.
6. **Index unchanged by `saveArtifact`:** Capture list-index mtime or entry hash before/after byte-only `saveArtifact`.
7. **Stub parity (optional):** Teach `StubChangeRepository.mutate*` to simulate reconcile or document that integration tests must use `FsChangeRepository` for drift semantics.

---

## Spec Dependency Consistency

| Dependency                                       | Status | Notes                                                                                          |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------- |
| `default:_global/architecture`                   | ✅     | Port is abstract class; infrastructure in `infrastructure/fs/`; use cases depend on ports      |
| `core:repository-port`                           | ✅     | `ChangeRepository` extends `Repository`; list pagination types reused                          |
| `core:change`                                    | ✅     | Drift invalidation uses domain `invalidate()` / `SYSTEM_ACTOR`                                 |
| `core:composition` / `core:composition-resolver` | ✅     | `resolveCreateChangeDeps` resolves all five deps; config factory delegates                     |
| `core:storage`                                   | ✅     | Fs cache paths, atomic manifest writes, index helpers                                          |
| `core:change-list-entry`                         | ✅     | List projection helpers used                                                                   |
| `core:drafted-change-read-only-error`            | ✅     | `_persistManifest` + `saveArtifact` guards                                                     |
| Cross-spec alignment (port ↔ fs)                 | ✅     | Fs implementation matches port contract for create / mutate returns / saveArtifact / reconcile |

No circular or broken spec dependency references found in the merged previews.

---

## Summary counts

| Metric                                 | Count |
| -------------------------------------- | ----: |
| Requirements checked                   |    49 |
| Compliant                              |    48 |
| Discrepancies                          |     1 |
| Missing / weak tests (change-critical) |     7 |
| Missing tests (low severity)           |     2 |

### Issues found

| Severity | ID        | Description                                                                                                |
| -------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| LOW      | D-01      | Port `get()` JSDoc describes `in-progress` reopen; spec + implementation use `artifact-drift` invalidation |
| MEDIUM   | T-01      | No test proving `mutate().change` matches subsequent `get()` after in-callback `saveArtifact`              |
| MEDIUM   | T-02      | No test proving in-callback `Change` unchanged by `saveArtifact`                                           |
| MEDIUM   | T-03      | No `saveArtifact` inside `mutateDraft` test                                                                |
| MEDIUM   | T-04      | No `mutateDraft` post-reconcile return-shape test                                                          |
| LOW      | T-05–T-07 | Missing create-no-bytes, index-skip, drafted `DraftedChangeReadOnlyError` tests                            |

### Overall verdict

**Issues found** — implementation is **largely compliant** with all change-critical requirements (`create`, `{ result, change }`, mutate-window `saveArtifact`, post-mutate reconcile, no public `save`). One low-severity documentation discrepancy (D-01) and several **test gaps** on reconcile parity and `mutateDraft`/`saveArtifact` edge cases remain. No production code bug identified for the stated change goals.
