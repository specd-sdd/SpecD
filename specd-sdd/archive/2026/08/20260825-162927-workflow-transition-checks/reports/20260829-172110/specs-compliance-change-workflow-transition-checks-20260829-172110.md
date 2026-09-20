# Specs Compliance Report — `workflow-transition-checks`

**Timestamp:** 20260829-172110  
**Mode:** change (`workflow-transition-checks`)  
**Prior report:** `20260829-155309`  
**Graph:** reindexed fresh  
**Read-only audit**

---

## Executive Summary

| Verdict                 | Detail                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **Overall**             | **Implementation compliant** — all 22 change specs match merged spec-preview                |
| **HIGH**                | **0**                                                                                       |
| **MEDIUM**              | **1** — optional integrated status→transition test (CT-04); behaviour covered by unit tests |
| **LOW**                 | **7** — verify-delta hygiene, GAI selector titles, help-text clarity, logging test gaps     |
| **Functional blockers** | **None**                                                                                    |

### vs prior audit (`155309`)

| Area                         | Before          | After                         |
| ---------------------------- | --------------- | ----------------------------- |
| CLI test gaps                | 4 MEDIUM, 3 LOW | **1 MEDIUM (partial), 1 LOW** |
| lifecycle-core LOW           | 5               | **2** (verify delta hygiene)  |
| config default-approval test | missing         | **CLOSED**                    |
| Implementation defects       | 0               | **0**                         |

### Aggregated counts

| Batch          |  Specs |  HIGH | MEDIUM |   LOW |
| -------------- | -----: | ----: | -----: | ----: |
| lifecycle-core |      6 |     0 |      0 |     2 |
| use-cases      |      8 |     0 |      0 |     1 |
| CLI            |      4 |     0 |      1 |     1 |
| globals+skills |      4 |     0 |      0 |     3 |
| **Total**      | **22** | **0** |  **1** | **7** |

### Residual (optional)

1. **MEDIUM (CT-04):** Chained status→transition test for "verifying omitted before failed transition" — isolated tests already pass.
2. **LOW:** GAI verify selectors still anchor on base "engine-derived" titles; lifecycle verify delta orphaned hop-matrix scenarios; `change status --help` nesting comment; Pino JSDoc eslint-disable; console-prefix tests.

Change still has `ARTIFACT_DRIFT` on specs/verify — expected; next step `/specd-design`.

---

## Detailed Findings (verbatim partial reports)

---

---

# Partial Audit: lifecycle-core

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-172110`  
**Graph:** indexed `2026-08-29T15:21:36Z`, fresh (`stale: false`)  
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

## Prior Audit Delta (20260829-155309)

| Prior item                                     | Status (this audit)                                         |
| ---------------------------------------------- | ----------------------------------------------------------- |
| 0 HIGH / 0 MEDIUM                              | **Confirmed**                                               |
| 5 LOW cosmetic                                 | **3 CLOSED**, **2 OPEN** (see below)                        |
| `lifecycle-engine.spec.ts` rename              | **CLOSED** → `lifecycle-verdict.spec.ts`                    |
| `transitionBlockers` DAG fallback undocumented | **CLOSED** → spec LE-6 now explicitly permits DAG-only walk |
| Verdict-derived markdown fixture               | **CLOSED** → `markdown-parser-real-merge.spec.ts:122,148`   |
| Lifecycle verify delta parent selector (L3)    | **OPEN** → orphaned verify scenarios                        |
| GAI verify selector title (L4)                 | **Out of scope** (not in this batch); cross-ref only        |

---

## Per-Spec Findings

### `core:lifecycle-engine`

#### Requirements Summary

| ID    | Requirement                         | Essence                                                                                                                                                   |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `lifecycle-verdict.ts`; no `LifecycleEngine` class; domain `nextHop` without `command`.                                                |
| LE-2  | Centralized validation logic        | Project caller-supplied `CheckResult`s only; no I/O, no effects, no snapshot-bag fallback.                                                                |
| LE-3  | Effective artifact status           | Review/incomplete upstream mapping; parent-review wins over in-progress.                                                                                  |
| LE-4  | Canonical-state-only                | No extra lifecycle states from display drift projections.                                                                                                 |
| LE-5  | Machine-readable blockers           | Standard codes; skippable bypass omits blockers; no `warnings` field.                                                                                     |
| LE-6  | Available steps and domain next hop | Single predicate evaluation; `blockingArtifacts` from check `details` when checks present; `transitionBlockers` MAY use DAG-only walk when checks absent. |
| LE-7  | Archiving escape transitions        | `archiving` exposes `archivable`/`designing`; recovery skips requires.                                                                                    |
| LE-8  | Review summary integration          | Historical overlap → review reason, not `OVERLAP_CONFLICT` blocker.                                                                                       |
| LE-9  | Shared lifecycle interpretation     | Consumers share verdict; `CompileContext` excluded; empty `checksByTarget` still yields DAG answers.                                                      |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command`.                                                                                                        |
| LE-11 | Next artifact topological order     | `topologicalOrder()` + `parentsOf()` dependency readiness.                                                                                                |
| LE-12 | No LifecycleEngine class            | Compatibility barrel re-exports domain functions only.                                                                                                    |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                                                                                                                                                 |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LE-1      | **Implemented** | `evaluateLifecycleVerdict` at `lifecycle-verdict.ts:142`. No `LifecycleEngine` class in src/dist. `public-api.spec.ts:7-10` asserts absence. Domain `nextHop`: `targetStep`/`actionType`/`reason` only.                                                                  |
| LE-2      | **Implemented** | Filters `availableTransitions` from `checksByTarget` outcomes (`159-172`). No `PredicateSnapshots` / `check.run` fallback.                                                                                                                                               |
| LE-3      | **Implemented** | `effectiveStatus` / `projectArtifacts`; parent-review wins (`lifecycle-verdict.spec.ts:173-187`).                                                                                                                                                                        |
| LE-4      | **Implemented** | Canonical status only; tests `complete-with-drift` / `hasDrift` at `lifecycle-verdict.spec.ts:467-519`.                                                                                                                                                                  |
| LE-5      | **Implemented** | `blockersFromFailedChecks`; bypass filtering; drift/review affectedArtifacts tests in verify preview + specs.                                                                                                                                                            |
| LE-6      | **Implemented** | `blockingArtifactIds` (`752-768`): when checks present, reads failed `workflow.requires` `details.artifactId`; `transitionBlockers` DAG fallback at `227-230` matches spec permission. Test: `blockingArtifacts follow check details` (`lifecycle-verdict.spec.ts:149`). |
| LE-7–LE-8 | **Implemented** | Archiving skip at `217-218`; overlap review hop tests (`lifecycle-verdict.spec.ts:394-435`).                                                                                                                                                                             |
| LE-9      | **Implemented** | `validate-artifacts.ts:220-221` calls with `checksByTarget: {}`. Shared-consumer scenarios in verify preview.                                                                                                                                                            |
| LE-10     | **Implemented** | `lifecycle-evaluation.ts` attaches `nextAction` via guidance; hop-matrix tests in `lifecycle-verdict.spec.ts:604-822`.                                                                                                                                                   |
| LE-11     | **Implemented** | `nextArtifact` uses `topologicalOrder()` + `parentsOf()` (`774-788`, `1013`). Test: topological order at `lifecycle-verdict.spec.ts:499`.                                                                                                                                |
| LE-12     | **Implemented** | `lifecycle-engine.ts` compatibility barrel only (`packages/core/src/domain/services/lifecycle-engine.ts:1-19`).                                                                                                                                                          |

#### Discrepancies

| Sev | ID  | Finding                                                                       | Evidence                                                                                                                                                                                                                                                                                     | Interpretation                                                                                                                                                        |
| --- | --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOW | L1  | Verify delta `added` scenarios for hop matrix not present in merged preview   | Delta `deltas/core/lifecycle-engine/verify.md.delta.yaml:49-106` parents on `^Requirement: Available steps and next action$`; preview verify has only Skip bypass + Overlap review under `domain next hop`; `rg` finds no "Incomplete tasks exclude" / "Complete tasks recommend" in preview | **spec-wrong (delta hygiene):** parent selector stale after spec rename; scenarios orphaned. **Code OK:** equivalent coverage in `lifecycle-verdict.spec.ts:604-822`. |
| LOW | L2  | Verify scenario title still says "Engine unifies three validation dimensions" | Preview verify under Centralized validation logic                                                                                                                                                                                                                                            | **spec-wrong (cosmetic):** rename to "Verdict unifies…" for vocabulary consistency; behavior tested.                                                                  |

#### Test Coverage

| Requirement / scenario               | Tests                                                                  | Adequacy                                 |
| ------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------- |
| No LifecycleEngine class             | `public-api.spec.ts`                                                   | Adequate                                 |
| nextHop without command              | `lifecycle-verdict.spec.ts` `describe('evaluateLifecycleVerdict')`     | Adequate                                 |
| Effective status / parent-review     | Multiple lifecycle-verdict tests                                       | Adequate                                 |
| blockingArtifacts from check details | `blockingArtifacts follow check details`                               | Adequate                                 |
| transitionBlockers DAG fallback      | Archiving recovery + empty-check callers (`validate-artifacts.ts:220`) | Adequate (spec now documents intent)     |
| Hop matrix / taskCompletion gating   | `lifecycle-verdict.spec.ts:604-694`                                    | Adequate in code; **verify.md gap** (L1) |
| nextAction.command                   | `describe('evaluateLifecycle')` cases                                  | Adequate                                 |
| nextArtifact DAG order               | `lifecycle-verdict.spec.ts:499`                                        | Adequate                                 |

**Gaps:** no automated test that domain modules never import `application/logger` (indirect via architecture); verify.md missing hop-matrix scenarios due to delta selector (L1).

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
| CH-1 | Lifecycle / VALID_TRANSITIONS | Protocol table; entity owns persisted state; no new pending parking hops.                                 |
| CH-2 | Artifacts                     | `pending-parent-artifact-review` is **verdict-derived**; not persistable; wire sanitize to `in-progress`. |
| CH-3 | Guidance ownership            | Domain `nextHop`; application attaches `command`.                                                         |
| CH-4 | assertArchivable              | Entity asserts `archivable` or `archiving`.                                                               |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                                                                                               |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CH-1 | **Implemented** | `VALID_TRANSITIONS` in change entity; transition validity tests across change/transition-change specs.                                                                                                 |
| CH-2 | **Implemented** | Preview: verdict-derived (`spec-preview` line ~189). `ArtifactFile` rejects token (`artifact-file.ts:54`). Load/save sanitize (`change-repository.ts:1700-1701`; `change-repository.spec.ts:664-692`). |
| CH-3 | **Implemented** | Separation in `lifecycle-evaluation.ts` / `lifecycle-guidance.ts`.                                                                                                                                     |
| CH-4 | **Implemented** | `assertArchivable` covers archivable or archiving (entity tests).                                                                                                                                      |

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

| Req       | Status          | Evidence                                                                                                                                                                            |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1–WM-6 | **Implemented** | Availability flows through verdict projections; task completion via `CountTasks` in check execute; `compile-context.ts` has no `evaluateLifecycleVerdict` (graph + grep confirmed). |

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

| Req  | Status          | Evidence                                                                                                                                                                                                                                         |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SF-1 | **Implemented** | Cascade in `projectArtifacts`; no `Change.effectiveStatus()` in `packages/core/src`.                                                                                                                                                             |
| SF-2 | **Implemented** | `ArtifactDag.parentsOf` (`artifact-dag.ts:140-142`); `artifact-dag.spec.ts:47-51`.                                                                                                                                                               |
| SF-3 | **Implemented** | `requiresForArtifact` uses `parentsOf` (`lifecycle-verdict.ts:1013`); `nextArtifact` uses `parentsOf` (`782-785`); consumers per graph impact (`validate-artifacts`, `transition-change`, `edit-change`, `invalidate-change`, `archive-change`). |

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

| Req       | Status          | Evidence                                                                                                                                                  |
| --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-1      | **Implemented** | Delta + preview align cascade with lifecycle-engine; no repository cascade logic.                                                                         |
| ST-2–ST-4 | **Implemented** | `change-repository.ts` load drift + `persistableArtifactStatus` (`1694-1701`); validate uses verdict with empty checks (`validate-artifacts.ts:220-221`). |

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

| Check                                                                 | Result                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Architecture ↔ domain (no Core names in global preview)               | **Pass**                                                                                         |
| Logging ↔ architecture dependency                                     | **Pass**                                                                                         |
| Change CH-2 ↔ lifecycle LE-3 ↔ storage ST-1/ST-3                      | **Pass** — unified "verdict-derived" / `projectArtifacts` vocabulary in preview, code, and tests |
| Workflow-model WM-3 ↔ lifecycle LE-9                                  | **Pass** — single verdict authority; CompileContext excluded                                     |
| Schema-format SF-3 ↔ lifecycle LE-11                                  | **Pass** — `parentsOf` + `topologicalOrder()` aligned                                            |
| Transition-checks registry ↔ workflow-model axis                      | **Pass** — shared `classifyAlong` / `AXIS_FALLBACK`                                              |
| Lifecycle LE-6 transitionBlockers fallback ↔ WM-3 empty-check callers | **Pass** — spec now documents DAG-only walk; ValidateArtifacts uses empty `checksByTarget`       |
| Change manifest tracks test rename                                    | **Pass** — `manifest.json` lists `lifecycle-engine.spec.ts` as `removed`                         |

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
| LOW      | 2     |

| Metric               | Count |
| -------------------- | ----- |
| Requirements checked | 44    |
| Implemented          | 44    |
| Partial              | 0     |
| Missing              | 0     |

**Partial (documentation only):** verify.md hop-matrix scenarios absent from merged preview (L1); cosmetic "Engine unifies" verify title (L2). All behaviors covered by `lifecycle-verdict.spec.ts`.

**Prior-fix verification:** rename to `lifecycle-verdict.spec.ts`, LE-6 `transitionBlockers` clarification, and verdict-derived markdown fixture are **confirmed closed**.

**Highest-signal residual:** 0 HIGH, 0 MEDIUM. Implementation fully matches change spec previews for all six specs. Remaining LOW items are verify-delta selector hygiene (orphaned scenarios with code-test coverage elsewhere) and one legacy "Engine" scenario title in verify preview.

---

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change (read-only audit)
- **Change:** `workflow-transition-checks`
- **Report:** `20260829-172110`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:archive-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:hook-execution-model`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** fresh (`lastIndexedAt: 2026-08-29T15:21:36Z`, `stale: false`); navigation via `graph search` / `graph impact` on use-case symbols
- **Code paths:** `packages/core/src/application/use-cases/*.ts`, `packages/core/src/composition/use-cases/*.ts`, `packages/core/src/application/checks/hook-*.ts`, matching tests under `packages/core/test/`
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior batch:** `reports/20260829-155309/_partial-use-cases.md` (compliant; LOW: GAI verify "engine" scenario titles in selectors)

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

### Closed vs prior `20260829-155309` (this batch)

| Prior claim                                                       | Re-verify (this pass)                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus **engine JSDoc**                                        | **CLOSED.** Zero `engine` matches in `get-status.ts`; debug logs say `evaluateLifecycle verdict`.                                             |
| Drafted path `projectArtifacts` only (D2)                         | **CLOSED.** `_buildDraftedResult` (`:640-667`) uses `projectArtifacts` only; no `evaluateLifecycle` / `evaluateLifecycleVerdict` calls.       |
| Drafted `nextAction.command === null` test gap                    | **CLOSED.** `get-status.spec.ts:815`.                                                                                                         |
| Approve spec/signoff **engine check bindings** wording            | **CLOSED.** Preview says "`from` states … come from **check registry bindings**".                                                             |
| Validate-artifacts title "DAG lifecycle from **engine** evaluate" | **CLOSED.** Preview requirement heading uses `evaluateLifecycleVerdict`.                                                                      |
| `LifecycleEngine` class / ctor injection                          | **CLOSED.** No `class LifecycleEngine` under `packages/core/src`. Composition `resolve*Deps` for scoped UCs expose no `lifecycle` key.        |
| GAI verify scenario **content** uses verdict wording              | **PARTIAL.** Delta content updated to "verdict-derived" / "when the verdict reports" but selectors still target old "engine" titles (see D1). |

### Per-spec implementation

**GetStatus — IMPLEMENTED**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle`; domain `projectArtifacts` `:12-17`.
- Active path: `projectArtifacts` → `executeChecksByLegalTargets` (no `failFastOn`) → archive predicates when `archivable` → `evaluateLifecycle` `:481-484`. Task paint from `taskCompletionFromChecks` after checks.
- Drafted: `_buildDraftedResult` `:621-715` — `projectArtifacts` only `:640-667`; empty hops `:673-676`; `nextArtifact: null` `:679`; `nextAction.command: null` `:709-713`.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor matches TC-7 (no `RunStepHooks`).
- `to === 'next'` uses `HAPPY_PATH_NEXT`.
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with per-target `checksByTarget`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); no pending rewrite.
- Hook effects: `matchingEffects` + `executeCheckWithProgress` `:252+`; `skipHookPhases` in context.
- `resolveTransitionChangeDeps` — no lifecycle key.

**ArchiveChange — IMPLEMENTED**

- Ctor `:222-250` — `archiveBindings` injected; no `RunStepHooks` parameter.
- `resolveArchiveChangeDeps` `composition/use-cases/archive-change.ts:105-119` — `archiveBindings` from registry; no `runStepHooks` on deps interface.
- Schema guard: `executeMatchingPredicates` with `{ failFastOn: 'schema.nameMatch' }` `:280-292`.
- Pre/post hooks: `matchingEffects(..., 'before-persist')` `:323-347`; `matchingEffects(..., 'after-persist')` `:529+`.
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

#### D1 — GAI verify delta selectors still target **"engine"** scenario titles (prior — **STILL OPEN**, spec-only)

**Evidence (verify delta selectors):**

`deltas/core/get-artifact-instruction/verify.md.delta.yaml`:

- Line 93: `matches: '^Scenario: Omitted artifactId uses engine-derived readiness$'`
- Line 107: `matches: '^Scenario: Omitted artifactId ignores persisted complete when engine reports dependency blockage$'`

**Evidence (delta content — updated but mismatched selectors):**

Same file lines 95-114 — new scenario titles:

- `#### Scenario: Omitted artifactId uses verdict-derived readiness`
- `#### Scenario: Omitted artifactId ignores persisted complete when the verdict reports dependency blockage`

Scenario bodies correctly reference `evaluateLifecycleVerdict`. Selectors still anchor on legacy "engine" titles, creating a delta-application / traceability mismatch.

**Evidence (code):** `get-artifact-instruction.ts:97-108` uses `evaluateLifecycleVerdict` with empty `checksByTarget`. Test spies `evaluateLifecycleVerdict` (`get-artifact-instruction.spec.ts:98`).

**Option A (prefer):** Update selector `matches` patterns to the new scenario titles ("verdict-derived readiness", "when the verdict reports dependency blockage").

**Option B:** Reintroduce an "engine" abstraction — **rejected** (no `LifecycleEngine` class).

**Severity:** documentation / verify-selector drift only; behaviour compliant.

#### D2 — `core:lifecycle-engine` dependency id naming (INFO — not a code violation)

Several assigned specs list `core:lifecycle-engine` in Spec Dependencies while implementation imports `evaluateLifecycle` / `evaluateLifecycleVerdict` module functions. The lifecycle-engine spec describes module functions, not a class. Consistent with prior audits; not a functional discrepancy.

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

| Gap                                                             | Spec                        | Suggested assertion                                                                                   |
| --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| GAI verify selector "engine" titles                             | GAI verify D1               | Update selector `matches` to new scenario titles; behaviour tested via `evaluateLifecycleVerdict` spy |
| Hook ordering schema before project                             | HEM-11                      | Schema with base + override hooks; assert execution order                                             |
| ArchiveChange orphan backup at UC level                         | AC-11                       | Integration test calling `execute` when `.specd-archive-backup/` exists                               |
| Composition never resolves `lifecycle` (explicit key assertion) | GS-11 / TC-6 / VA-3 / GAI-3 | Optional: `expect(deps).not.toHaveProperty('lifecycle')` in composition tests                         |
| GetStatus hop with two fails at use case level                  | GS-9                        | Runner test exists; optional UC-level two-fail hop integration                                        |

**Closed vs 155309:** drafted `nextAction.command === null` — **not missing**. Draft `evaluateLifecycle` spy — **not missing**. GetStatus engine JSDoc — **not missing**. Approve bindings "engine" wording — **not missing**. Validate-artifacts "engine evaluate" title — **not missing**.

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

| Metric                                           | Count                                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| Specs in this batch                              | 8                                                     |
| Requirements tracked (tables above)              | 58                                                    |
| Implemented (behaviour)                          | 58 / 58                                               |
| Partial / wording-only                           | 1 (D1 GAI verify selector "engine" titles)            |
| Functional discrepancies                         | 0 HIGH; 0 MEDIUM; 0 LOW functional                    |
| Missing tests                                    | 2 INFO (HEM-11 ordering, AC-11 UC orphan); 3 optional |
| Prior GetStatus engine JSDoc                     | **CLOSED**                                            |
| Prior drafted `command` null test                | **CLOSED**                                            |
| Prior drafted `projectArtifacts`                 | **CLOSED**                                            |
| Prior approve-spec "engine bindings"             | **CLOSED**                                            |
| Prior validate-artifacts "engine evaluate" title | **CLOSED**                                            |
| Prior GAI verify "engine" selectors              | **OPEN (LOW, spec-only)**                             |
| `LifecycleEngine` class                          | **ABSENT**                                            |
| domain → application imports                     | **ABSENT**                                            |

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

---

# Partial compliance report — CLI (`packages/cli`)

**Change:** `workflow-transition-checks`  
**Report:** `20260829-172110`  
**Prior report:** `20260829-155309` (4 MEDIUM, 3 LOW)  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)

---

## Executive summary

| Metric                                 |      Prior (155309) |                                              Current (172110) |
| -------------------------------------- | ------------------: | ------------------------------------------------------------: |
| Specs audited                          |                   4 |                                                             4 |
| Merged verify scenarios (total)        |                 112 |                                                           112 |
| **Compliant (implementation)**         |  35 / 38 req-groups |                                                   **38 / 38** |
| **Partial (implementation)**           | 1 (stale dist help) |                                                         **0** |
| **Non-compliant (implementation)**     |                   0 |                                                         **0** |
| **Delta-focused verify scenarios**     |                  30 |                                                            30 |
| **Delta scenarios with tests**         |                  21 |                                                        **29** |
| **Delta scenarios partial / untested** |                   9 |                                                         **1** |
| Discrepancies — **HIGH**               |                   0 |                                                         **0** |
| Discrepancies — **MEDIUM**             |                   4 |                                                         **1** |
| Discrepancies — **LOW**                |                   3 |                                                         **1** |
| Unit tests (`it` blocks)               |                ~112 | **101** (34 status + 36 transition + 12 approve + 19 archive) |

**Overall:** All four CLI commands match the merged spec-preview in source and in the rebuilt bundled CLI. Eight of nine prior test gaps are closed. One cross-command verify scenario (`change-transition`: _Status omitted verifying before the failed transition_) remains partially covered. One pre-existing LOW help-text nit on `change status` persists.

---

## Prior findings — resolution status

| Prior ID | Severity | Finding                                                             | Status                                                                          |
| -------- | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CS-01    | MEDIUM   | Incomplete tasks omit `verifying` from displayed hops               | **FIXED** — `status.spec.ts` `Lifecycle projections from GetStatus`             |
| CS-02    | MEDIUM   | `nextAction` verify vs implement follows GetStatus                  | **FIXED** — `status.spec.ts:1034`                                               |
| CS-03    | MEDIUM   | `artifact-review-required` omits duplicated review paths            | **FIXED** — `status.spec.ts:1154`                                               |
| CS-04    | LOW      | JSON `blockers[].label` untested                                    | **FIXED** — `status.spec.ts:1061`                                               |
| CT-01    | MEDIUM   | Spec approval gate blocked (exit 1, stay `ready`)                   | **FIXED** — `transition.spec.ts:231`                                            |
| CT-02    | MEDIUM   | Signoff gate blocked (exit 1, stay `done`)                          | **FIXED** — `transition.spec.ts:280`                                            |
| CT-03    | MEDIUM   | `--next` from `ready` blocked by spec gate                          | **FIXED** — `transition.spec.ts:325`                                            |
| CT-04    | MEDIUM   | Status omits `verifying` _before_ failed transition (cross-command) | **OPEN (partial)** — status isolation tested; no chained status→transition test |
| CA-01    | MEDIUM   | `archiving` state may retry archive                                 | **FIXED** — `archive.spec.ts:217`                                               |
| X-01     | LOW      | Bundled `dist` archive description stale                            | **FIXED** — `dist/index.js:2378` matches source                                 |
| X-02     | LOW      | `change transition --help` omits failure JSON schema                | **FIXED** — help documents failure `complete` record                            |
| CT-05    | LOW      | (same as X-02)                                                      | **FIXED**                                                                       |
| X-03     | LOW      | `change status --help` drafted-only `availableTransitions` comment  | **OPEN** — documentation clarity only; behavior correct                         |

---

## Cross-cutting findings

| ID    | Severity | Area      | Finding                                                                                                                                                                                                                                          | Evidence                                                                               |
| ----- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| X-03  | LOW      | Help text | `change status --help` notes top-level `availableTransitions` as _drafted JSON only_; active hops live under `lifecycle`. Correct in source; easy to misread.                                                                                    | `status.ts:105-110`; runtime `--help`                                                  |
| CT-04 | MEDIUM   | Test gap  | Verify scenario _Status omitted verifying before the failed transition_ expects a status call **before** a transition attempt in one flow. Status projection is unit-tested; incomplete-tasks transition is unit-tested; no integrated sequence. | Preview `change-transition/verify.md`; `status.spec.ts:1008`; `transition.spec.ts:971` |

Shared infrastructure **`_check-progress-presenter.ts`** remains compliant: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## `cli:change-status`

**Merged verify scenarios:** 37  
**Unit tests:** 34

### Requirements compliance

| Requirement (preview)                                               | Implementation                                                            | Tests                                                          | Status       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| Lifecycle projections from GetStatus checks (no local graph filter) | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` | `Lifecycle projections from GetStatus` describe block          | ✅ Compliant |
| Drafted JSON empties hops + null `nextAction.command`               | `status.ts:145-180`                                                       | `JSON drafted status includes isDrafted and empty transitions` | ✅ Compliant |
| Text omits duplicated review file lists                             | Review header only; overlap peers in `overlap:` section                   | Drift, overlap, artifact-review-required tests                 | ✅ Compliant |
| Text blockers include gerund `label`                                | `! CODE — label: message` when `b.label` set                              | Text + JSON blocker label tests                                | ✅ Compliant |
| JSON/TOON serialize `label`, `checkId` on blockers                  | `status.ts:410-416`                                                       | `JSON output includes blockers label and checkId`              | ✅ Compliant |
| Help JSON schema lists `overlapDetail`                              | `status.ts:125`                                                           | `help documents nested schema.artifactDag and overlapDetail`   | ✅ Compliant |
| Incomplete tasks → omit `verifying` from displayed hops             | Delegates to GetStatus (no CLI re-add)                                    | `given GetStatus omits verifying…`                             | ✅ Compliant |
| `nextAction` follows GetStatus (verify vs implement)                | Serializes `statusResult.nextAction` unchanged                            | `given GetStatus recommends verify…`                           | ✅ Compliant |
| `artifact-review-required` text omits file paths under `review:`    | Same omission logic as drift/overlap                                      | `given artifact-review-required…`                              | ✅ Compliant |
| Delegates refresh policy                                            | No direct `RefreshImplementationTracking` call                            | `Normal status output` asserts no refresh call                 | ✅ Compliant |

### Delta-focused verify scenarios (8)

| Scenario                                                                  | Covered |
| ------------------------------------------------------------------------- | ------- |
| Incomplete tasks do not list verifying as available                       | ✅      |
| nextAction implements vs verify follows GetStatus                         | ✅      |
| Drafted JSON empties hops even if Core leaks them                         | ✅      |
| Artifact-review-required does not reprint files under review              | ✅      |
| Drift is shown only in artifacts details                                  | ✅      |
| Overlap peers still print in text                                         | ✅      |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies (+ JSON label) | ✅      |
| Text output shows overlap peers without review file lists                 | ✅      |

### Discrepancies

None material for implementation or delta test scope.

### Pre-existing base-scenario notes (informational)

Several base verify scenarios (e.g. _Discarded name is not found_, _Text DAG does not repeat convergent nodes_, _Status uses the shared SDK projection_) have no dedicated CLI unit tests. These pre-date this change and were not flagged in the prior delta audit.

---

## `cli:change-transition`

**Merged verify scenarios:** 45  
**Unit tests:** 36

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

### Delta-focused verify scenarios (16)

| Scenario                                                                | Covered                     |
| ----------------------------------------------------------------------- | --------------------------- |
| Repair guide recommends verify when tasks are complete                  | ✅                          |
| Status omitted verifying before the failed transition                   | ⚠️ Partial (isolation only) |
| Predicate progress uses gerund label                                    | ✅                          |
| Hook progress uses Running hooks labels                                 | ✅                          |
| Next flag from ready stays in ready when spec gate on                   | ✅                          |
| Spec approval gate active (blocked)                                     | ✅                          |
| Signoff gate active (blocked)                                           | ✅                          |
| Transition failure renders Repair Guide (stderr)                        | ✅                          |
| Structured formats emit progress on stdout (`change-transition` stream) | ✅                          |
| HookFailedError is exit 2 without repair guide                          | ✅                          |
| Next flag from signed-off maps to archivable                            | ✅                          |
| CLI does not keep a from-to next table                                  | ✅                          |
| Transition check bus does not share hook-progress stream                | ✅                          |
| Transition execute omits approval flags                                 | ✅                          |
| Allow-out-of-scope forwarded / omitted                                  | ✅                          |
| Structured success / failure terminal complete records                  | ✅                          |

### Discrepancies

| ID    | Severity | Finding                                                 | Evidence                                 |
| ----- | -------- | ------------------------------------------------------- | ---------------------------------------- |
| CT-04 | MEDIUM   | Cross-command verify scenario untested as a single flow | Preview verify; separate unit tests only |

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
| Help uses bound-from language (`ready` / `done`)           | `--help` text                                | Not asserted in tests; runtime matches preview  | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                          | stdout assertions                               | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                          | JSON tests                                      | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                   | Missing-reason test                             | ✅ Compliant |

### Delta-focused verify scenarios (3)

| Scenario                                           | Covered |
| -------------------------------------------------- | ------- |
| Successful spec approval from ready                | ✅      |
| Successful signoff from done                       | ✅      |
| JSON output on successful approval (GIVEN `ready`) | ✅      |

### Discrepancies

None material. Pre-existing scenario _Hashes computed by use case from disk_ remains an integration concern (not CLI-layer unit test); unchanged from prior audits.

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

### Delta-focused verify scenarios (4)

| Scenario                                        | Covered |
| ----------------------------------------------- | ------- |
| Change in archiving may retry archive           | ✅      |
| Text gerund check progress + hook bus           | ✅      |
| JSON stream check-progress then complete        | ✅      |
| JSON output on success (stream terminal record) | ✅      |

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

| Category                                    |                     Count |
| ------------------------------------------- | ------------------------: |
| Specs audited                               |                         4 |
| Merged verify scenarios (all four specs)    |                       112 |
| Delta-focused verify scenarios              |                        30 |
| Delta scenarios fully tested                |                        29 |
| Delta scenarios partial / untested          |                         1 |
| Implementation compliant requirement-groups |                   38 / 38 |
| **HIGH discrepancies**                      |                     **0** |
| **MEDIUM discrepancies**                    |    **1** (CT-04 test gap) |
| **LOW discrepancies**                       | **1** (X-03 help clarity) |

---

## Recommendations (informational — no code changes in this audit)

1. Add one integrated unit or integration test chaining `change status` then `change transition` with incomplete tasks, asserting `availableTransitions` omits `verifying` before the failed hop (closes CT-04).
2. Optionally clarify `change status --help` JSON schema comment for active vs drafted lifecycle nesting (closes X-03).

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._

---

# Spec-compliance audit (partial): globals, config, skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`, `core:config`, `skills:skill-templates-source`  
**Focus:** observability facade / no logging cycle, config workflow checks (approvals), skill template lifecycle-transition updates  
**Report:** `20260829-172110`  
**Read-only**

---

## default:\_global/architecture

### Requirements Summary

| Requirement                                            | Verdict  | Evidence                                                                                          |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| Layered structure for packages with business logic     | **PASS** | `@specd/core` maintains `domain/`, `application/`, `infrastructure/`, `composition/` separation   |
| Domain layer is pure (I/O-free)                        | **PASS** | No `node:fs` / I/O imports under `packages/core/src/domain/`                                      |
| **Exception — ambient Logger**                         | **PASS** | `packages/core/src/observability/logger.ts`; domain import in `lifecycle-verdict.ts:13`           |
| Observability facade, not fourth hexagon layer         | **PASS** | Change delta prose; module lives at `src/observability/` (not `domain/` / `infrastructure/`)      |
| Application layer uses ports only                      | **PASS** | Use cases receive ports via constructor; Logger import explicitly permitted in delta              |
| Application may import ambient Logger                  | **PASS** | `application/logger.ts` re-exports observability facade; used from composition / infrastructure   |
| Process-level composition root wires Logger            | **PASS** | `createKernel` → `Logger.setImplementation(createDefaultLogger(...))` in `kernel.ts:275`          |
| Manual DI / no module-level singletons (general)       | **PASS** | Ambient Logger is the documented sole exception; wiring remains at composition root               |
| No circular spec dependencies (logging ↔ architecture) | **PASS** | Live `changes status`: `default:_global/architecture` `dependsOn[0]`; logging → architecture only |
| Package-agnostic architecture spec                     | **PASS** | Preview delta contains no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core` references   |
| Curated public entry points (Logger export)            | **PASS** | `Logger` exported via `public.ts` / `application/logger.ts` → observability                       |

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

| Requirement                                                       | Verdict  | Evidence                                                                      |
| ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Console compatibility (`log/info/debug/warn/error`)               | **PASS** | `LoggerPort` + `Logger` static methods in `logger.port.ts` / `logger.ts`      |
| `log()` aliases `info()`                                          | **PASS** | `logger.ts` delegates `log` → `impl.info`; test asserts alias                 |
| Level mapping (`fatal`/`trace` prefixes for minimal/console impl) | **PASS** | Pino adapter uses native levels; spec targets minimal console implementations |
| Log level semantics                                               | **PASS** | `LogLevel` union on port; Pino-backed default logger                          |
| Policy on console usage                                           | **PASS** | Ambient facade replaces direct `console.*` in production paths reviewed       |
| **Ambient Logger — no-op before wiring**                          | **PASS** | `NullLogger` default; tests assert no throw and no console write              |
| **Ambient Logger — composition assigns impl**                     | **PASS** | `kernel.ts:275`                                                               |
| **Ambient import without logger port**                            | **PASS** | `lifecycle-verdict.ts` logs via ambient import, no constructor logger         |
| Spec depends on architecture for exception                        | **PASS** | Preview `Spec Dependencies` lists architecture only                           |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-LOG-1 — Pino adapter retains file-level `eslint-disable jsdoc/require-param`**

- **Spec says:** JSDoc on logging surface (implicit via global docs/eslint conventions).
- **Code says:** `pino-logger.ts:1` disables `jsdoc/require-param`; methods use `@inheritdoc`.
- **Assessment:** Acceptable adapter pattern; observability facade itself has full JSDoc (`logger.ts`). **Partial** only.

**D-LOG-2 — No dedicated tests for console-minimal `fatal`/`trace` prefix mapping**

- **Spec says:** Minimal console implementations must prefix `[FATAL]` / `[TRACE]`.
- **Code says:** Production path uses Pino; `pino-logger.spec.ts` does not exercise prefix mapping.
- **Assessment:** Requirement targets minimal/console fallback, not Pino. **Test gap**, not implementation bug.

### Test Coverage

| Scenario                                  | Covered?    | Tests                                                |
| ----------------------------------------- | ----------- | ---------------------------------------------------- |
| Safe before wiring (no throw)             | **Yes**     | `test/observability/logger.spec.ts`                  |
| Safe before wiring (no console)           | **Yes**     | Same file, spy on `console.*`                        |
| `log()` ≡ `info()`                        | **Yes**     | Same file                                            |
| Delegation after `setImplementation`      | **Yes**     | Same file                                            |
| Ambient import without logger port        | **Partial** | Domain usage exists; no isolated domain-service test |
| Fatal/trace prefix mapping (minimal impl) | **No**      | Not applicable to Pino path; see D-LOG-2             |

---

## core:config

### Requirements Summary

| Requirement                                        | Verdict  | Evidence                                                                |
| -------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| **Approvals — spec gate disabled by default**      | **PASS** | `config-loader.ts:616` `spec: data.approvals?.spec ?? false`            |
| **Approvals — signoff gate disabled by default**   | **PASS** | `signoff: data.approvals?.signoff ?? false`                             |
| **Approvals — explicit `true` values loaded**      | **PASS** | `config-loader.spec.ts:961-973` “parses approvals booleans from config” |
| **Approvals — layered merge**                      | **PASS** | Merge test preserves `signoff: false` when local overrides `spec: true` |
| **Spec gate — in-place check, not pending hop**    | **PASS** | Preview delta documents stay-in-`ready`; no pending-hop as happy path   |
| **Signoff gate — in-place check, not pending hop** | **PASS** | Preview delta documents stay-in-`done`                                  |
| **Redesign exempt from spec gate**                 | **PASS** | Delta prose: `ready → designing` MUST NOT require spec gate             |
| **Independent flags**                              | **PASS** | Schema + loader treat `spec` / `signoff` independently                  |
| Depends on `core:transition-checks`                | **PASS** | Preview `Spec Dependencies` includes transition-checks                  |
| Depends on `default:_global/architecture`          | **PASS** | Preview `Spec Dependencies`                                             |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-CFG-1 — Verify scenario “Spec gate on does not require pending hop” lives outside config package tests**

- **Spec says (verify):** With `approvals.spec: true`, wait is `approval.spec` check, not pending hop.
- **Code says:** In-place gate enforced in lifecycle / transition-checks (`approval-spec.ts`, `transition-change.ts`).
- **Tests say:** Covered in `transition-checks.spec.ts` (binding `approval.spec` from `ready`, forward-only) and lifecycle tests — not in `config-loader.spec.ts`.
- **Assessment:** Behavior **PASS**; scenario is cross-cutting (config documents, lifecycle enforces). Acceptable split.

### Test Coverage

| Scenario                              | Covered? | Tests                                                                              |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| Parse explicit approvals booleans     | **Yes**  | `config-loader.spec.ts:961-973`                                                    |
| Layered approvals merge               | **Yes**  | `config-loader.spec.ts:1836-1854`                                                  |
| Default `spec: false` when omitted    | **Yes**  | `config-loader.spec.ts:976-983` “defaults approvals to false when section omitted” |
| Default `signoff: false` when omitted | **Yes**  | Same test asserts both flags                                                       |
| In-place spec gate (not pending hop)  | **Yes**  | `transition-checks.spec.ts`, lifecycle tests (outside config spec file)            |

---

## skills:skill-templates-source

### Requirements Summary

| Requirement                                                         | Verdict  | Evidence                                                                        |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **In-place approval gates in workflow templates**                   | **PASS** | Templates + `template-workflow.spec.ts:70-118`                                  |
| Verify: stay in `done`, no `pending-signoff`                        | **PASS** | `specd-verify/SKILL.md.tpl`; test asserts                                       |
| Implement: no unconditional `ready → implementing` when gate on     | **PASS** | `specd-implement/SKILL.md.tpl`; test asserts                                    |
| Shared: stay-in-state, forbid agent `changes approve`               | **PASS** | `shared.md.tpl:376-387`; test asserts                                           |
| Shared hooks: no pending as happy-path intermediates                | **PASS** | `shared.md.tpl:502-507`; test asserts `MUST NOT run source.post` on backward    |
| New: pending rows drain-only                                        | **PASS** | `specd-new/SKILL.md.tpl` table; test asserts                                    |
| Design: stay in `ready` for spec gate                               | **PASS** | `specd-design/SKILL.md.tpl`; test asserts                                       |
| Entry `specd`: router only, no signoff teaching                     | **PASS** | `spec/SKILL.md.tpl`; test asserts                                               |
| Archive: requires `archivable`/`archiving`, signoff wait via verify | **PASS** | `specd-archive/SKILL.md.tpl`; test asserts                                      |
| **Overlap invalidation vs live archive overlap**                    | **PASS** | Hop skills exclude `OVERLAP_CONFLICT` from typical blockers; archive retains it |
| **Implementation tracking in verify/implement**                     | **PASS** | Shared cookbook + verify drain + implement zero-open gate; tests assert         |
| **Archive skill skips only pre hooks**                              | **PASS** | `--skip-hooks pre`, no post double-run; test asserts                            |
| **Design review scope without review file lists**                   | **PASS** | Uses `artifacts (details):` / `affectedArtifacts`; test asserts                 |
| Depends on `core:transition-checks`                                 | **PASS** | Preview delta `Spec Dependencies`                                               |
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

| Check                                        | Verdict  | Notes                                                               |
| -------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Architecture ↔ Logging (ambient exception)   | **PASS** | Mutual references aligned in change deltas                          |
| Architecture ↔ Logging (no dependency cycle) | **PASS** | `architecture dependsOn: (none)`; logging → architecture            |
| Config ↔ transition-checks (in-place gates)  | **PASS** | Config documents in-place model; templates and lifecycle enforce it |
| Skills ↔ transition-checks                   | **PASS** | Templates teach same in-place / drain-only model                    |
| Config ↔ skills (approvals UX)               | **PASS** | Config defaults off; templates tell human to run `changes approve`  |

---

## Closed vs prior audit (`20260829-155309/_partial-globals-skills.md`)

| Prior finding                                                    | Verdict                                      |
| ---------------------------------------------------------------- | -------------------------------------------- |
| D-CFG-1 config-loader default-approval test gap                  | **CLOSED** — `config-loader.spec.ts:976-983` |
| D-LOG-1 Pino JSDoc eslint-disable                                | **OPEN (LOW)**                               |
| D-LOG-2 console-prefix test gap                                  | **OPEN (LOW)**                               |
| D-CFG-2 (renumbered) in-place-gate verify scenario cross-package | **OPEN (LOW)** — acceptable split            |
| D1 `DEPS_INCONSISTENT` (architecture/logging cycle)              | **CLOSED** (prior)                           |
| D2 bidirectional logging ↔ architecture cycle                    | **CLOSED** (prior)                           |
| D3 per-package wiring MEDIUM                                     | **CLOSED** (prior)                           |
| D4 JSDoc eslint-disable on observability logger                  | **CLOSED** (prior)                           |
| D5 observability layer unnamed                                   | **CLOSED** (prior)                           |

---

## Summary counts

| Spec                            | Requirements checked | PASS   | Partial | FAIL  | HIGH  | MEDIUM | LOW   |
| ------------------------------- | -------------------- | ------ | ------- | ----- | ----- | ------ | ----- |
| `default:_global/architecture`  | 11                   | 11     | 0       | 0     | 0     | 0      | 0     |
| `default:_global/logging`       | 9                    | 7      | 2       | 0     | 0     | 0      | 2     |
| `core:config`                   | 10                   | 10     | 0       | 0     | 0     | 0      | 1     |
| `skills:skill-templates-source` | 14                   | 14     | 0       | 0     | 0     | 0      | 0     |
| **Total**                       | **44**               | **42** | **2**   | **0** | **0** | **0**  | **3** |

**Overall:** Implementation conforms to all four scoped specs. **0 HIGH, 0 MEDIUM** (unchanged from prior). Three LOW items remain: Pino JSDoc eslint exception (D-LOG-1), missing console-prefix tests for minimal impl (D-LOG-2), and cross-package placement of in-place-gate verify scenario (D-CFG-1). The config-loader default-approvals test gap from the prior audit is **closed**.
