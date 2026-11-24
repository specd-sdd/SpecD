# Specs Compliance Report — `workflow-transition-checks`

**Timestamp:** 20260829-175039  
**Mode:** change (`workflow-transition-checks`)  
**Prior report:** `20260829-172110`  
**Graph:** reindexed fresh  
**Read-only audit**

---

## Executive Summary

| Verdict                 | Detail                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **Overall**             | **Fully compliant** — implementation matches merged spec-preview for all 22 change specs |
| **HIGH**                | **0**                                                                                    |
| **MEDIUM**              | **0**                                                                                    |
| **LOW**                 | **0**                                                                                    |
| **Functional blockers** | **None**                                                                                 |

### vs prior audit (`172110`)

| Area                         | Before            | After     |
| ---------------------------- | ----------------- | --------- |
| CLI discrepancies            | 1 MEDIUM + 1 LOW  | **0**     |
| lifecycle-core LOW           | 2                 | **0**     |
| use-cases LOW                | 1 (GAI selectors) | **0**     |
| globals LOW                  | 3                 | **0**     |
| Delta verify scenarios (CLI) | 29/30 tested      | **30/30** |

### Aggregated counts

| Batch          |  Specs | Req checked |  HIGH | MEDIUM |   LOW |
| -------------- | -----: | ----------: | ----: | -----: | ----: |
| lifecycle-core |      6 |          45 |     0 |      0 |     0 |
| use-cases      |      8 |          58 |     0 |      0 |     0 |
| CLI            |      4 |          38 |     0 |      0 |     0 |
| globals+skills |      4 |          44 |     0 |      0 |     0 |
| **Total**      | **22** |     **185** | **0** |  **0** | **0** |

All prior findings closed: CT-04 chained test, status help (X-03), GAI verify renames, lifecycle hop-matrix merge, pino JSDoc, console prefix tests, config cross-ref.

Change still has `ARTIFACT_DRIFT` on specs/verify (expected after delta edits). Next workflow step: `/specd-design`.

---

## Detailed Findings (verbatim partial reports)

---

---

# Partial Audit: lifecycle-core

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-175039`  
**Graph:** indexed `2026-08-29T15:50:53Z`, fresh (`stale: false`)  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified

---

## Specs Audited

- `core:lifecycle-engine`
- `core:transition-checks`
- `core:change`
- `core:workflow-model`
- `core:schema-format`
- `core:storage` (lifecycle intersection: dependency cascade, load-time sanitize, drift ownership)
- Cross-check: `default:_global/architecture`, `default:_global/logging` (dependency chain only)

---

## Prior Audit Delta (20260829-172110)

| Prior item                                                              | Status (this audit)                                                                                                                                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 HIGH / 0 MEDIUM                                                       | **Confirmed**                                                                                                                                                                 |
| L1 — verify hop-matrix scenarios orphaned (stale parent selector)       | **CLOSED** — hop-matrix scenarios merged into modified `Requirement: Available steps and domain next hop` block (`deltas/core/lifecycle-engine/verify.md.delta.yaml:177-249`) |
| L2 — verify scenario title "Engine unifies three validation dimensions" | **CLOSED** — renamed to "Verdict unifies three validation dimensions" (`verify.md.delta.yaml:5-8`)                                                                            |
| `lifecycle-engine.spec.ts` rename                                       | **CLOSED** (prior) → `lifecycle-verdict.spec.ts` present; `manifest.json` tracks `lifecycle-engine.spec.ts` as removed                                                        |
| LE-6 `transitionBlockers` DAG fallback undocumented                     | **CLOSED** (prior) — spec LE-6 documents DAG-only walk when checks absent                                                                                                     |
| Verdict-derived markdown fixture                                        | **CLOSED** (prior) — `markdown-parser-real-merge.spec.ts`                                                                                                                     |

---

## Per-Spec Findings

### `core:lifecycle-engine`

#### Requirements Summary

| ID    | Requirement                         | Essence                                                                                                                                                                                                          |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `lifecycle-verdict.ts`; no `LifecycleEngine` class; domain `nextHop` without `command`.                                                                                                       |
| LE-2  | Centralized validation logic        | Project caller-supplied `CheckResult`s only; no I/O, no effects, no snapshot-bag fallback.                                                                                                                       |
| LE-3  | Effective artifact status           | Review/incomplete upstream mapping; parent-review wins over in-progress.                                                                                                                                         |
| LE-4  | Canonical-state-only                | No extra lifecycle states from display drift projections.                                                                                                                                                        |
| LE-5  | Machine-readable blockers           | Standard codes; skippable bypass omits blockers; no `warnings` field; `INCOMPLETE_ARTIFACT` replaces `MISSING_ARTIFACT`.                                                                                         |
| LE-6  | Available steps and domain next hop | Single predicate evaluation; `blockingArtifacts` from check `details` when checks present; `transitionBlockers` MAY use DAG-only walk when checks absent; hop matrix in domain `nextHop` + application commands. |
| LE-7  | Archiving escape transitions        | `archiving` exposes `archivable`/`designing`; recovery skips requires.                                                                                                                                           |
| LE-8  | Review summary integration          | Historical overlap → review reason, not `OVERLAP_CONFLICT` blocker.                                                                                                                                              |
| LE-9  | Shared lifecycle interpretation     | Consumers share verdict; `CompileContext` excluded; empty `checksByTarget` still yields DAG answers.                                                                                                             |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command`.                                                                                                                                                               |
| LE-11 | Next artifact topological order     | `topologicalOrder()` + `parentsOf()` dependency readiness.                                                                                                                                                       |
| LE-12 | No LifecycleEngine class            | Compatibility barrel re-exports domain functions only.                                                                                                                                                           |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                                                                                             |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1      | **Implemented** | `evaluateLifecycleVerdict` at `lifecycle-verdict.ts:142`. No `LifecycleEngine` in `packages/core/src`. `public-api.spec.ts:7-10` asserts absence. Domain `nextHop`: `targetStep`/`actionType`/`reason` only.         |
| LE-2      | **Implemented** | Filters `availableTransitions` from `checksByTarget` outcomes (`159-172`). No `PredicateSnapshots` / snapshot fallback.                                                                                              |
| LE-3      | **Implemented** | `effectiveStatus` / `projectArtifacts`; parent-review wins (`lifecycle-verdict.spec.ts:173-187`).                                                                                                                    |
| LE-4      | **Implemented** | Canonical status only; tests `complete-with-drift` / `hasDrift` at `lifecycle-verdict.spec.ts:467-519`.                                                                                                              |
| LE-5      | **Implemented** | `blockersFromFailedChecks`; bypass filtering; `INCOMPLETE_ARTIFACT` not `MISSING_ARTIFACT` (`lifecycle-verdict.spec.ts:954-982`).                                                                                    |
| LE-6      | **Implemented** | `blockingArtifactIds` (`752-768`): when checks present, reads failed `workflow.requires` `details.artifactId`; `transitionBlockers` DAG fallback at `215-230`; hop matrix tests `lifecycle-verdict.spec.ts:604-820`. |
| LE-7–LE-8 | **Implemented** | Archiving skip at `217-218`; overlap review hop tests (`lifecycle-verdict.spec.ts:394-435`).                                                                                                                         |
| LE-9      | **Implemented** | `validate-artifacts.ts:221` calls with `checksByTarget: {}`. `compile-context.ts` has no `evaluateLifecycleVerdict`. Shared-consumer scenarios in verify delta.                                                      |
| LE-10     | **Implemented** | `lifecycle-evaluation.ts` attaches `nextAction` via guidance; hop-matrix command tests in `lifecycle-verdict.spec.ts:604-820`.                                                                                       |
| LE-11     | **Implemented** | `nextArtifact` uses `topologicalOrder()` + `parentsOf()` (`771-788`, `1013`). Test: topological order at `lifecycle-verdict.spec.ts:499`.                                                                            |
| LE-12     | **Implemented** | `lifecycle-engine.ts` compatibility barrel only (`packages/core/src/domain/services/lifecycle-engine.ts:1-19`).                                                                                                      |

#### Discrepancies

_None above LOW._

#### Test Coverage

| Requirement / scenario               | Tests                                                                      | Adequacy                          |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| No LifecycleEngine class             | `public-api.spec.ts`                                                       | Adequate                          |
| nextHop without command              | `lifecycle-verdict.spec.ts` `describe('evaluateLifecycleVerdict')`         | Adequate                          |
| Effective status / parent-review     | Multiple lifecycle-verdict tests                                           | Adequate                          |
| blockingArtifacts from check details | `blockingArtifacts follow check details` (`lifecycle-verdict.spec.ts:149`) | Adequate                          |
| transitionBlockers DAG fallback      | Archiving recovery + empty-check callers                                   | Adequate                          |
| Hop matrix / taskCompletion gating   | `lifecycle-verdict.spec.ts:604-820`                                        | Adequate                          |
| nextAction.command                   | `describe('evaluateLifecycle')` cases                                      | Adequate                          |
| nextArtifact DAG order               | `lifecycle-verdict.spec.ts:499`                                            | Adequate                          |
| Verify delta hop-matrix scenarios    | Delta content at `verify.md.delta.yaml:202-249` aligns with code tests     | Adequate (delta hygiene restored) |

**Gaps:** no automated test that domain modules never import `application/logger` (indirect via architecture); acceptable given logging spec allows ambient `Logger.debug`.

---

### `core:transition-checks`

#### Requirements Summary

| ID   | Requirement               | Essence                                                                                     |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------- |
| TC-1 | Check identity and result | Stable ids, gerund labels, pass/fail/skip, codes on fail.                                   |
| TC-2 | Check ABI                 | `Check`, `WorkflowCheck`, `create()` factories; self-sufficient `execute`; no snapshot bag. |
| TC-3 | Applicability             | Registry bindings with `from`/`to`/`along`; axis splice via `AXIS_FALLBACK`.                |
| TC-4 | Archive operation         | Operation `archive`, not fake edge.                                                         |
| TC-5 | Predicate vs effect       | Predicates → `allowed`; effects by binding `phase`/`onFailure`.                             |
| TC-6 | Evaluation                | No approval routing rewrite; protocol fail-fast on execute.                                 |
| TC-7 | Registry bindings         | Impl checks on forward exit-implementing; approvals on delivery edges.                      |
| TC-8 | Projections               | `availableTransitions` / `nextAction` from same evaluation.                                 |
| TC-9 | Progress bus              | `check-start` / `check-done` / `check-progress` events.                                     |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                              |
| --------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| TC-1      | **Implemented** | `CHECK_LABELS` gerund map; `CheckResult` shape in transition-checks module.                                           |
| TC-2      | **Implemented** | `WorkflowCheck` class (`workflow-check.ts:17`); no `PredicateSnapshots` export (`transition-checks.spec.ts:384-388`). |
| TC-3      | **Implemented** | `classifyAlong` / `AXIS_FALLBACK` tests in `transition-checks.spec.ts`.                                               |
| TC-4–TC-5 | **Implemented** | Archive bindings in composition tests; effect phase/onFailure in transition-change specs.                             |
| TC-6–TC-8 | **Implemented** | `executeChecksByLegalTargets` + `GetStatus`/`TransitionChange` integration; approval stays in `ready`.                |
| TC-9      | **Implemented** | Progress bus in `transition-change.spec.ts:1761-2010`.                                                                |

#### Discrepancies

_None above LOW._

#### Test Coverage

| Area                             | Tests                                                            | Adequacy |
| -------------------------------- | ---------------------------------------------------------------- | -------- |
| `classifyAlong` / axis           | `transition-checks.spec.ts`                                      | Adequate |
| No snapshot bag                  | Export negative test                                             | Adequate |
| Binding matching (impl/approval) | `execute-matching-predicates.spec.ts`, registry composition spec | Adequate |
| Progress bus                     | `transition-change.spec.ts`                                      | Adequate |

---

### `core:change`

#### Requirements Summary

| ID   | Requirement                   | Essence                                                                                                   |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| CH-1 | Lifecycle / VALID_TRANSITIONS | Protocol table; entity owns persisted state; no new pending parking hops; skill-aligned backward hops.    |
| CH-2 | Artifacts                     | `pending-parent-artifact-review` is **verdict-derived**; not persistable; wire sanitize to `in-progress`. |
| CH-3 | Guidance ownership            | Domain `nextHop`; application attaches `command`.                                                         |
| CH-4 | assertArchivable              | Entity asserts `archivable` or `archiving`.                                                               |
| CH-5 | Skill-aligned backward hops   | Retry hops invalidate signoff only, not mass-invalidate artifacts.                                        |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                                                                     |
| ---- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CH-1 | **Implemented** | `VALID_TRANSITIONS` in change entity; transition validity tests across change/transition-change specs.                                                                       |
| CH-2 | **Implemented** | Delta: verdict-derived. `ArtifactFile` rejects token (`artifact-file.ts:52-54`). Load/save sanitize (`change-repository.ts:1700-1701`; `change-repository.spec.ts:664-692`). |
| CH-3 | **Implemented** | Separation in `lifecycle-evaluation.ts` / `lifecycle-guidance.ts`.                                                                                                           |
| CH-4 | **Implemented** | `assertArchivable` covers archivable or archiving (entity tests).                                                                                                            |
| CH-5 | **Implemented** | Backward-hop invalidation rules in change delta; transition-change composition tests.                                                                                        |

#### Discrepancies

_None above LOW._

#### Test Coverage

| Requirement                       | Tests                                                        | Adequacy |
| --------------------------------- | ------------------------------------------------------------ | -------- |
| Verdict-derived not persistable   | `artifact-file.spec.ts:205`; change-repository wire sanitize | Adequate |
| assertArchivable                  | `change.spec.ts` entity tests                                | Adequate |
| VALID_TRANSITIONS / backward hops | transition-change composition tests                          | Adequate |

---

### `core:workflow-model`

#### Requirements Summary

| ID   | Requirement                | Essence                                                                   |
| ---- | -------------------------- | ------------------------------------------------------------------------- |
| WM-1 | Step names = ChangeState   | `workflow[]` extras only; omit does not delete protocol.                  |
| WM-2 | Requires / task completion | Shared `workflow.requires` / `workflow.taskCompletion` checks.            |
| WM-3 | Step availability          | From `evaluateLifecycleVerdict`; `CompileContext` must not evaluate hops. |
| WM-4 | Progress axis              | Same `along` classification as transition-checks.                         |
| WM-5 | Hook execution             | Effects via binding matcher; instruction hooks excluded from pipeline.    |
| WM-6 | Task completion subset     | `requiresTaskCompletion` ⊆ `requires`; schema build validates.            |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                                                              |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1–WM-6 | **Implemented** | Availability flows through verdict projections; task completion via `CountTasks` in check execute; `compile-context.ts` has no `evaluateLifecycleVerdict` (graph + source confirmed). |

#### Discrepancies

_None._

#### Test Coverage

Requires/task-completion scenarios in `workflow-requires.spec.ts`, transition-change composition tests, lifecycle projection tests. `compile-context.spec.ts:1440` asserts no `blockingArtifacts`. Adequate.

---

### `core:schema-format`

#### Requirements Summary

| ID   | Requirement               | Essence                                                           |
| ---- | ------------------------- | ----------------------------------------------------------------- |
| SF-1 | Artifact requires cascade | Feeds `projectArtifacts`; no `Change.effectiveStatus()`.          |
| SF-2 | Schema artifact DAG API   | `artifactDag()` with `parentsOf`, `topologicalOrder`, etc.        |
| SF-3 | Canonical DAG derivation  | Next-artifact and upstream walks use `artifactDag()` exclusively. |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                                                                                                                                                              |
| ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF-1 | **Implemented** | Cascade in `projectArtifacts`; no `Change.effectiveStatus()` in `packages/core/src`.                                                                                                                                                                                  |
| SF-2 | **Implemented** | `ArtifactDag.parentsOf` (`artifact-dag.ts:140-142`); `artifact-dag.spec.ts:47-51`.                                                                                                                                                                                    |
| SF-3 | **Implemented** | `requiresForArtifact` uses `parentsOf` (`lifecycle-verdict.ts:1013`); `nextArtifact` uses `topologicalOrder` + `parentsOf` (`775-785`); consumers per graph impact (`validate-artifacts`, `transition-change`, `edit-change`, `invalidate-change`, `archive-change`). |

#### Discrepancies

_None._

#### Test Coverage

`artifact-dag.spec.ts` covers DAG API. Lifecycle tests cover next-artifact behavior. Adequate.

---

### `core:storage` (lifecycle intersection)

#### Requirements Summary

| ID   | Requirement                 | Essence                                                             |
| ---- | --------------------------- | ------------------------------------------------------------------- |
| ST-1 | Artifact dependency cascade | Owned by `projectArtifacts`; no entity method.                      |
| ST-2 | Load-time file status       | Hash-derived; drift at load via repository.                         |
| ST-3 | Legacy sanitize             | Wire `pending-parent-artifact-review` → `in-progress` on load/save. |
| ST-4 | ValidateArtifacts ownership | Baseline drift not repeated in validate use case.                   |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                              |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-1      | **Implemented** | Delta + preview align cascade with lifecycle-engine; no repository cascade logic.                                                                     |
| ST-2–ST-4 | **Implemented** | `change-repository.ts` load drift + `persistableArtifactStatus` (`1694-1701`); validate uses verdict with empty checks (`validate-artifacts.ts:221`). |

#### Discrepancies

_None._

#### Test Coverage

| Requirement                     | Tests                               | Adequacy           |
| ------------------------------- | ----------------------------------- | ------------------ |
| Wire sanitize pending-parent    | `change-repository.spec.ts:664-692` | Adequate           |
| Hash derivation / drift at load | Multiple change-repository tests    | Adequate           |
| DAG cascade (not repository)    | lifecycle-verdict tests             | Correct separation |

---

## Cross-Spec Consistency

| Check                                                                 | Result                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Architecture ↔ domain (no Core names in global preview)               | **Pass**                                                                                        |
| Logging ↔ architecture dependency                                     | **Pass**                                                                                        |
| Change CH-2 ↔ lifecycle LE-3 ↔ storage ST-1/ST-3                      | **Pass** — unified "verdict-derived" / `projectArtifacts` vocabulary in deltas, code, and tests |
| Workflow-model WM-3 ↔ lifecycle LE-9                                  | **Pass** — single verdict authority; CompileContext excluded                                    |
| Schema-format SF-3 ↔ lifecycle LE-11                                  | **Pass** — `parentsOf` + `topologicalOrder()` aligned                                           |
| Transition-checks registry ↔ workflow-model axis                      | **Pass** — shared `classifyAlong` / `AXIS_FALLBACK`                                             |
| Lifecycle LE-6 transitionBlockers fallback ↔ WM-3 empty-check callers | **Pass** — spec documents DAG-only walk; ValidateArtifacts uses empty `checksByTarget`          |
| Lifecycle verify delta hop-matrix ↔ LE-6 hop matrix                   | **Pass** — scenarios co-located under renamed requirement block                                 |
| Change manifest tracks test rename                                    | **Pass** — `lifecycle-verdict.spec.ts` added; `lifecycle-engine.spec.ts` removed                |

---

## Graph Intelligence Summary

| Symbol / area              | Dependents (high level)                                                                                  | Risk                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `evaluateLifecycleVerdict` | GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction, evaluateLifecycle, approve-\*    | HIGH (13 files) — all consume projections as spec requires |
| `WorkflowCheck`            | Check registry, transition-change, get-status                                                            | Expected application-layer ABI                             |
| `artifactDag()`            | lifecycle-verdict, validate-artifacts, transition-change, edit-change, invalidate-change, archive-change | Canonical DAG per SF-3                                     |

---

## Summary Counts

| Severity | Count |
| -------- | ----- |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 0     |

| Metric               | Count |
| -------------------- | ----- |
| Requirements checked | 45    |
| Implemented          | 45    |
| Partial              | 0     |
| Missing              | 0     |

**Prior-fix verification:** L1 hop-matrix delta hygiene, L2 "Verdict unifies" rename, and `lifecycle-verdict.spec.ts` rename are **confirmed closed**. Implementation fully matches change spec deltas for all six specs. No residual discrepancies above LOW severity.

---

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change (read-only audit)
- **Change:** `workflow-transition-checks`
- **Report:** `20260829-175039`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:archive-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:hook-execution-model`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** fresh (`lastIndexedAt: 2026-08-29T15:50:53Z`, `stale: false`); navigation via `graph search` / `graph impact` on use-case symbols
- **Code paths:** `packages/core/src/application/use-cases/*.ts`, `packages/core/src/composition/use-cases/*.ts`, `packages/core/src/application/checks/hook-*.ts`, matching tests under `packages/core/test/`
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior batch:** `reports/20260829-172110/_partial-use-cases.md` (1 LOW: GAI verify selector "engine" titles — **fixed this pass** via `rename` fields in verify delta)

---

## Requirements Summary

### `core:get-status`

| ID    | Requirement                                                                                                                       | Spec location (preview)                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                             | Accepts a change name as input                    |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`  | Returns the change and its artifact statuses      |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                           | Returns… / Throws ChangeNotFoundError             |
| GS-4  | Drafted: empty `availableTransitions` / `availableSteps`; `nextAction.command` MUST NOT recommend transition/validate             | Drafted change read-only status                   |
| GS-5  | Drafted effective statuses via `projectArtifacts` only; MUST NOT call `evaluateLifecycle` or `evaluateLifecycleVerdict` on drafts | Drafted change read-only status                   |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only                                              | Implementation status / Optional pre-read refresh |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                          | Drift-aware display status                        |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`  | Reports task completion counts / Constructor      |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                        | Execute matching predicates then project          |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`               | Constructor dependencies                          |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                     | Config-based factory…                             |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                     | Reports effective status…                         |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping shared with checks  | Returns lifecycle context / Identifies blockers   |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                             | Graceful degradation                              |

### `core:transition-change`

| ID   | Requirement                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 | Import `evaluateLifecycle` as module function; MUST NOT ctor `LifecycleEngine`                                                             |
| TC-2 | `to: 'next'` = `HAPPY_PATH_NEXT`; typed error when undefined (pending-spec-approval, pending-signoff, archivable, archiving, …)            |
| TC-3 | `failFastOn: 'protocol.edge'` for predicate execute                                                                                        |
| TC-4 | Approvals in place: `ready` + spec gate MUST NOT rewrite persist target to `pending-spec-approval`; stay in `ready` on `approval-required` |
| TC-5 | Task gating via `workflow.taskCompletion`; MUST NOT second `CountTasks` after green predicates                                             |
| TC-6 | `resolveTransitionChangeDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`; import `evaluateLifecycle`                                 |
| TC-7 | Constructor: changes, actor, schemaProvider, refresh, approvals, `transitionBindings` (not `RunStepHooks` / `CountTasks`)                  |
| TC-8 | Hook effects via binding `phase` / `onFailure`; `skipHookPhases` skips effects only; `RunStepHooks` inside hook checks only                |

### `core:archive-change`

| ID    | Requirement                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | Constructor: `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, `archiveBindings`, `ActorResolver`, parsers, `SchemaProvider`, `MaterializeSpecMetadata`, extractor transforms, workspace routes, project root, batch snapshot, hasher — MUST NOT take `RunStepHooks` |
| AC-2  | `resolveArchiveChangeDeps` includes `archiveBindings` from registry; MUST NOT list `runStepHooks` on `ArchiveChangeDeps`                                                                                                                                                      |
| AC-3  | Input: `name`, optional `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`, `allowOutOfScope`                                                                                                                                                                              |
| AC-4  | `schema.nameMatch` on operation `archive` before archivable guard; `failFastOn: 'schema.nameMatch'`                                                                                                                                                                           |
| AC-5  | `change.assertArchivable()` after schema guard; abort before hooks/files if not `archivable`/`archiving`                                                                                                                                                                      |
| AC-6  | Deferred `archiving` transition inside `ChangeRepository.mutate` after full-batch preflight + batch snapshots, before first `publish()`                                                                                                                                       |
| AC-7  | `workspace.readOnly` guard (same runner as enter-`ready`) before hooks/publication                                                                                                                                                                                            |
| AC-8  | `spec.overlap` archive-only; skippable via `allowOverlap`; invalidate peers when allowed                                                                                                                                                                                      |
| AC-9  | Pre-archive hooks: `matchingEffects(..., 'before-persist')`; binding `onFailure` abort → `HookFailedError`; skip via `skipHookPhases`                                                                                                                                         |
| AC-10 | Full-batch preflight before any canonical publication; abort entire batch on any preflight failure                                                                                                                                                                            |
| AC-11 | Batch canonical snapshot before publication; restore all specs on commit failure; orphan backup detection                                                                                                                                                                     |
| AC-12 | Post-archive hooks: `matchingEffects(..., 'after-persist')`; default `hook.post` collect / fail-soft                                                                                                                                                                          |
| AC-13 | Lifecycle rollback `archiving` → `archivable` after successful restore on commit failure                                                                                                                                                                                      |
| AC-14 | Tracked artifact selection from `ArtifactFile.filename`; no alternate delta/spec path probing                                                                                                                                                                                 |

### `core:validate-artifacts`

| ID   | Requirement                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| VA-1 | Constructor without `LifecycleEngine`; DAG via `evaluateLifecycleVerdict({ checksByTarget: {} })` once at start; in-memory `markVerdictComplete` |
| VA-2 | MUST NOT hop predicates / `executeChecksByLegalTargets`                                                                                          |
| VA-3 | `resolveValidateArtifactsDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                  |

### `core:get-artifact-instruction`

| ID    | Requirement                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| GAI-1 | Constructor without `LifecycleEngine`; omitted `artifactId` → `evaluateLifecycleVerdict` empty `checksByTarget` → `nextArtifact` |
| GAI-2 | MUST NOT hop predicates / `availableTransitions` evaluation                                                                      |
| GAI-3 | `resolveGetArtifactInstructionDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                             |

### `core:approve-spec` / `core:approve-signoff`

| ID   | Requirement                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Happy path: record consent in bound `from` (`ready` / `done`); MUST NOT transition to pending parking states          |
| AS-2 | Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`                                    |
| AS-3 | Gate disabled → `ApprovalGateDisabledError`; ctor `approvals` from config; `from` states from check registry bindings |

### `core:hook-execution-model`

| ID     | Requirement                                                                             |
| ------ | --------------------------------------------------------------------------------------- |
| HEM-1  | Two hook types: `instruction:` passive text; `run:` shell via `HookRunner`              |
| HEM-2  | Explicit `external: { type, config }` hooks dispatched to registered external runners   |
| HEM-3  | External hooks follow same pre fail-fast / post report-without-rollback semantics       |
| HEM-4  | `TransitionChange`, `ArchiveChange`, `RunStepHooks` skip `instruction:` entries         |
| HEM-5  | Default auto-execution: effects selected by binding `phase` / `onFailure`, not check id |
| HEM-6  | `RunStepHooks` standalone: pre fail-fast, post fail-soft; TC/AC use binding `onFailure` |
| HEM-7  | `Change` entity MUST NOT execute hooks                                                  |
| HEM-8  | `skipHookPhases` selectors for manual control; `--skip-hooks` skips effects only        |
| HEM-9  | Pre-hook non-zero exit: TC/AC throw `HookFailedError`; no persist/files                 |
| HEM-10 | Post-hook: `abort` throws; `collect` records and continues (archive post default)       |
| HEM-11 | Hook ordering: schema-level before project-level within phase                           |
| HEM-12 | Template expansion + shell escape in `HookRunner`; no `{{change.workspace}}`            |
| HEM-13 | Hook check `execute` delegates to `RunStepHooks`; use cases MUST NOT launch by check id |

**Global / architecture (depth-1, relevant):** inner layers never import outer (`default:_global/architecture`). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted.

### Closed vs prior `20260829-172110` (this batch)

| Prior claim                                                       | Re-verify (this pass)                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAI verify selector "engine" titles (D1)                          | **CLOSED.** Verify delta now includes `rename` fields for both scenarios (`verify.md.delta.yaml:94`, `:109`); selectors target legacy titles, renames align to "verdict-derived readiness" / "when the verdict reports dependency blockage". |
| GetStatus **engine JSDoc**                                        | **CLOSED.** Zero `engine` matches in `get-status.ts`; debug logs say `evaluateLifecycle verdict`.                                                                                                                                            |
| Drafted path `projectArtifacts` only (D2)                         | **CLOSED.** `_buildDraftedResult` (`:621-715`) uses `projectArtifacts` only (`:640-667`); no `evaluateLifecycle` / `evaluateLifecycleVerdict` calls.                                                                                         |
| Drafted `nextAction.command === null` test gap                    | **CLOSED.** `get-status.spec.ts:815`.                                                                                                                                                                                                        |
| Approve spec/signoff **engine check bindings** wording            | **CLOSED.** Preview says "`from` states … come from **check registry bindings**".                                                                                                                                                            |
| Validate-artifacts title "DAG lifecycle from **engine** evaluate" | **CLOSED.** Preview requirement heading uses `evaluateLifecycleVerdict`.                                                                                                                                                                     |
| `LifecycleEngine` class / ctor injection                          | **CLOSED.** No `class LifecycleEngine` under `packages/core/src`. Composition `resolve*Deps` for scoped UCs expose no `lifecycle` key.                                                                                                       |

### Per-spec implementation

**GetStatus — IMPLEMENTED**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle`; domain `projectArtifacts` `:12-17`.
- Active path: `projectArtifacts` → `executeChecksByLegalTargets` (no `failFastOn`) → archive predicates when `archivable` → `evaluateLifecycle` `:481-484`. Task paint from `taskCompletionFromChecks` after checks.
- Drafted: `_buildDraftedResult` `:621-715` — `projectArtifacts` only `:640-667`; empty hops `:673-676`; `nextArtifact: null` `:679`; `nextAction.command: null` `:709-713`.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor matches TC-7 (no `RunStepHooks`).
- `to === 'next'` uses `HAPPY_PATH_NEXT` (`transition-change.ts:183`).
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:215`.
- `evaluateLifecycle` `:219-223` with per-target `checksByTarget`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); no pending rewrite.
- Hook effects: `matchingEffects` + `executeCheckWithProgress` `:252+`; `skipHookPhases` in context.
- `resolveTransitionChangeDeps` — no lifecycle key.

**ArchiveChange — IMPLEMENTED**

- Ctor `:222-250` — `archiveBindings` injected; no `RunStepHooks` parameter (grep: zero `RunStepHooks` in use-case file).
- `resolveArchiveChangeDeps` `composition/use-cases/archive-change.ts:105-148` — `archiveBindings` from registry; no `runStepHooks` on deps interface.
- Schema guard: `executeMatchingPredicates` with `{ failFastOn: 'schema.nameMatch' }` `:281-291`.
- Pre/post hooks: `matchingEffects(..., 'before-persist')` `:323+`; `matchingEffects(..., 'after-persist')` `:529+`.
- Deferred archiving inside mutate after preflight/snapshots.
- Batch safety: `detectOrphans`; `restoreBatch`.
- Test helper wires `RunStepHooks` into hook **checks**, not the use case.

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor — no engine.
- Topological validation order via `schema.artifactDag().topologicalOrder()`.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Debug log names `evaluateLifecycleVerdict` explicitly `:106-108`.
- Ctor — no engine.
- Verify delta: constructor scenario renamed to "without LifecycleEngine" (`verify.md.delta.yaml:6-12`); omitted-artifactId scenarios use verdict wording with matching `rename` fields (`:94`, `:109`).

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: `boundFromStates('approval.spec')` (`approve-spec.ts:86`); drain only if `pending-spec-approval` (`:96-98`). Ready path records consent without parking transition.
- ApproveSignoff: analogous pattern (`approve-signoff.ts:86+`).
- Composition resolvers — repositories, hasher, `approvals` only; no lifecycle key.

**Hook execution model — IMPLEMENTED**

- `createHookPre` / `createHookPost` take `RunStepHooks` as check factory dep; `HookEffectCheck.execute` delegates to `RunStepHooks`.
- `execute-hook-effect.ts`: `matchingEffects` filters by binding `phase` + matcher; `hookFailureMode` maps `onFailure`.
- `RunStepHooks`: skips instruction hooks; external dispatch; pre fail-fast / post fail-soft.
- `TransitionChange` / `ArchiveChange` select effects by phase, not check id.
- `Change` entity: no hook execution.

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

**`LifecycleEngine` class**

- Search under `packages/core/src`: **no** `class LifecycleEngine`.

---

## Discrepancies

### HIGH

_None._

### MEDIUM

_None._

### LOW

_None._

### INFO

#### I1 — Hook ordering (schema before project) not directly tested at `RunStepHooks`

**Spec:** HEM-11 requires schema-level hooks before project-level within a phase.

**Code:** `RunStepHooks._collectHooks` reads merged `workflowStep.hooks` from resolved schema. Project overrides are merged at schema resolution. Ordering is likely enforced at merge time, not in `RunStepHooks`.

**Tests:** No explicit "schema hook runs before override hook" test in `run-step-hooks.spec.ts`.

**Severity:** INFO — implementation path plausible; verify scenario for ordering not directly exercised at use-case layer.

#### I2 — Orphan backup detection tested at adapter, not use-case integration

**Spec:** AC-11 orphan backup rules.

**Tests:** `archive-batch-snapshot.spec.ts:56` (adapter-level). No `archive-change.spec.ts` match for `detectOrphans` / orphan strings.

**Severity:** INFO — adapter coverage exists; optional UC-level integration test.

#### I3 — `core:lifecycle-engine` dependency id naming (INFO — not a code violation)

Several assigned specs list `core:lifecycle-engine` in Spec Dependencies while implementation imports `evaluateLifecycle` / `evaluateLifecycleVerdict` module functions. The lifecycle-engine spec describes module functions, not a class. Consistent with prior audits; not a functional discrepancy.

---

## Test Coverage

| Spec / contract                                                  | Tests (file:line)                                                                                              | Verdict                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
| GetStatus ctor / composition no lifecycle                        | `test/composition/use-cases/get-status.spec.ts:69-112`                                                         | Covered                    |
| Drafted empty transitions / steps / **command null**             | `get-status.spec.ts:795-815`                                                                                   | Covered (`command` `:815`) |
| Drafted `projectArtifacts` parent-review; no `evaluateLifecycle` | `get-status.spec.ts:818-858`                                                                                   | Covered                    |
| Drafted missing schema artifacts from DAG                        | `get-status.spec.ts:861+`                                                                                      | Covered                    |
| CountTasks inside check, once per execute                        | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)                                               | Covered                    |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)       | `execute-matching-predicates.spec.ts:43-71`                                                                    | Covered (runner)           |
| `failFastOn: 'protocol.edge'`                                    | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215`                                           | Covered                    |
| `to: 'next'` / HAPPY_PATH / pending rejects                      | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`                                              | Covered                    |
| Approvals stay in `ready` / `done`                               | `transition-change.spec.ts:377-391`, `:435-447`; `approve-spec.spec.ts:72-89`; `approve-signoff.spec.ts:72-89` | Covered                    |
| TransitionChange `skipHookPhases` selectors                      | `transition-change.spec.ts:1346-1735`                                                                          | Covered                    |
| ValidateArtifacts empty `checksByTarget`                         | `validate-artifacts.spec.ts:241-264`                                                                           | Covered                    |
| GAI empty `checksByTarget` / auto `nextArtifact`                 | `get-artifact-instruction.spec.ts:98-104`                                                                      | Covered                    |
| GAI verify delta rename fields (verdict wording)                 | `verify.md.delta.yaml:94`, `:109`                                                                              | Covered (spec artifact)    |
| `workflow.requires` codes                                        | `workflow-requires.spec.ts:20-71`                                                                              | Covered                    |
| `boundFromStates` registry                                       | `transition-checks.spec.ts:221-223`                                                                            | Covered                    |
| ArchiveChange no RunStepHooks on instance                        | `archive-change.spec.ts:169-182`                                                                               | Covered                    |
| ArchiveChange schema mismatch fail-fast                          | `archive-change.spec.ts:274-288`                                                                               | Covered                    |
| ArchiveChange deferred `archiving` transition                    | `archive-change.spec.ts:2966-3020`                                                                             | Covered                    |
| ArchiveChange ReadOnly workspace guard                           | `archive-change.spec.ts:3202-3230`                                                                             | Covered                    |
| ArchiveChange skipHookPhases pre/post/all                        | `archive-change.spec.ts:1840-2015`                                                                             | Covered                    |
| ArchiveChange RunStepHooks delegation params                     | `archive-change.spec.ts:2793-2846`                                                                             | Covered                    |
| ArchiveChange archive-failed rollback event                      | `archive-change.spec.ts:1406-1466`                                                                             | Covered                    |
| RunStepHooks instruction skip                                    | `run-step-hooks.spec.ts:147`                                                                                   | Covered                    |
| RunStepHooks external hook dispatch                              | `run-step-hooks.spec.ts:173-223`                                                                               | Covered                    |
| RunStepHooks pre fail-fast / post fail-soft                      | `run-step-hooks.spec.ts:321`, `:368`                                                                           | Covered                    |
| Orphan backup detect/restore (adapter)                           | `archive-batch-snapshot.spec.ts:56+`                                                                           | Covered (adapter)          |
| Composition archiveBindings, no runStepHooks on deps             | `composition/use-cases/archive-change.spec.ts:34-54`                                                           | Covered                    |

---

## Missing Tests

| Gap                                                             | Spec                        | Suggested assertion                                                           |
| --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Hook ordering schema before project                             | HEM-11                      | Schema with base + override hooks; assert execution order                     |
| ArchiveChange orphan backup at UC level                         | AC-11                       | Integration test calling `execute` when `.specd-archive-backup/` exists       |
| Composition never resolves `lifecycle` (explicit key assertion) | GS-11 / TC-6 / VA-3 / GAI-3 | Optional: `expect(deps).not.toHaveProperty('lifecycle')` in composition tests |
| GetStatus hop with two fails at use case level                  | GS-9                        | Runner test exists; optional UC-level two-fail hop integration                |

**Closed vs 172110:** GAI verify selector "engine" titles — **not missing** (rename fields added). Drafted `nextAction.command === null` — **not missing**. Draft `evaluateLifecycle` spy — **not missing**. GetStatus engine JSDoc — **not missing**. Approve bindings "engine" wording — **not missing**. Validate-artifacts "engine evaluate" title — **not missing**.

---

## Spec Dependency Chain

From `changes status` / preview `## Spec Dependencies` (depth 1, assigned specs):

- **core:get-status** → `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:transition-change** → `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:archive-change** → `core:change`, `core:schema-format`, `core:delta-format`, `core:validate-artifacts`, `core:storage`, `core:run-step-hooks`, `core:hook-execution-model`, … (22 deps total per change status)
- **core:validate-artifacts** → `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, …
- **core:get-artifact-instruction** → `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-spec** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-signoff** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:hook-execution-model** → `core:workflow-model`, `core:schema-format`, `core:hook-runner-port`, `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, `core:get-hook-instructions`, `core:config`, `cli:change-transition`, `cli:change-archive`, `core:transition-checks`

**Consistency note:** `core:lifecycle-engine` dependency id names module-function lifecycle verdicts; implementation complies (no class import). **Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

**Cross-spec consistency (hook model ↔ archive/transition):** Preview `hook-execution-model` requires binding-table effect selection and `RunStepHooks` inside checks only; `ArchiveChange` / `TransitionChange` implementations match. No contradiction with `core:transition-checks` binding table.

---

## Summary counts

| Metric                                           | Count                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Specs in this batch                              | 8                                                                              |
| Requirements tracked (tables above)              | 58                                                                             |
| Implemented (behaviour)                          | 58 / 58                                                                        |
| Partial / wording-only                           | 0                                                                              |
| Functional discrepancies                         | 0 HIGH; 0 MEDIUM; 0 LOW                                                        |
| INFO items                                       | 3 (HEM-11 ordering test, AC-11 UC orphan test, lifecycle-engine dep id naming) |
| Missing tests                                    | 2 INFO gaps + 2 optional                                                       |
| Prior GAI verify "engine" selectors              | **CLOSED** (rename fields in verify delta)                                     |
| Prior GetStatus engine JSDoc                     | **CLOSED**                                                                     |
| Prior drafted `command` null test                | **CLOSED**                                                                     |
| Prior drafted `projectArtifacts`                 | **CLOSED**                                                                     |
| Prior approve-spec "engine bindings"             | **CLOSED**                                                                     |
| Prior validate-artifacts "engine evaluate" title | **CLOSED**                                                                     |
| `LifecycleEngine` class                          | **ABSENT**                                                                     |
| domain → application imports                     | **ABSENT**                                                                     |

**Focus-contract scorecard**

| Contract                                                                 | Status                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor         | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)                                           |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`            | **PASS** (VA `:220-222`; GAI `:97-99`)                                                                     |
| Drafted GetStatus `projectArtifacts` only, no evaluate calls             | **PASS** (code `:640-667`; test `:849-852`)                                                                |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine              | **PASS** (GetStatus, TransitionChange, ValidateArtifacts, GAI, ApproveSpec, ApproveSignoff, ArchiveChange) |
| Drafted GetStatus empty hops + `command` null                            | **PASS** (code `:675-713`; test `:815`)                                                                    |
| `workflow.requires` status → codes                                       | **PASS** (`workflow-requires.ts:53-74`)                                                                    |
| TransitionChange `failFastOn: 'protocol.edge'`                           | **PASS** (`:215`)                                                                                          |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                         | **PASS**                                                                                                   |
| Approvals in place (no pending rewrite)                                  | **PASS**                                                                                                   |
| ArchiveChange no RunStepHooks ctor; archiveBindings + matchingEffects    | **PASS** (`archive-change.ts:222-250`, `:323-347`)                                                         |
| Hook model: instruction skip, external dispatch, binding phase selection | **PASS** (RunStepHooks + hook checks + TC/AC effect loops)                                                 |
| Task gating via `workflow.taskCompletion`, not second CountTasks         | **PASS** (GetStatus paints from check details)                                                             |
| GAI verify delta selectors aligned via rename                            | **PASS** (`verify.md.delta.yaml:94`, `:109`)                                                               |

**Batch verdict:** All 8 assigned use-case specs are **compliant** with implementation. No open functional or spec-wording discrepancies remain in this batch.

---

# Partial compliance report — CLI (`packages/cli`)

**Change:** `workflow-transition-checks`  
**Report:** `20260829-175039`  
**Prior report:** `20260829-172110` (1 MEDIUM CT-04, 1 LOW X-03)  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)  
**Tests run:** `pnpm --filter @specd/cli test` — 899 passed (includes 102 CLI change-command `it` blocks)

---

## Executive summary

| Metric                                 |     Prior (172110) |                                              Current (175039) |
| -------------------------------------- | -----------------: | ------------------------------------------------------------: |
| Specs audited                          |                  4 |                                                             4 |
| Merged verify scenarios (total)        |                112 |                                                           112 |
| **Compliant (implementation)**         | 38 / 38 req-groups |                                                   **38 / 38** |
| **Partial (implementation)**           |                  0 |                                                         **0** |
| **Non-compliant (implementation)**     |                  0 |                                                         **0** |
| **Delta-focused verify scenarios**     |                 30 |                                                            30 |
| **Delta scenarios with tests**         |                 29 |                                                        **30** |
| **Delta scenarios partial / untested** |                  1 |                                                         **0** |
| Discrepancies — **HIGH**               |                  0 |                                                         **0** |
| Discrepancies — **MEDIUM**             |                  1 |                                                         **0** |
| Discrepancies — **LOW**                |                  1 |                                                         **0** |
| Unit tests (`it` blocks)               |                101 | **102** (34 status + 37 transition + 12 approve + 19 archive) |

**Overall:** All four CLI commands conform to merged spec-preview in source and bundled CLI. All prior discrepancies (CT-04, X-03) are resolved. All 30 delta-focused verify scenarios have dedicated test coverage. No material discrepancies remain.

---

## Prior findings — resolution status

| Prior ID | Severity | Finding                                                                                                         | Status                                                                                                                                                                                                                             |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT-04    | MEDIUM   | Cross-command verify scenario _Status omitted verifying before the failed transition_ untested as a single flow | **FIXED** — `transition.spec.ts:972` chains `change status` then `change transition`, asserts transitions omit `verifying` before failed hop                                                                                       |
| X-03     | LOW      | `change status --help` JSON schema comment implied top-level `availableTransitions` was drafted-only            | **FIXED** — help now reads `// legacy top-level; active changes use lifecycle.availableTransitions` and `lifecycle.availableTransitions` is documented as check-derived for active changes (`status.ts:105-108`; runtime `--help`) |

All other prior findings from `20260829-172110` remain **FIXED** (no regressions observed).

---

## Cross-cutting findings

No material cross-cutting discrepancies. Shared infrastructure **`_check-progress-presenter.ts`** remains compliant: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## Delta scenario matrix (30 / 30)

### `cli:change-status` — 8 / 8

| Scenario                                                                  | Test                          |
| ------------------------------------------------------------------------- | ----------------------------- |
| Incomplete tasks do not list verifying as available                       | `status.spec.ts:1008`         |
| nextAction implements vs verify follows GetStatus                         | `status.spec.ts:1034`         |
| Drafted JSON empties hops even if Core leaks them                         | `status.spec.ts:73`           |
| Artifact-review-required does not reprint files under review              | `status.spec.ts:1154`         |
| Drift is shown only in artifacts details                                  | `status.spec.ts:1095`         |
| Overlap peers still print in text                                         | `status.spec.ts:685`          |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies (+ JSON label) | `status.spec.ts:287`, `:1061` |
| Text output shows overlap peers without review file lists                 | `status.spec.ts:685`          |

### `cli:change-transition` — 16 / 16

| Scenario                                                                | Test                              |
| ----------------------------------------------------------------------- | --------------------------------- |
| Repair guide recommends verify when tasks are complete                  | `transition.spec.ts:1170`         |
| Status omitted verifying before the failed transition                   | `transition.spec.ts:972`          |
| Predicate progress uses gerund label                                    | `transition.spec.ts:639`          |
| Hook progress uses Running hooks labels                                 | `transition.spec.ts:411`, `:579`  |
| Next flag from ready stays in ready when spec gate on                   | `transition.spec.ts:326`          |
| Spec approval gate active (blocked)                                     | `transition.spec.ts:232`          |
| Signoff gate active (blocked)                                           | `transition.spec.ts:281`          |
| Transition failure renders Repair Guide (stderr)                        | `transition.spec.ts:702`          |
| Structured formats emit progress on stdout (`change-transition` stream) | `transition.spec.ts:493`          |
| HookFailedError is exit 2 without repair guide                          | `transition.spec.ts:390`          |
| Next flag from signed-off maps to archivable                            | `transition.spec.ts:368`          |
| CLI does not keep a from-to next table                                  | `transition.spec.ts:65`           |
| Transition check bus does not share hook-progress stream                | `transition.spec.ts:576`          |
| Transition execute omits approval flags                                 | `transition.spec.ts:135`          |
| Allow-out-of-scope forwarded / omitted                                  | `transition.spec.ts:91`, `:117`   |
| Structured success / failure terminal complete records                  | `transition.spec.ts:493`, `:1060` |

### `cli:change-approve` — 3 / 3

| Scenario                                           | Test                  |
| -------------------------------------------------- | --------------------- |
| Successful spec approval from ready                | `approve.spec.ts:74`  |
| Successful signoff from done                       | `approve.spec.ts:258` |
| JSON output on successful approval (GIVEN `ready`) | `approve.spec.ts:137` |

### `cli:change-archive` — 4 / 4

| Scenario                                        | Test                  |
| ----------------------------------------------- | --------------------- |
| Change in archiving may retry archive           | `archive.spec.ts:217` |
| Text gerund check progress + hook bus           | `archive.spec.ts:452` |
| JSON stream check-progress then complete        | `archive.spec.ts:114` |
| JSON output on success (stream terminal record) | `archive.spec.ts:88`  |

---

## `cli:change-status`

**Merged verify scenarios:** 37  
**Unit tests:** 34

### Requirements compliance

| Requirement (preview)                                                  | Implementation                                                            | Tests                                                                          | Status       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| Lifecycle projections from GetStatus checks (no local graph filter)    | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` | `Lifecycle projections from GetStatus` describe block                          | ✅ Compliant |
| Drafted JSON empties hops + null `nextAction.command`                  | `status.ts:145-180`                                                       | `JSON drafted status includes isDrafted and empty transitions`                 | ✅ Compliant |
| Text omits duplicated review file lists                                | Review header only; overlap peers in `overlap:` section                   | Drift, overlap, artifact-review-required tests                                 | ✅ Compliant |
| Text blockers include gerund `label`                                   | `! CODE — label: message` when `b.label` set                              | Text + JSON blocker label tests                                                | ✅ Compliant |
| JSON/TOON serialize `label`, `checkId` on blockers                     | `status.ts:410-416`                                                       | `JSON output includes blockers label and checkId`                              | ✅ Compliant |
| Help JSON schema lists `overlapDetail` and clarifies lifecycle nesting | `status.ts:105-110, 125`                                                  | `help documents nested schema.artifactDag and overlapDetail`; runtime `--help` | ✅ Compliant |
| Incomplete tasks → omit `verifying` from displayed hops                | Delegates to GetStatus (no CLI re-add)                                    | `given GetStatus omits verifying…`                                             | ✅ Compliant |
| `nextAction` follows GetStatus (verify vs implement)                   | Serializes `statusResult.nextAction` unchanged                            | `given GetStatus recommends verify…`                                           | ✅ Compliant |
| `artifact-review-required` text omits file paths under `review:`       | Same omission logic as drift/overlap                                      | `given artifact-review-required…`                                              | ✅ Compliant |
| Delegates refresh policy                                               | No direct `RefreshImplementationTracking` call                            | `Normal status output` asserts no refresh call                                 | ✅ Compliant |

### Discrepancies

None.

---

## `cli:change-transition`

**Merged verify scenarios:** 45  
**Unit tests:** 37

### Requirements compliance

| Requirement (preview)                                                                                    | Implementation                                                     | Tests                                     | Status       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------ |
| No approval-gate CLI routing                                                                             | Targets passed verbatim; no `pending-*` rewrite                    | Success + blocked gate tests              | ✅ Compliant |
| `--next` → `to: 'next'` (no local from→to table)                                                         | `transition.ts:255-256, 264`                                       | `--next` resolution tests                 | ✅ Compliant |
| `--allow-out-of-scope` forwarded / omitted by default                                                    | `transition.ts:266, 132`                                           | Dedicated tests                           | ✅ Compliant |
| Omit approval flags on execute                                                                           | Only `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`    | `Transition execute omits approval flags` | ✅ Compliant |
| Repair guide on stderr (text) with check labels                                                          | `writeTextRepairGuide`                                             | Repair Guide + typed-error tests          | ✅ Compliant |
| JSON failure: terminal `change-transition` `complete` with `result: "failure"`, `blockers`, `nextAction` | `transition.ts:298-311`                                            | `JSON incomplete-tasks failure…`          | ✅ Compliant |
| JSON success: terminal `complete` with `result: "ok"`, `from`, `to`                                      | `transition.ts` presenter                                          | `JSON output on successful transition`    | ✅ Compliant |
| `HookFailedError` → exit 2, no repair guide                                                              | Rethrown to `handleError`                                          | Hook failure tests                        | ✅ Compliant |
| Check progress bus (not `hook-progress`)                                                                 | `createCheckProgressPresenter` + `streamName: 'change-transition'` | Progress + JSON stream tests              | ✅ Compliant |
| Help mentions failure terminal record                                                                    | `--help` output                                                    | Runtime `--help` check                    | ✅ Compliant |
| Pre/repair GetStatus skips refresh                                                                       | `refreshImplementationTracking: false`                             | Blocked-gate + repair-guide tests         | ✅ Compliant |

### Discrepancies

None.

---

## `cli:change-approve`

**Merged verify scenarios:** 12  
**Unit tests:** 12

### Requirements compliance

| Requirement (preview)                                      | Implementation                               | Tests                                           | Status       |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------ |
| Approve spec from `ready` (drain: `pending-spec-approval`) | Delegates to `kernel.changes.approveSpec`    | `records spec approval from ready…`, drain test | ✅ Compliant |
| Approve signoff from `done` (drain: `pending-signoff`)     | Delegates to `kernel.changes.approveSignoff` | `records signoff from done…`, drain test        | ✅ Compliant |
| No gate flags on execute input                             | `{ name, reason }` only                      | Call-shape assertions in spec/signoff tests     | ✅ Compliant |
| Help uses bound-from language (`ready` / `done`)           | `--help` text                                | Runtime matches preview                         | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                          | stdout assertions                               | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                          | JSON tests                                      | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                   | Missing-reason test                             | ✅ Compliant |

### Discrepancies

None.

---

## `cli:change-archive`

**Merged verify scenarios:** 18  
**Unit tests:** 19

### Requirements compliance

| Requirement (preview)                                                      | Implementation                                                | Tests                                                | Status       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| Signature includes `--allow-out-of-scope`                                  | Option + forward to execute                                   | Test present                                         | ✅ Compliant |
| Prerequisites: `archivable` **or** `archiving` (delegate to ArchiveChange) | No CLI-only archivable gate; forwards to execute              | `forwards archive when change is in archiving state` | ✅ Compliant |
| Check progress bus (gerund labels, hooks on same bus)                      | `_check-progress-presenter` via `makeArchiveProgressRenderer` | Text + JSON stream tests                             | ✅ Compliant |
| JSON success: NDJSON `change-archive` stream terminal `complete`           | `archive.ts:125-136`                                          | JSON + stream-order tests                            | ✅ Compliant |
| No second unwrapped `{ result: "ok" }` after stream                        | Single structured record on success                           | JSON tests                                           | ✅ Compliant |
| Text success: archive path + optional invalidated summary                  | `archive.ts:115-123`                                          | Text tests                                           | ✅ Compliant |
| Post-hook failure → exit 2                                                 | `archive.ts:110-113`                                          | Test present                                         | ✅ Compliant |
| Help description mentions archivable/archiving retry                       | Source + bundled dist aligned                                 | Runtime `--help`                                     | ✅ Compliant |

### Discrepancies

None.

---

## JSON failure / success payloads

| Command                     | Preview contract                                                                                                         | Implementation               | Test |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---- |
| `change transition` success | NDJSON terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "ok", name, from, to } } }` | Implemented                  | ✅   |
| `change transition` failure | NDJSON terminal `{ … result: "failure", blockers, nextAction }`                                                          | `transition.ts:298-311`      | ✅   |
| `change status`             | JSON blockers include optional `label`, `checkId`; full `review` incl. `overlapDetail`                                   | `status.ts:410-416, 461-475` | ✅   |
| `change approve`            | Success only: `{ result, gate, name }`                                                                                   | `approve.ts:49, 87`          | ✅   |
| `change archive`            | Success stream terminal record                                                                                           | `archive.ts:125-136`         | ✅   |

---

## Progress presenters

| Command             | Preview                                                                                                   | Implementation                                   | Tests          |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------- |
| `change transition` | Generic check bus; hooks as `Running pre/post hooks`; no `Executing:`; JSON `stream: "change-transition"` | `_check-progress-presenter.ts` + `transition.ts` | ✅ extensive   |
| `change archive`    | Same pattern; `stream: "change-archive"`                                                                  | `archive.ts:32-44`                               | ✅ text + JSON |

---

## Summary counts

| Category                                    |       Count |
| ------------------------------------------- | ----------: |
| Specs audited                               |           4 |
| Merged verify scenarios (all four specs)    |         112 |
| Delta-focused verify scenarios              |          30 |
| Delta scenarios fully tested                |      **30** |
| Delta scenarios partial / untested          |       **0** |
| Implementation compliant requirement-groups | **38 / 38** |
| **HIGH discrepancies**                      |       **0** |
| **MEDIUM discrepancies**                    |       **0** |
| **LOW discrepancies**                       |       **0** |

---

## Informational notes (not discrepancies)

1. Several base verify scenarios pre-dating this change (e.g. _Discarded name is not found_, _Status uses the shared SDK projection_) still lack dedicated CLI unit tests; unchanged from prior audits.
2. X-03 help-text fix is verified via source and runtime `--help`; no dedicated assertion for the legacy/lifecycle comment wording (documentation-only change).
3. _Hashes computed by use case from disk_ (approve base scenario) remains an integration concern, not a CLI-layer unit test.

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._

---

# Spec-compliance audit (partial): globals, config, skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`, `core:config`, `skills:skill-templates-source`  
**Focus:** observability facade / no logging cycle, config workflow checks (approvals), skill template lifecycle-transition updates  
**Report:** `20260829-175039`  
**Read-only**

---

## default:\_global/architecture

### Requirements Summary

| Requirement                                            | Verdict  | Evidence                                                                                                                              |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure for packages with business logic     | **PASS** | `@specd/core` maintains `domain/`, `application/`, `infrastructure/`, `composition/` separation                                       |
| Domain layer is pure (I/O-free)                        | **PASS** | No `node:fs` / I/O imports under `packages/core/src/domain/`                                                                          |
| **Exception — ambient Logger**                         | **PASS** | Change delta adds sole cross-layer exception; `packages/core/src/observability/logger.ts`; domain import in `lifecycle-verdict.ts:13` |
| Observability facade, not fourth hexagon layer         | **PASS** | Delta prose; module at `src/observability/` (not `domain/` / `infrastructure/`)                                                       |
| Application layer uses ports only                      | **PASS** | Use cases receive ports via constructor; Logger import explicitly permitted in delta                                                  |
| Application may import ambient Logger                  | **PASS** | `application/logger.ts` re-exports observability facade; used from composition / infrastructure                                       |
| Process-level composition root wires Logger            | **PASS** | `createKernel` → `Logger.setImplementation(createDefaultLogger(...))` in `kernel.ts:275`                                              |
| Manual DI / no module-level singletons (general)       | **PASS** | Ambient Logger is the documented sole exception; wiring remains at composition root                                                   |
| No circular spec dependencies (logging ↔ architecture) | **PASS** | Change delta: architecture has no deps; logging → architecture only                                                                   |
| Package-agnostic architecture spec                     | **PASS** | Preview delta contains no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core` references                                       |
| Curated public entry points (Logger export)            | **PASS** | `Logger` exported via `public.ts` / `application/logger.ts` → observability                                                           |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                     | Covered?    | Tests                                                                                    |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Domain imports ambient Logger permitted      | **Partial** | Compile-time + `lifecycle-verdict.ts` import; no dedicated architecture integration test |
| Application imports ambient Logger permitted | **Partial** | Widespread compile usage via `application/logger.js` re-export                           |
| Domain imports `node:fs` rejected            | **Yes**     | TypeScript layer rules / existing package structure                                      |
| Composition root wires implementation        | **Yes**     | `kernel.spec.ts`, `test/observability/logger.spec.ts`                                    |

### Spec Dependency Chain

- `default:_global/logging` → `default:_global/architecture` (one-way; **PASS**, no cycle)

---

## default:\_global/logging

### Requirements Summary

| Requirement                                                       | Verdict  | Evidence                                                                     |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Console compatibility (`log/info/debug/warn/error`)               | **PASS** | `LoggerPort` + `Logger` static methods in `logger.port.ts` / `logger.ts`     |
| `log()` aliases `info()`                                          | **PASS** | `logger.ts:50-51` delegates `log` → `impl.info`; test asserts alias          |
| Level mapping (`fatal`/`trace` prefixes for minimal/console impl) | **PASS** | `MinimalConsoleLogger` in `logger.spec.ts:81-116` implements prefix contract |
| Log level semantics                                               | **PASS** | `LogLevel` union on port; Pino-backed default logger                         |
| Policy on console usage                                           | **PASS** | Ambient facade replaces direct `console.*` in production paths reviewed      |
| **Ambient Logger — no-op before wiring**                          | **PASS** | `NullLogger` default; tests assert no throw and no console write             |
| **Ambient Logger — composition assigns impl**                     | **PASS** | `kernel.ts:275`                                                              |
| **Ambient import without logger port**                            | **PASS** | `lifecycle-verdict.ts` logs via ambient import, no constructor logger        |
| Spec depends on architecture for exception                        | **PASS** | Change delta `Spec Dependencies` lists architecture only                     |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                           | Covered?    | Tests                                                        |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| Safe before wiring (no throw)                      | **Yes**     | `test/observability/logger.spec.ts`                          |
| Safe before wiring (no console)                    | **Yes**     | Same file, spy on `console.*`                                |
| `log()` ≡ `info()`                                 | **Yes**     | Same file                                                    |
| Delegation after `setImplementation`               | **Yes**     | Same file                                                    |
| Fatal mapping with `[FATAL]` prefix (minimal impl) | **Yes**     | `logger.spec.ts:130-137` — `minimal console logger contract` |
| Trace mapping with `[TRACE]` prefix (minimal impl) | **Yes**     | `logger.spec.ts:140-147` — same describe block               |
| Ambient import without logger port                 | **Partial** | Domain usage exists; no isolated domain-service test         |

---

## core:config

### Requirements Summary

| Requirement                                        | Verdict  | Evidence                                                                                                                              |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Approvals — spec gate disabled by default**      | **PASS** | `config-loader.ts:616` `spec: data.approvals?.spec ?? false`                                                                          |
| **Approvals — signoff gate disabled by default**   | **PASS** | `signoff: data.approvals?.signoff ?? false`                                                                                           |
| **Approvals — explicit `true` values loaded**      | **PASS** | `config-loader.spec.ts:961-973` “parses approvals booleans from config”                                                               |
| **Approvals — layered merge**                      | **PASS** | Merge test preserves `signoff: false` when local overrides `spec: true` (`config-loader.spec.ts:1836-1854`)                           |
| **Spec gate — in-place check, not pending hop**    | **PASS** | Change delta documents stay-in-`ready`; `transition-checks.spec.ts`, `lifecycle-verdict.spec.ts`, `transition-change.spec.ts` enforce |
| **Signoff gate — in-place check, not pending hop** | **PASS** | Change delta documents stay-in-`done`; CLI `transition.spec.ts` asserts no pending rewrite                                            |
| **Redesign exempt from spec gate**                 | **PASS** | Delta prose + `transition-checks.spec.ts:143-253` (`ready → designing` exempt)                                                        |
| **Independent flags**                              | **PASS** | Schema + loader treat `spec` / `signoff` independently                                                                                |
| Depends on `core:transition-checks`                | **PASS** | Change delta `Spec Dependencies` includes transition-checks                                                                           |
| Depends on `default:_global/architecture`          | **PASS** | Change delta `Spec Dependencies`                                                                                                      |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                  | Covered? | Tests                                                                                                                                                                       |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse explicit approvals booleans         | **Yes**  | `config-loader.spec.ts:961-973`                                                                                                                                             |
| Layered approvals merge                   | **Yes**  | `config-loader.spec.ts:1836-1854`                                                                                                                                           |
| Default `spec: false` when omitted        | **Yes**  | `config-loader.spec.ts:976-983` “defaults approvals to false when section omitted”                                                                                          |
| Default `signoff: false` when omitted     | **Yes**  | Same test asserts both flags                                                                                                                                                |
| Spec gate on does not require pending hop | **Yes**  | Verify delta cross-ref: `transition-change.spec.ts`, `cli/test/commands/change/transition.spec.ts:162` (“does not rewrite ready → implementing into pending-spec-approval”) |
| In-place spec gate (not pending hop)      | **Yes**  | `transition-checks.spec.ts`, `lifecycle-verdict.spec.ts`, `get-status.spec.ts:988`                                                                                          |

---

## skills:skill-templates-source

### Requirements Summary

| Requirement                                                         | Verdict  | Evidence                                                                        |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **In-place approval gates in workflow templates**                   | **PASS** | Templates + `template-workflow.spec.ts:70-118`                                  |
| Verify: stay in `done`, no `pending-signoff`                        | **PASS** | `specd-verify/SKILL.md.tpl`; test asserts                                       |
| Implement: no unconditional `ready → implementing` when gate on     | **PASS** | `specd-implement/SKILL.md.tpl`; test asserts                                    |
| Shared: stay-in-state, forbid agent `changes approve`               | **PASS** | `shared.md.tpl`; test asserts                                                   |
| Shared hooks: no pending as happy-path intermediates                | **PASS** | `shared.md.tpl`; test asserts `MUST NOT run source.post` on backward            |
| New: pending rows drain-only                                        | **PASS** | `specd-new/SKILL.md.tpl` table; test asserts                                    |
| Design: stay in `ready` for spec gate                               | **PASS** | `specd-design/SKILL.md.tpl`; test asserts                                       |
| Entry `specd`: router only, no signoff teaching                     | **PASS** | `spec/SKILL.md.tpl`; test asserts                                               |
| Archive: requires `archivable`/`archiving`, signoff wait via verify | **PASS** | `specd-archive/SKILL.md.tpl`; test asserts                                      |
| **Overlap invalidation vs live archive overlap**                    | **PASS** | Hop skills exclude `OVERLAP_CONFLICT` from typical blockers; archive retains it |
| **Implementation tracking in verify/implement**                     | **PASS** | Shared cookbook + verify drain + implement zero-open gate; tests assert         |
| **Archive skill skips only pre hooks**                              | **PASS** | `--skip-hooks pre`, no post double-run; test asserts                            |
| **Design review scope without review file lists**                   | **PASS** | Uses `artifacts (details):` / `affectedArtifacts`; test asserts                 |
| Depends on `core:transition-checks`                                 | **PASS** | Change delta `Spec Dependencies`                                                |
| Template contract tests assert rules                                | **PASS** | `packages/skills/test/template-workflow.spec.ts`                                |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                      | Covered? | Tests                                 |
| --------------------------------------------- | -------- | ------------------------------------- |
| No happy-path pending parking copy            | **Yes**  | `template-workflow.spec.ts:70-118`    |
| Verify drains IMPLEMENTATION_STATE            | **Yes**  | `template-workflow.spec.ts:120-146`   |
| Archive `--skip-hooks pre`                    | **Yes**  | `template-workflow.spec.ts:148-154`   |
| Design review scope                           | **Yes**  | `template-workflow.spec.ts:156-162`   |
| OVERLAP_CONFLICT vs invalidation              | **Yes**  | `template-workflow.spec.ts:164-179`   |
| Optimizer / metadata / command-role contracts | **Yes**  | Same file (pre-existing requirements) |

---

## Cross-spec consistency

| Check                                        | Verdict  | Notes                                                                                             |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Architecture ↔ Logging (ambient exception)   | **PASS** | Mutual references aligned in change deltas                                                        |
| Architecture ↔ Logging (no dependency cycle) | **PASS** | Architecture `dependsOn: (none)`; logging → architecture                                          |
| Config ↔ transition-checks (in-place gates)  | **PASS** | Config delta documents in-place model; templates and lifecycle enforce it                         |
| Skills ↔ transition-checks                   | **PASS** | Templates teach same in-place / drain-only model                                                  |
| Config ↔ skills (approvals UX)               | **PASS** | Config defaults off; templates tell human to run `changes approve`                                |
| Config verify ↔ enforcement specs            | **PASS** | Verify delta scenario cross-references `core:transition-change` and `cli:change-transition` tests |

**Pre-archive note:** Workspace `specs/core/config/spec.md` still carries legacy pending-hop prose until this change archives. Implementation and change deltas already follow the in-place model — not counted as an implementation discrepancy.

---

## Closed vs prior audit (`20260829-172110/_partial-globals-skills.md`)

| Prior finding                                       | Verdict                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D-LOG-1 Pino JSDoc eslint-disable                   | **CLOSED** — `pino-logger.ts` has no file-level eslint-disable; methods carry `@param` JSDoc     |
| D-LOG-2 console-prefix test gap                     | **CLOSED** — `logger.spec.ts:129-148` `minimal console logger contract`                          |
| D-CFG-1 config-loader default-approval test gap     | **CLOSED** — `config-loader.spec.ts:976-983`                                                     |
| D-CFG-2 in-place-gate verify scenario cross-package | **CLOSED** — verify delta adds scenario with explicit cross-ref to transition-change / CLI tests |
| D1 `DEPS_INCONSISTENT` (architecture/logging cycle) | **CLOSED** (prior)                                                                               |
| D2 bidirectional logging ↔ architecture cycle       | **CLOSED** (prior)                                                                               |
| D3 per-package wiring MEDIUM                        | **CLOSED** (prior)                                                                               |
| D4 JSDoc eslint-disable on observability logger     | **CLOSED** (prior)                                                                               |
| D5 observability layer unnamed                      | **CLOSED** (prior)                                                                               |

---

## Summary counts

| Spec                            | Requirements checked | PASS   | Partial | FAIL  | HIGH  | MEDIUM | LOW   |
| ------------------------------- | -------------------- | ------ | ------- | ----- | ----- | ------ | ----- |
| `default:_global/architecture`  | 11                   | 11     | 0       | 0     | 0     | 0      | 0     |
| `default:_global/logging`       | 9                    | 9      | 0       | 0     | 0     | 0      | 0     |
| `core:config`                   | 10                   | 10     | 0       | 0     | 0     | 0      | 0     |
| `skills:skill-templates-source` | 14                   | 14     | 0       | 0     | 0     | 0      | 0     |
| **Total**                       | **44**               | **44** | **0**   | **0** | **0** | **0**  | **0** |

**Overall:** Implementation conforms to all four scoped specs (including change deltas). **0 HIGH, 0 MEDIUM, 0 LOW.** All three LOW findings from the prior audit are closed. Residual **partial** test coverage only: no dedicated architecture integration test for domain ambient-Logger import (compile-time evidence sufficient for current scope).
