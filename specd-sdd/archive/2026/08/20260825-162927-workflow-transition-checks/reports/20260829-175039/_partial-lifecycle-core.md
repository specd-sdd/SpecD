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
