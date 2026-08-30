# Specs Compliance Report — `workflow-transition-checks`

**Timestamp:** 20260829-155309  
**Mode:** change (`workflow-transition-checks`)  
**Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`  
**Graph:** reindexed `2026-08-29T13:53:32Z`, fresh  
**Read-only audit** — no code or spec files modified

---

## Executive Summary

| Verdict                 | Detail                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Overall**             | **Implementation compliant** with merged spec-preview for all 22 change specs        |
| **HIGH**                | **0**                                                                                |
| **MEDIUM**              | **4** — CLI test coverage gaps (verify scenarios not exercised)                      |
| **LOW**                 | **13** — cosmetic naming/selectors, optional spec clarification, minor test/doc gaps |
| **Functional blockers** | **None**                                                                             |

### vs prior audit (`20260829-142635`)

| Prior item                                                    | Status               |
| ------------------------------------------------------------- | -------------------- |
| Implementation compliant                                      | **Confirmed**        |
| `engine-derived` / verdict wording in code + deltas           | **CLOSED**           |
| `blockingArtifactIds` from check `details`                    | **CLOSED**           |
| `nextArtifact` uses `parentsOf`                               | **CLOSED**           |
| Approve bindings / validate-artifacts title / GetStatus JSDoc | **CLOSED**           |
| Architecture ↔ logging cycle                                  | **CLOSED**           |
| Transition JSON failure `blockers`/`nextAction`               | **CLOSED**           |
| GAI verify "engine-derived" selectors                         | **STILL OPEN (LOW)** |
| CLI approval-gate failure tests                               | **NEW MEDIUM**       |

### Aggregated counts

| Batch          |  Specs |     Req |  HIGH | MEDIUM |    LOW |
| -------------- | -----: | ------: | ----: | -----: | -----: |
| lifecycle-core |      6 |      44 |     0 |      0 |      5 |
| use-cases      |      8 |      58 |     0 |      0 |      1 |
| CLI            |      4 |      38 |     0 |      4 |      3 |
| globals+skills |      4 |      43 |     0 |      0 |      4 |
| **Total**      | **22** | **183** | **0** |  **4** | **13** |

### Top recommendations

1. **MEDIUM:** Add CLI tests for blocked approval-gate transitions (`ready`/`done` stay put).
2. **MEDIUM:** Add CLI status projection parity tests (incomplete tasks, `nextAction`, `artifact-review-required`).
3. **LOW:** Rename GAI verify selectors to "verdict-derived"; rebuild CLI dist for archive help.

Change still has `ARTIFACT_DRIFT` on specs/verify — expected after delta edits; next workflow step is `/specd-design`.

---

## Detailed Findings (verbatim partial reports)

---

# Partial Audit: lifecycle-core

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-155309`  
**Graph:** indexed `2026-08-29T13:53:32Z`, fresh  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified

---

## Specs Audited

- `core:lifecycle-engine`
- `core:transition-checks`
- `core:change`
- `core:workflow-model`
- `core:schema-format`
- `core:storage` (lifecycle-intersection: dependency cascade, load-time sanitize, drift ownership)
- Cross-check: `default:_global/architecture`, `default:_global/logging` (preview)

---

## Per-Spec Findings

### `core:lifecycle-engine`

#### Requirements Summary

| ID    | Requirement                         | Essence                                                                                                    |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `lifecycle-verdict.ts`; no `LifecycleEngine` class; domain `nextHop` without `command`. |
| LE-2  | Centralized validation logic        | Project caller-supplied `CheckResult`s only; no I/O, no effects, no snapshot-bag fallback.                 |
| LE-3  | Effective artifact status           | Review/incomplete upstream mapping; parent-review wins over in-progress.                                   |
| LE-4  | Canonical-state-only                | No extra lifecycle states from display drift projections.                                                  |
| LE-5  | Machine-readable blockers           | Standard codes; skippable bypass omits blockers; no `warnings` field.                                      |
| LE-6  | Available steps and domain next hop | Single predicate evaluation; `blockingArtifacts` from check `details` when checks present.                 |
| LE-7  | Archiving escape transitions        | `archiving` exposes `archivable`/`designing`; recovery skips requires.                                     |
| LE-8  | Review summary integration          | Historical overlap → review reason, not `OVERLAP_CONFLICT` blocker.                                        |
| LE-9  | Shared lifecycle interpretation     | Consumers share verdict; `CompileContext` excluded; empty `checksByTarget` still yields DAG answers.       |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command`.                                                         |
| LE-11 | Next artifact topological order     | `topologicalOrder()` + `parentsOf()` dependency readiness.                                                 |
| LE-12 | No LifecycleEngine class            | Compatibility barrel re-exports domain functions only.                                                     |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                                                                                                         |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1      | **Implemented** | `evaluateLifecycleVerdict` plain function (`lifecycle-verdict.ts:142`). No `LifecycleEngine` class in src/dist. `public-api.spec.ts` asserts absence. Domain `nextHop` fields: `targetStep`/`actionType`/`reason` (`99-103`).    |
| LE-2      | **Implemented** | Filters `availableTransitions` from `checksByTarget` outcomes (`159-172`). No `PredicateSnapshots` / `check.run` fallback.                                                                                                       |
| LE-3      | **Implemented** | `effectiveStatus` (`353-411`) with review-wins logic (`395-407`). Tests cover chains, parent-review, mixed upstream.                                                                                                             |
| LE-4      | **Implemented** | Uses canonical `artifact.status` only in projection.                                                                                                                                                                             |
| LE-5      | **Implemented** | `blockersFromFailedChecks` maps codes; bypass filtering at `815-817`.                                                                                                                                                            |
| LE-6      | **Implemented** | `blockingArtifactIds` (`752-768`): when `evaluationChecks` defined, reads failed `workflow.requires` `details.artifactId`; `availableSteps.blockingArtifacts` uses this (`177`). Test: `blockingArtifacts follow check details`. |
| LE-7–LE-8 | **Implemented** | Archiving skip at `217-218`; overlap review hop tests present.                                                                                                                                                                   |
| LE-9      | **Implemented** | `validate-artifacts.ts:220-221` calls with `checksByTarget: {}`. Spies in get-artifact-instruction / validate-artifacts specs.                                                                                                   |
| LE-10     | **Implemented** | `lifecycle-evaluation.ts` attaches `nextAction` via guidance.                                                                                                                                                                    |
| LE-11     | **Implemented** | `nextArtifact` uses `topologicalOrder()` + `parentsOf()` (`774-788`).                                                                                                                                                            |
| LE-12     | **Implemented** | `lifecycle-engine.ts` re-export barrel only; domain `index` exports from `lifecycle-verdict.js`.                                                                                                                                 |

#### Discrepancies

| Sev | ID  | Finding                                                                                                    | Evidence                                                                        | Interpretation                                                                                                                                                                                                                                                                            |
| --- | --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOW | L1  | `transitionBlockers` falls back to independent `requires` walk when `checksByTarget[transition]` is absent | `lifecycle-verdict.ts:227-230` calls `blockingArtifactIds(..., undefined, ...)` | **Both acceptable:** Spec LE-6 governs `availableSteps.blockingArtifacts` when checks are present; empty-check callers (e.g. `ValidateArtifacts`) need a DAG-only fallback. **Or spec gap:** if `transitionBlockers` must always mirror predicate results, spec should say so explicitly. |
| LOW | L2  | Test file named `lifecycle-engine.spec.ts`                                                                 | `packages/core/test/domain/services/lifecycle-engine.spec.ts`                   | **code-wrong (cosmetic):** rename to `lifecycle-verdict.spec.ts` for clarity; not a class violation.                                                                                                                                                                                      |
| LOW | L3  | Verify delta selector still targets heading “Available steps and next action”                              | `deltas/core/lifecycle-engine/verify.md.delta.yaml:54,239`                      | **spec-wrong (cosmetic):** selector should match renamed requirement “domain next hop”. Body already uses `targetStep`.                                                                                                                                                                   |

#### Test Coverage

| Requirement / scenario                | Tests                                                                       | Adequacy                              |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| No LifecycleEngine class              | `public-api.spec.ts`                                                        | Adequate                              |
| nextHop without command               | `lifecycle-engine.spec.ts` `describe('evaluateLifecycleVerdict')`           | Adequate                              |
| Effective status / parent-review      | Multiple lifecycle-engine tests + `findBlockingParent`                      | Adequate                              |
| Mixed review + incomplete parents     | `given mixed review and incomplete parents…then parent-review wins`         | Adequate                              |
| blockingArtifacts from check details  | `blockingArtifacts follow check details`                                    | Adequate                              |
| Archiving escape / transitionBlockers | `exposes archiving escape transitions without archivable requires blockers` | Adequate                              |
| nextAction.command                    | `describe('evaluateLifecycle')` cases                                       | Adequate (cross-layer file)           |
| nextArtifact DAG order                | Tests at lines ~368, ~516                                                   | Adequate; no explicit `parentsOf` spy |

**Gaps:** no automated test that domain modules never import `application/logger`; no explicit test that `nextArtifact` calls `parentsOf` (implementation verified by read).

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

| Req       | Status          | Evidence                                                                                                                      |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TC-1      | **Implemented** | `CHECK_LABELS` gerund map (`transition-checks.ts:42-57`); `CheckResult` shape.                                                |
| TC-2      | **Implemented** | `WorkflowCheck` class (`workflow-check.ts:17`); no `PredicateSnapshots` export (test at `transition-checks.spec.ts:384-388`). |
| TC-3      | **Implemented** | `classifyAlong` tests including recovery, omitted `implementing`, redesign (`transition-checks.spec.ts`).                     |
| TC-4–TC-5 | **Implemented** | Archive bindings in composition tests; effect phase tests in archive-change specs (sibling batch).                            |
| TC-6–TC-8 | **Implemented** | `executeChecksByLegalTargets` + `GetStatus` integration; approval stays in `ready`.                                           |
| TC-9      | **Implemented** | `execute-check-with-progress.spec.ts` (sibling).                                                                              |

#### Discrepancies

_None above LOW._

#### Test Coverage

| Area                             | Tests                                                            | Adequacy |
| -------------------------------- | ---------------------------------------------------------------- | -------- |
| `classifyAlong` / axis           | `transition-checks.spec.ts`                                      | Adequate |
| No snapshot bag                  | Export negative test                                             | Adequate |
| Binding matching (impl/approval) | `execute-matching-predicates.spec.ts`, composition registry spec | Adequate |
| Progress bus scenarios           | `execute-check-with-progress.spec.ts`                            | Adequate |

---

### `core:change`

#### Requirements Summary

| ID   | Requirement                   | Essence                                                                                                   |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| CH-1 | Lifecycle / VALID_TRANSITIONS | Protocol table; entity owns persisted state.                                                              |
| CH-2 | Artifacts                     | `pending-parent-artifact-review` is **verdict-derived**; not persistable; wire sanitize to `in-progress`. |
| CH-3 | Guidance ownership            | Domain `nextHop`; application attaches `command`.                                                         |
| CH-4 | assertArchivable              | Entity asserts `archivable` or `archiving`.                                                               |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                                                                                                                      |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CH-1 | **Implemented** | `VALID_TRANSITIONS` in change entity; transition validity tests.                                                                                                                                                              |
| CH-2 | **Implemented** | Delta uses “verdict-derived” (`change/spec.md.delta.yaml:181,202`). `ArtifactFile` rejects token (`artifact-file.ts:52-55`). Load/save sanitize (`change-repository.ts:1700-1701`; test `change-repository.spec.ts:664-692`). |
| CH-3 | **Implemented** | Separation in lifecycle-evaluation layer.                                                                                                                                                                                     |
| CH-4 | **Implemented** | `assertArchivable` JSDoc covers archivable or archiving.                                                                                                                                                                      |

#### Discrepancies

| Sev | ID  | Finding                                                               | Evidence                                                       | Interpretation                                                                                  |
| --- | --- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| LOW | L4  | GAI verify delta scenario title still says “engine-derived readiness” | `deltas/core/get-artifact-instruction/verify.md.delta.yaml:93` | **spec-wrong:** rename selector/title to “verdict-derived readiness” for consistency with CH-2. |

#### Test Coverage

| Requirement                     | Tests                                                             | Adequacy |
| ------------------------------- | ----------------------------------------------------------------- | -------- |
| Verdict-derived not persistable | `artifact-file` constructor test; change-repository wire sanitize | Adequate |
| assertArchivable                | Entity tests in `change.spec.ts`                                  | Adequate |

---

### `core:workflow-model`

#### Requirements Summary

| ID   | Requirement                | Essence                                                                   |
| ---- | -------------------------- | ------------------------------------------------------------------------- |
| WM-1 | Step names = ChangeState   | `workflow[]` extras only; omit does not delete protocol.                  |
| WM-2 | Requires / task completion | Shared `workflow.requires` / `workflow.taskCompletion` checks.            |
| WM-3 | Step availability          | From `evaluateLifecycleVerdict`; `CompileContext` must not evaluate hops. |
| WM-4 | Progress axis              | Same `along` classification as transition-checks.                         |

#### Implementation Status

All **Implemented**. Availability flows through verdict projections; task completion delegated to `CountTasks` inside check execute; compile-context exclusion verified in composition spec.

#### Discrepancies

_None._

#### Test Coverage

Requires/task-completion scenarios covered in workflow-requires specs, transition-change composition tests, and lifecycle projection tests. Adequate for this batch.

---

### `core:schema-format`

#### Requirements Summary

| ID   | Requirement               | Essence                                                                  |
| ---- | ------------------------- | ------------------------------------------------------------------------ |
| SF-1 | Artifact requires cascade | Feeds `projectArtifacts`; no `Change.effectiveStatus()`.                 |
| SF-2 | Schema artifact DAG API   | `artifactDag()` with `parentsOf`, `topologicalOrder`, etc.               |
| SF-3 | Canonical DAG derivation  | Next-artifact and upstream walks use `parentsOf` + `topologicalOrder()`. |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                               |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SF-1 | **Implemented** | Cascade in `projectArtifacts`; no `Change.effectiveStatus()` (grep: 0 matches).                                                        |
| SF-2 | **Implemented** | `ArtifactDag.parentsOf` (`artifact-dag.ts:140-142`); tests in `artifact-dag.spec.ts`.                                                  |
| SF-3 | **Implemented** | `requiresForArtifact` uses `parentsOf` when in schema (`lifecycle-verdict.ts:1010-1018`); `nextArtifact` uses `parentsOf` (`785-788`). |

#### Discrepancies

_None._

#### Test Coverage

`artifact-dag.spec.ts` covers `parentsOf` and topological order. Lifecycle tests cover next-artifact behavior. Adequate.

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

| Req       | Status          | Evidence                                                                                                                |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ST-1      | **Implemented** | Delta aligns with lifecycle-engine (`storage/spec.md.delta.yaml:1-9`).                                                  |
| ST-2–ST-4 | **Implemented** | `change-repository.ts` load drift + `persistableArtifactStatus` (`1694-1701`); validate uses verdict with empty checks. |

#### Discrepancies

_None._

#### Test Coverage

| Requirement                  | Tests                                         | Adequacy           |
| ---------------------------- | --------------------------------------------- | ------------------ |
| Wire sanitize pending-parent | `change-repository.spec.ts:664-692`           | Adequate           |
| Hash derivation              | Multiple change-repository tests              | Adequate           |
| DAG cascade (not repository) | Covered in lifecycle tests, not storage layer | Correct separation |

---

## Cross-Spec Consistency

| Check                                            | Result                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture preview package-agnostic            | **Pass** — no Core symbol names, no `LifecycleEngine` class requirement violated.                                                      |
| Logging ↔ architecture dependency                | **Pass** — logging depends on architecture; architecture `dependsOn: none`.                                                            |
| Change CH-2 ↔ lifecycle LE-3 ↔ storage ST-1/ST-3 | **Pass** — all use “verdict-derived” / `projectArtifacts` vocabulary (prior “engine-derived” wording closed in change delta and code). |
| Workflow-model WM-3 ↔ lifecycle LE-9             | **Pass** — single verdict authority.                                                                                                   |
| Schema-format SF-3 ↔ lifecycle LE-11             | **Pass** — `parentsOf` + `topologicalOrder()` aligned.                                                                                 |
| Transition-checks registry ↔ workflow-model axis | **Pass** — shared `classifyAlong` / `AXIS_FALLBACK`.                                                                                   |
| Residual “engine” in verify selectors            | **Minor drift** — lifecycle verify delta selector (L3), GAI verify scenario title (L4), markdown merge test fixture (L5 below).        |

**L5 (LOW):** `markdown-parser-real-merge.spec.ts:122,148` retains scenario title “engine-derived readiness” in merged fixture text. **spec/test-wrong:** update fixture to “verdict-derived” when touching that merge test.

---

## Prior Audit Context (20260829-142635)

| Prior item                               | Status (this audit)     | Notes                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementation compliant (0 HIGH/MEDIUM) | **Confirmed**           | No new blocking defects.                                                                                                                                                                         |
| Engine wording (LOW)                     | **Mostly CLOSED**       | `artifact-file.ts`, `change-repository.ts`, change delta line 202, `transition-checks.ts:423` JSDoc, transition-checks spec line 50 all fixed. Residual verify selectors + test fixture (L3–L5). |
| `lifecycle-engine.ts` barrel naming      | **OK (intentional)**    | LE-12 requires compatibility barrel.                                                                                                                                                             |
| `transitionBlockers` fallback            | **Still LOW (L1)**      | Intentional for empty-check callers; document or spec-clarify if stricter parity required.                                                                                                       |
| Optional CLI tests                       | **Partially addressed** | New `JSON output includes from and to fields` (`change.spec.ts:680-733`) extends transition JSON coverage beyond prior `outputs json with new state`.                                            |

---

## Summary Counts

| Severity | Count |
| -------- | ----- |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 5     |

| Metric               | Count |
| -------------------- | ----- |
| Requirements checked | 44    |
| Implemented          | 43    |
| Partial              | 1     |
| Missing              | 0     |

**Partial:** naming hygiene only (L2–L5 cosmetic selectors/fixtures; L1 optional spec clarification for `transitionBlockers` fallback).

**Highest-signal residual (≤10 lines):**  
0 HIGH, 0 MEDIUM. Recent fixes verified: verdict-derived wording in change spec + `ArtifactFile` + repository JSDoc; `blockingArtifactIds` drives `availableSteps.blockingArtifacts`; CLI transition JSON test now asserts `from`/`to` on complete event; transition-checks spec uses “check registry” not “engine”. Remaining LOW: cosmetic filenames/selectors (`lifecycle-engine.spec.ts`, verify delta headings, GAI scenario title, markdown merge fixture), plus optional clarification for `transitionBlockers` when `checksByTarget` is absent per transition.

---

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change (read-only audit)
- **Change:** `workflow-transition-checks`
- **Report:** `20260829-155309`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:archive-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:hook-execution-model`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** fresh (`lastIndexedAt: 2026-08-29T13:53:32Z`, `stale: false`); navigation via `graph search` / `graph impact` on `GetStatus`, `TransitionChange`, `ArchiveChange`, `ValidateArtifacts`, `GetArtifactInstruction`, `ApproveSpec`, `ApproveSignoff`, `RunStepHooks`
- **Code paths:** `packages/core/src/application/use-cases/*.ts`, `packages/core/src/composition/use-cases/*.ts`, `packages/core/src/application/checks/hook-*.ts`, matching tests under `packages/core/test/`
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior batch:** `reports/20260829-142635/_partial-use-cases.md` (compliant; LOW: get-status JSDoc engine wording, GAI verify selectors, approve bindings wording)

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

### Closed vs prior `20260829-142635` (this batch)

| Prior claim                                                       | Re-verify (this pass)                                                                                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus **engine JSDoc** (`:771`, `:799`)                       | **CLOSED.** `_nextActionAfterArchiveOverlap` (`:770-772`) and `_projectReview` (`:798-799`) say **verdict**. Zero `engine` matches in `get-status.ts`.    |
| Drafted path `projectArtifacts` only (D2)                         | **CLOSED.** Preview requires `projectArtifacts` only and forbids evaluate calls (GS-5). Code (`:640-667`) and tests (`get-status.spec.ts:818-858`) align. |
| Drafted `nextAction.command === null` test gap                    | **CLOSED.** `get-status.spec.ts:815`.                                                                                                                     |
| Approve spec/signoff **engine check bindings** wording            | **CLOSED.** Preview now says "`from` states … come from **check registry bindings**" (approve-spec ~line 100; approve-signoff ~line 100).                 |
| Validate-artifacts title "DAG lifecycle from **engine** evaluate" | **CLOSED.** Preview title is "DAG lifecycle from **evaluateLifecycleVerdict**" (`spec.md` requirement heading).                                           |
| `LifecycleEngine` class / ctor injection                          | **CLOSED.** No `class LifecycleEngine` under `packages/core/src`. Composition `resolve*Deps` for scoped UCs expose no `lifecycle` key.                    |

### Per-spec implementation

**GetStatus — IMPLEMENTED**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle`; domain `projectArtifacts` `:12-17`.
- Active path: `projectArtifacts` `:452` → `executeChecksByLegalTargets` `:457-463` (no `failFastOn`) → archive predicates when `archivable` `:465-479` → `evaluateLifecycle` `:481-484`. Task paint from `taskCompletionFromChecks` after checks.
- Drafted: `_buildDraftedResult` `:621-715` — `projectArtifacts` only `:640-667`; empty hops `:673-676`; `nextArtifact: null` `:679`; `nextAction.command: null` `:709-713`.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7 (no `RunStepHooks`).
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187`.
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with per-target `checksByTarget`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); no pending rewrite.
- Hook effects: `matchingEffects` + `executeCheckWithProgress` `:252-258`; `skipHookPhases` in context `:197-210`.
- `resolveTransitionChangeDeps` — no lifecycle key (grep: no matches).

**ArchiveChange — IMPLEMENTED**

- Ctor `:222-250` — `archiveBindings` injected; no `RunStepHooks` parameter.
- `resolveArchiveChangeDeps` `composition/use-cases/archive-change.ts:121-150` — `archiveBindings` from registry; no `runStepHooks` on deps interface `:105-119`.
- Schema guard: `executeMatchingPredicates` with `{ failFastOn: 'schema.nameMatch' }` `:280-292`.
- Pre/post hooks: `matchingEffects(..., 'before-persist')` `:323-347`; `matchingEffects(..., 'after-persist')` `:529+`; `hookFailureMode(binding.onFailure)` `:340`.
- Deferred archiving: `change.transition('archiving', …)` inside mutate `:407-409` after preflight/snapshots.
- Batch safety: `detectOrphans` `:398`; `restoreBatch` `:923`.
- Test helper `newArchiveChange` builds bindings via `makeArchiveBindings({ runStepHooks })` — `RunStepHooks` is wired into hook **checks**, not the use case (`helpers.ts:944-982`).

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor `:136-154` — no engine.
- Topological validation order via `schema.artifactDag().topologicalOrder()` `:240-243`.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Debug log names `evaluateLifecycleVerdict` explicitly `:106-108`.
- Ctor `:66-72` — no engine.

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: `boundFromStates('approval.spec')` (`approve-spec.ts:86`); drain only if `pending-spec-approval` (`:96-98`). Ready path records consent without parking transition.
- ApproveSignoff: analogous pattern (`approve-signoff.ts`).
- Composition resolvers — repositories, hasher, `approvals` only; no lifecycle key.

**Hook execution model — IMPLEMENTED**

- `createHookPre` / `createHookPost` take `RunStepHooks` as check factory dep (`application/checks/hook-pre.ts:12`, `hook-post.ts:12`); `HookEffectCheck.execute` delegates to `RunStepHooks` (`hook-effect-shared.ts:124`).
- `execute-hook-effect.ts`: `matchingEffects` filters by binding `phase` + matcher `:23-35`; `hookFailureMode` maps `onFailure` `:43-45`.
- `RunStepHooks`: skips instruction hooks (`run-step-hooks.spec.ts:147`); external dispatch (`:173-223`); pre fail-fast / post fail-soft (`:321`, `:368`).
- `TransitionChange` / `ArchiveChange` select effects by phase, not check id (see above).
- `Change` entity: no hook execution (grep domain/application separation holds).

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

**`LifecycleEngine` class**

- Search under `packages/core/src`: **no** `class LifecycleEngine`. Graph class `GetStatus` is the use case, not an engine.

---

## Discrepancies

### HIGH

_None._

### MEDIUM

_None._

### LOW

#### D1 — GAI verify scenario titles still say **"engine"** (prior #1 — **STILL OPEN**, spec-only)

**Evidence (spec preview):**

- `core:get-artifact-instruction` verify:
  - "Omitted artifactId uses **engine-derived** readiness" (preview line ~210)
  - "Omitted artifactId ignores persisted complete when **engine** reports dependency blockage" (preview line ~218)

**Evidence (code):** `get-artifact-instruction.ts:97-108` uses `evaluateLifecycleVerdict` with empty `checksByTarget`; debug log says `evaluateLifecycleVerdict`. Test spies `evaluateLifecycleVerdict` (`get-artifact-instruction.spec.ts:98`).

**Option A (prefer):** Rename verify scenario titles to "verdict-derived readiness" / "when evaluateLifecycleVerdict reports dependency blockage".

**Option B:** Reintroduce an "engine" abstraction — **rejected** (no `LifecycleEngine` class).

**Severity:** documentation / verify-title drift only; behaviour compliant.

#### D2 — `core:lifecycle-engine` dependency id naming (INFO — not a code violation)

Several assigned specs list `core:lifecycle-engine` in Spec Dependencies while implementation imports `evaluateLifecycle` / `evaluateLifecycleVerdict` module functions. The lifecycle-engine spec describes module functions, not a class. Consistent with prior audits; not a functional discrepancy.

### INFO

#### I1 — Hook ordering (schema before project) not directly tested at `RunStepHooks`

**Spec:** HEM-11 requires schema-level hooks before project-level within a phase.

**Code:** `RunStepHooks._collectHooks` reads merged `workflowStep.hooks` from resolved schema (`run-step-hooks.ts:177-177`). Project overrides are merged at schema resolution (`resolve-schema.ts` normalizeOverrideHooks). Ordering is likely enforced at merge time, not in `RunStepHooks`.

**Tests:** No explicit "schema hook runs before override hook" test in `run-step-hooks.spec.ts`.

**Severity:** INFO — implementation path plausible; verify scenario for ordering not directly exercised at use-case layer.

#### I2 — Orphan backup detection tested at adapter, not use-case integration

**Spec:** AC-11 orphan backup rules.

**Tests:** `archive-batch-snapshot.spec.ts:56` (adapter-level). No `archive-change.spec.ts` match for `detectOrphans` / orphan strings.

**Severity:** INFO — adapter coverage exists; optional UC-level integration test.

---

## Test Coverage

| Spec / contract                                                  | Tests (file:line)                                                    | Verdict                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| GetStatus ctor / composition no lifecycle                        | `test/composition/use-cases/get-status.spec.ts:69-112`               | Covered                    |
| Drafted empty transitions / steps / **command null**             | `get-status.spec.ts:795-815`                                         | Covered (`command` `:815`) |
| Drafted `projectArtifacts` parent-review; no `evaluateLifecycle` | `get-status.spec.ts:818-858`                                         | Covered                    |
| Drafted missing schema artifacts from DAG                        | `get-status.spec.ts:861+`                                            | Covered                    |
| CountTasks inside check, once per execute                        | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)     | Covered                    |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)       | `execute-matching-predicates.spec.ts:43-71`                          | Covered (runner)           |
| `failFastOn: 'protocol.edge'`                                    | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215` | Covered                    |
| `to: 'next'` / HAPPY_PATH / pending rejects                      | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`    | Covered                    |
| Approvals stay in `ready` / `done`                               | `transition-change.spec.ts:377-391`, `:435-447`                      | Covered                    |
| ApproveSpec stays in `ready`                                     | `approve-spec.spec.ts:71-89`                                         | Covered                    |
| ApproveSignoff stays in `done`                                   | `approve-signoff.spec.ts:72-89`                                      | Covered                    |
| TransitionChange `skipHookPhases` selectors                      | `transition-change.spec.ts:1346-1735`                                | Covered                    |
| ValidateArtifacts empty `checksByTarget`                         | `validate-artifacts.spec.ts:241-264`                                 | Covered                    |
| GAI empty `checksByTarget` / auto `nextArtifact`                 | `get-artifact-instruction.spec.ts:98-104`                            | Covered                    |
| `workflow.requires` codes                                        | `workflow-requires.spec.ts:20-71`                                    | Covered                    |
| `boundFromStates` registry                                       | `transition-checks.spec.ts:221-223`                                  | Covered                    |
| ArchiveChange no RunStepHooks on instance                        | `archive-change.spec.ts:169-182`                                     | Covered                    |
| ArchiveChange schema mismatch fail-fast                          | `archive-change.spec.ts:274-288`                                     | Covered                    |
| ArchiveChange deferred `archiving` transition                    | `archive-change.spec.ts:2966-3020`                                   | Covered                    |
| ArchiveChange ReadOnly workspace guard                           | `archive-change.spec.ts:3202-3230`                                   | Covered                    |
| ArchiveChange skipHookPhases pre/post/all                        | `archive-change.spec.ts:1840-2015`                                   | Covered                    |
| ArchiveChange RunStepHooks delegation params                     | `archive-change.spec.ts:2793-2846`                                   | Covered                    |
| ArchiveChange archive-failed rollback event                      | `archive-change.spec.ts:1406-1466`                                   | Covered                    |
| RunStepHooks instruction skip                                    | `run-step-hooks.spec.ts:147`                                         | Covered                    |
| RunStepHooks external hook dispatch                              | `run-step-hooks.spec.ts:173-223`                                     | Covered                    |
| RunStepHooks pre fail-fast / post fail-soft                      | `run-step-hooks.spec.ts:321`, `:368`                                 | Covered                    |
| Orphan backup detect/restore (adapter)                           | `archive-batch-snapshot.spec.ts:56+`                                 | Covered (adapter)          |
| Composition archiveBindings, no runStepHooks on deps             | `composition/use-cases/archive-change.spec.ts:34-54`                 | Covered                    |

---

## Missing Tests

| Gap                                                             | Spec                        | Suggested assertion                                                           |
| --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| GAI verify title "engine-derived"                               | GAI verify D1               | Rename scenario only; behaviour tested via `evaluateLifecycleVerdict` spy     |
| Hook ordering schema before project                             | HEM-11                      | Schema with base + override hooks; assert execution order                     |
| ArchiveChange orphan backup at UC level                         | AC-11                       | Integration test calling `execute` when `.specd-archive-backup/` exists       |
| Composition never resolves `lifecycle` (explicit key assertion) | GS-11 / TC-6 / VA-3 / GAI-3 | Optional: `expect(deps).not.toHaveProperty('lifecycle')` in composition tests |
| GetStatus hop with two fails at use case level                  | GS-9                        | Runner test exists; optional UC-level two-fail hop integration                |

**Closed vs 142635:** drafted `nextAction.command === null` — **not missing**. Draft `evaluateLifecycle` spy — **not missing**. GetStatus engine JSDoc — **not missing**. Approve bindings "engine" wording — **not missing** (fixed in preview). Validate-artifacts "engine evaluate" title — **not missing** (fixed in preview).

---

## Spec Dependency Chain

From `changes status` / preview `## Spec Dependencies` (depth 1, assigned specs):

- **core:get-status** → `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:transition-change** → `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:archive-change** → `core:change`, `core:schema-format`, `core:delta-format`, `core:validate-artifacts`, `core:storage`, `core:run-step-hooks`, `core:hook-execution-model`, `core:template-variables`, … (22 deps total per change status)
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
| Partial / wording-only                           | 1 (D1 GAI verify "engine" titles)                     |
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
**Report:** `20260829-155309`  
**Auditor scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`  
**Spec source:** `change spec-preview workflow-transition-checks cli:<specId>` (merged deltas)  
**Implementation:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`  
**Tests:** `packages/cli/test/commands/change/{status,transition,approve,archive}.spec.ts`  
**Runtime CLI audited:** `node packages/cli/dist/index.js` (bundled `dist/index.js`)

---

## Executive summary

| Metric                                     | Count |
| ------------------------------------------ | ----: |
| Specs audited                              |     4 |
| Requirements / requirement-groups reviewed |    38 |
| **Compliant (implementation)**             |    35 |
| **Partial (implementation)**               |     1 |
| **Non-compliant (implementation)**         |     0 |
| **Test gaps (verify scenarios untested)**  |     9 |
| Discrepancies — **HIGH**                   |     0 |
| Discrepancies — **MEDIUM**                 |     4 |
| Discrepancies — **LOW**                    |     3 |

**Overall:** Source implementation aligns with the merged spec-preview for all four commands. The main gaps are **missing unit tests** for several new verify scenarios (especially approval-gate _failure_ paths and status projection parity) and one **stale bundled CLI description** for `change archive` until `packages/cli` is rebuilt.

---

## Cross-cutting findings

| ID   | Severity | Area            | Finding                                                                                                                                                                                              | Evidence                                                                                 |
| ---- | -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| X-01 | LOW      | Build / runtime | Bundled `dist/index.js` still registers archive with description _"Move a completed change…"_; **source** already matches preview (_"Move an archivable change (or retry from archiving…)"_).        | `packages/cli/dist/index.js:2372` vs `packages/cli/src/commands/change/archive.ts:56-58` |
| X-02 | LOW      | Help text       | `change transition --help` documents success stream shape only; preview also requires JSON/`toon` **failure** terminal record with `blockers` + `nextAction`. Behavior implemented; help incomplete. | `transition.ts:214-221`; preview `change-transition/spec.md` Invalid transition error    |
| X-03 | LOW      | Help text       | `change status --help` lists top-level `availableTransitions` with drafted-only comment; active JSON nests hops under `lifecycle`. Documented in source comment but easy to misread.                 | `status.ts:105-110`, JSON payload `status.ts:476-485`                                    |

Shared infrastructure **`_check-progress-presenter.ts`** matches preview for both transition and archive: gerund labels, `(id)` header, `✓`/`✗` lines, no `Executing:` prefix, structured `stream: "change-transition"|"change-archive"`.

---

## `cli:change-status`

### Requirements compliance

| Requirement (preview)                                               | Implementation                                                                                                                                                     | Tests                                                             | Status                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------- |
| Lifecycle projections from GetStatus checks (no local graph filter) | Passes through `lifecycle.availableTransitions`, `nextAction`, `blockers` from `kernel.changes.status.execute`; no `VALID_TRANSITIONS` filter                      | Partial — general transition display tests only                   | ✅ Compliant          |
| Drafted JSON empties hops + null `nextAction.command`               | `status.ts:145-180` forces `availableTransitions: []`, `availableSteps: []`, `command: null`                                                                       | `status.spec.ts` drafted JSON + text tests                        | ✅ Compliant          |
| Text omits duplicated review file lists                             | Review header only; no `affectedArtifacts` paths; overlap peers in `overlap:` section; filters `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'` | Overlap + drift tests                                             | ✅ Compliant          |
| Text blockers include gerund `label`                                | `! CODE — label: message` when `b.label` set                                                                                                                       | `Text blockers include gerund label`                              | ✅ Compliant          |
| JSON/TOON serialize `label`, `checkId` on blockers                  | `status.ts:410-416`                                                                                                                                                | **No dedicated JSON assertion**                                   | ✅ Impl / ⚠️ test gap |
| Help JSON schema lists `overlapDetail`                              | `status.ts:125`                                                                                                                                                    | `help documents nested schema.artifactDag and overlapDetail`      | ✅ Compliant          |
| Incomplete tasks → omit `verifying` from displayed hops             | Delegates to GetStatus (no CLI re-add)                                                                                                                             | **Not tested**                                                    | ✅ Impl / ⚠️ test gap |
| `nextAction` follows GetStatus (verify vs implement)                | Serializes `statusResult.nextAction` unchanged                                                                                                                     | **Not tested**                                                    | ✅ Impl / ⚠️ test gap |
| `artifact-review-required` text omits file paths under `review:`    | Same omission logic as drift/overlap                                                                                                                               | Drift covered; **`artifact-review-required` reason not asserted** | ✅ Impl / ⚠️ test gap |

### Discrepancies

| ID    | Severity | Finding                                                                                                                                  | Evidence                                                             |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| CS-01 | MEDIUM   | Verify scenario **"Incomplete tasks do not list verifying as available"** has no unit test. Regression would not be caught at CLI layer. | Preview verify L129-134; no matching test in `status.spec.ts`        |
| CS-02 | MEDIUM   | Verify scenario **"nextAction implements vs verify follows GetStatus"** untested.                                                        | Preview verify L136-140                                              |
| CS-03 | MEDIUM   | Verify scenario **"Artifact-review-required does not reprint files under review"** untested (drift-only variant exists).                 | Preview verify L154-164; `status.spec.ts` uses `artifact-drift` only |
| CS-04 | LOW      | Verify requires JSON `blockers[].label`; only text label assertion exists.                                                               | Preview verify L183-192; `status.spec.ts:287-314` text only          |

### Test coverage (delta-focused verify scenarios)

| Scenario                                                     | Covered   |
| ------------------------------------------------------------ | --------- |
| Drafted JSON empties hops even if Core leaks them            | ✅        |
| Incomplete tasks do not list verifying as available          | ❌        |
| nextAction implements vs verify follows GetStatus            | ❌        |
| Artifact-review-required does not reprint files under review | ❌        |
| Drift is shown only in artifacts details                     | ✅        |
| Overlap peers still print in text                            | ✅        |
| DEPS_INCONSISTENT blocker shows Checking spec dependencies   | ✅ (text) |
| JSON output includes `blockers[].label`                      | ❌        |

**Tests file:** `status.spec.ts` — ~35 examples; strong overlap/drift/drafted/blocker-label coverage; weak on new projection-parity scenarios.

---

## `cli:change-transition`

### Requirements compliance

| Requirement (preview)                                                                                                  | Implementation                                                         | Tests                                     | Status       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| No approval-gate CLI routing (`implementing`/`archivable` targets passed through)                                      | `transition.ts:261-267` — no pending rewrite; passes `to` as requested | Success-path "does not rewrite" tests     | ✅ Compliant |
| `--next` → `to: 'next'` (no local from→to table)                                                                       | `transition.ts:255-256, 264`                                           | Multiple `--next` tests                   | ✅ Compliant |
| `--allow-out-of-scope` forwarded / omitted by default                                                                  | `transition.ts:266, 132`                                               | Dedicated tests                           | ✅ Compliant |
| Omit approval flags on execute                                                                                         | Only `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`        | `Transition execute omits approval flags` | ✅ Compliant |
| Repair guide on stderr (text) with check labels                                                                        | `writeTextRepairGuide`                                                 | Repair Guide + typed-error tests          | ✅ Compliant |
| JSON failure: terminal `change-transition` `complete` with `result: "failure"`, `blockers`, `nextAction`, `from`, `to` | `transition.ts:298-311`                                                | `JSON incomplete-tasks failure…`          | ✅ Compliant |
| `HookFailedError` → exit 2, no repair guide                                                                            | Rethrown to `handleError`                                              | Hook failure tests                        | ✅ Compliant |
| Check progress bus (not `hook-progress`)                                                                               | `createCheckProgressPresenter` + `streamName: 'change-transition'`     | Progress + JSON stream tests              | ✅ Compliant |
| Help mentions `--allow-out-of-scope`, approval stay-in-state semantics                                                 | `--help` output matches                                                | Manual `--help` check                     | ✅ Compliant |

### Discrepancies

| ID    | Severity | Finding                                                                                                                                                                                          | Evidence                                                                             |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| CT-01 | MEDIUM   | Verify **"Spec approval gate active"** expects exit 1, change stays `ready`, no `pending-spec-approval` on stdout when gate blocks. Tests only mock **successful** transition to `implementing`. | Preview verify L117-124; `transition.spec.ts:161-184` mocks resolve → `implementing` |
| CT-02 | MEDIUM   | Verify **"Signoff gate active"** (exit 1, stay `done`) untested; test mocks success to `archivable`.                                                                                             | Preview verify L126-133; `transition.spec.ts:186-205`                                |
| CT-03 | MEDIUM   | Verify **"Next flag from ready… stays in ready when spec gate on"** expects failure path; test mocks success.                                                                                    | Preview verify L45-52; `transition.spec.ts:207-229`                                  |
| CT-04 | MEDIUM   | Verify **"Status omitted verifying before the failed transition"** (cross-command) untested.                                                                                                     | Preview verify L217-221                                                              |
| CT-05 | LOW      | `--help` JSON schema omits failure `complete.result` fields (`blockers`, `nextAction`).                                                                                                          | `transition.ts:214-221`                                                              |

### Test coverage (delta-focused verify scenarios)

| Scenario                                                       | Covered                        |
| -------------------------------------------------------------- | ------------------------------ |
| Spec approval gate active (blocked)                            | ❌ (success-only variant only) |
| Signoff gate active (blocked)                                  | ❌                             |
| Next from ready stays in ready when spec gate on               | ❌                             |
| Status omitted verifying before failed transition              | ❌                             |
| Repair guide recommends verify when tasks complete             | ✅                             |
| HookFailedError exit 2 without repair guide                    | ✅                             |
| Predicate / hook check progress (gerund, no Executing)         | ✅                             |
| Structured formats use `change-transition` not `hook-progress` | ✅                             |
| JSON failure terminal record with blockers + nextAction        | ✅                             |
| Allow-out-of-scope forwarded / omitted                         | ✅                             |

**Tests file:** `transition.spec.ts` — ~45 examples; strong progress/repair-guide/JSON-stream coverage; **approval-gate failure scenarios from preview are the largest gap**.

---

## `cli:change-approve`

### Requirements compliance

| Requirement (preview)                                      | Implementation                                                                | Tests                                             | Status       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| Approve spec from `ready` (drain: `pending-spec-approval`) | Delegates to `kernel.changes.approveSpec`                                     | `Successful spec approval from ready`, drain test | ✅ Compliant |
| Approve signoff from `done` (drain: `pending-signoff`)     | Delegates to `kernel.changes.approveSignoff`                                  | `Successful signoff from done`, drain test        | ✅ Compliant |
| No gate flags on execute input                             | `{ name, reason }` only                                                       | Omit-gate-flag tests                              | ✅ Compliant |
| Help uses bound-from language (`ready` / `done`)           | `--help`: _"Record spec-gate consent for a change in ready…"_ / _"…in done…"_ | Not asserted in tests                             | ✅ Compliant |
| Success text: `approved <gate> for <name>`                 | `approve.ts:47, 85`                                                           | stdout assertions                                 | ✅ Compliant |
| JSON success: `{ result: "ok", gate, name }`               | `approve.ts:49, 87`                                                           | JSON tests                                        | ✅ Compliant |
| `--reason` required                                        | Commander `requiredOption`                                                    | Missing-reason test                               | ✅ Compliant |

### Discrepancies

None material. Preview deltas for approve are fully reflected in source and tests.

### Test coverage (delta-focused verify scenarios)

| Scenario                            | Covered |
| ----------------------------------- | ------- |
| Successful spec approval from ready | ✅      |
| Successful signoff from done        | ✅      |
| JSON output on successful approval  | ✅      |
| Approve execute omits gate flags    | ✅      |
| Drain from pending states           | ✅      |

**Tests file:** `approve.spec.ts` — 14 examples; **complete** for preview delta scope.

---

## `cli:change-archive`

### Requirements compliance

| Requirement (preview)                                                                                                       | Implementation                                                | Tests                                                             | Status                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| Signature includes `--allow-out-of-scope`                                                                                   | Option + forward to execute                                   | Test present                                                      | ✅ Compliant               |
| Prerequisites: `archivable` **or** `archiving` (delegate to ArchiveChange)                                                  | No CLI-only archivable gate; forwards to execute              | Wrong-state test uses generic error; **archiving retry untested** | ✅ Compliant / ⚠️ test gap |
| Check progress bus (gerund labels, hooks on same bus)                                                                       | `_check-progress-presenter` via `makeArchiveProgressRenderer` | Text + JSON stream tests                                          | ✅ Compliant               |
| JSON success: NDJSON `change-archive` stream terminal `complete` with `result`, `name`, `archivePath`, `invalidatedChanges` | `archive.ts:125-136`                                          | JSON + stream-order tests                                         | ✅ Compliant               |
| No second unwrapped `{ result: "ok" }` after stream                                                                         | Single structured record on success                           | JSON tests                                                        | ✅ Compliant               |
| Text success: archive path + optional invalidated summary                                                                   | `archive.ts:115-123`                                          | Text tests                                                        | ✅ Compliant               |
| Post-hook failure → exit 2                                                                                                  | `archive.ts:110-113`                                          | Test present                                                      | ✅ Compliant               |
| Help description mentions archivable/archiving retry                                                                        | **Source** updated; **bundled dist stale** (see X-01)         | —                                                                 | ⚠️ Partial (runtime help)  |

### Discrepancies

| ID    | Severity | Finding                                                              | Evidence                                                        |
| ----- | -------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| CA-01 | MEDIUM   | Verify **"Change in archiving may retry archive"** has no unit test. | Preview verify L33-37; no `archiving` case in `archive.spec.ts` |
| CA-02 | LOW      | Runtime `--help` description stale until CLI rebuild (X-01).         | `dist/index.js:2372`                                            |

### Test coverage (delta-focused verify scenarios)

| Scenario                                        | Covered |
| ----------------------------------------------- | ------- |
| Change in archiving may retry archive           | ❌      |
| Text gerund check progress + hook bus           | ✅      |
| JSON stream check-progress then complete        | ✅      |
| JSON output on success (stream terminal record) | ✅      |
| `--allow-out-of-scope` forwarded                | ✅      |
| Invalidated changes in text + JSON              | ✅      |

**Tests file:** `archive.spec.ts` — 18 examples; strong hook/skip/JSON coverage; missing **archiving retry** scenario.

---

## JSON failure payloads (requested focus)

| Command             | Preview contract                                                                                                                                           | Implementation                 | Test                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `change transition` | stdout NDJSON terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", name, from, to, blockers, nextAction } } }` | `transition.ts:298-311`        | ✅ incomplete-tasks JSON test                           |
| `change status`     | JSON blockers include optional `label`, `checkId`; full `review` incl. `overlapDetail`                                                                     | `status.ts:410-416, 461-475`   | Partial — overlap JSON tested; blocker `label` JSON not |
| `change approve`    | Success only: `{ result, gate, name }`                                                                                                                     | `approve.ts:49, 87`            | ✅                                                      |
| `change archive`    | Success stream terminal record; failures via stderr `error:` (no structured failure stream in preview)                                                     | `handleError` / overlap stderr | N/A                                                     |

---

## Progress presenters (requested focus)

| Command             | Preview                                                                                                   | Implementation                                           | Tests          |
| ------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------- |
| `change transition` | Generic check bus; hooks as `Running pre/post hooks`; no `Executing:`; JSON `stream: "change-transition"` | `_check-progress-presenter.ts` + `transition.ts:142-156` | ✅ extensive   |
| `change archive`    | Same pattern; `stream: "change-archive"`; text progress on stderr                                         | `archive.ts:32-44`                                       | ✅ text + JSON |
| `change run-hooks`  | Preview explicitly allows legacy `hook-progress` (out of scope)                                           | Unchanged `_hook-progress-presenter.ts` in bundle        | —              |

---

## Approvals defaults (requested focus)

| Area                     | Preview                                                                                 | Implementation                                         | Tests                        |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| Transition               | Gate checks baked in kernel; CLI must not pass approval flags or rewrite to `pending-*` | No approval fields on execute; targets passed verbatim | Success-path no-rewrite only |
| Approve spec             | Valid from `ready` (+ drain `pending-spec-approval`); stay in `ready` on success        | Help + execute shape match                             | ✅                           |
| Approve signoff          | Valid from `done` (+ drain `pending-signoff`); stay in `done` on success                | Help + execute shape match                             | ✅                           |
| Status lifecycle display | `approvals: spec=on/off signoff=on/off` from GetStatus                                  | `status.ts:291-293`                                    | ✅                           |

---

## Archive behavior (requested focus)

| Area              | Preview                                                   | Implementation          | Tests   |
| ----------------- | --------------------------------------------------------- | ----------------------- | ------- |
| State guard       | `archivable` or `archiving`; delegate to ArchiveChange    | No extra CLI gate       | Partial |
| Flags             | `--allow-overlap`, `--allow-out-of-scope`, `--skip-hooks` | Forwarded conditionally | ✅      |
| Success JSON      | Single NDJSON stream, terminal `complete`                 | Implemented             | ✅      |
| Success text      | Path line + optional invalidated list                     | Implemented             | ✅      |
| Post-hook failure | Exit 2                                                    | Implemented             | ✅      |
| Check progress    | Shared presenter                                          | Implemented             | ✅      |

---

## Recommendations (informational — no code changes in this audit)

1. Add unit tests for the **9 uncovered verify scenarios** listed above (priority: transition approval-gate failures CT-01–03, status projection parity CS-01–02).
2. Rebuild `packages/cli` so runtime `--help` for `change archive` matches source (X-01 / CA-02).
3. Extend `change transition --help` JSON schema with failure terminal record shape (X-02).

---

_Generated by spec-compliance partial auditor. Read-only; no repository files modified except this report._

---

# Spec-compliance audit (partial): globals, config, skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`, `core:config`, `skills:skill-templates-source`  
**Focus:** observability facade / no logging cycle, config workflow checks (approvals), skill template lifecycle-transition updates  
**Read-only**

---

## default:\_global/architecture

### Requirements Summary

| Requirement                                            | Verdict  | Evidence                                                                                          |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| Domain layer is pure (I/O-free)                        | **PASS** | No `node:fs` / I/O imports under `packages/core/src/domain/`                                      |
| **Exception — ambient Logger**                         | **PASS** | `packages/core/src/observability/logger.ts`; domain import in `lifecycle-verdict.ts`              |
| Observability facade, not fourth hexagon layer         | **PASS** | Change delta prose; module lives at `src/observability/` (not `domain/` / `infrastructure/`)      |
| Application layer uses ports only                      | **PASS** | Use cases still receive ports via constructor; Logger import explicitly permitted in delta        |
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

**D-ARCH-1 — Runtime error string still says “engine-derived” (cross-spec with `core:change`)**

- **Spec says:** Change/artifact vocabulary uses “verdict-derived” for non-persistable statuses.
- **Code says:** `artifact-file.ts:54` throws `'pending-parent-artifact-review is verdict-derived…'` (correct) but prior audits flagged related “engine-derived” strings elsewhere; `change-repository.ts:1695` JSDoc still says “verdict-derived” (correct). No blocking architecture violation.
- **Assessment:** No architecture constraint breach; wording is consistent in inspected paths. Residual risk is comment drift only.

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
| `log()` aliases `info()`                                          | **PASS** | `logger.ts:50-51` delegates `log` → `impl.info`; test asserts alias           |
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

| Scenario                             | Covered?    | Tests                                                |
| ------------------------------------ | ----------- | ---------------------------------------------------- |
| Safe before wiring (no throw)        | **Yes**     | `test/observability/logger.spec.ts`                  |
| Safe before wiring (no console)      | **Yes**     | Same file, spy on `console.*`                        |
| `log()` ≡ `info()`                   | **Yes**     | Same file                                            |
| Delegation after `setImplementation` | **Yes**     | Same file                                            |
| Ambient import without logger port   | **Partial** | Domain usage exists; no isolated domain-service test |

---

## core:config

### Requirements Summary

| Requirement                                        | Verdict  | Evidence                                                                |
| -------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| **Approvals — spec gate disabled by default**      | **PASS** | `config-loader.ts:616` `spec: data.approvals?.spec ?? false`            |
| **Approvals — signoff gate disabled by default**   | **PASS** | `signoff: data.approvals?.signoff ?? false`                             |
| **Approvals — explicit `true` values loaded**      | **PASS** | `config-loader.spec.ts` “parses approvals booleans from config”         |
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

**D-CFG-1 — Verify scenarios for approval defaults not named in config-loader tests**

- **Spec says (verify):** GIVEN `specd.yaml` does not declare `approvals.spec` / `approvals.signoff`, THEN defaults are `false`.
- **Code says:** Defaults applied in loader (`?? false`).
- **Tests say:** No dedicated `it('defaults approvals when section omitted')` mirroring logging-default test pattern; only explicit-parse and merge cases assert `config.approvals`.
- **Assessment:** Implementation **PASS**; **test coverage gap (LOW)**.

**D-CFG-2 — Verify scenario “Spec gate on does not require pending hop” lives outside config package tests**

- **Spec says (verify):** With `approvals.spec: true`, wait is `approval.spec` check, not pending hop.
- **Code says:** In-place gate enforced in lifecycle / transition-checks (`approval-spec.ts`, `transition-change.ts`).
- **Tests say:** Covered in `transition-change.spec.ts` (stay in `ready`, `APPROVAL_REQUIRED`) — not in `config-loader.spec.ts`.
- **Assessment:** Behavior **PASS**; scenario is cross-cutting (config documents, lifecycle enforces). Acceptable split.

### Test Coverage

| Scenario                              | Covered?    | Tests                                                                              |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Parse explicit approvals booleans     | **Yes**     | `config-loader.spec.ts:961-973`                                                    |
| Layered approvals merge               | **Yes**     | `config-loader.spec.ts:1836-1854`                                                  |
| Default `spec: false` when omitted    | **Partial** | Loader code only                                                                   |
| Default `signoff: false` when omitted | **Partial** | Loader code only                                                                   |
| In-place spec gate (not pending hop)  | **Yes**     | `transition-change.spec.ts`, `lifecycle-engine.spec.ts` (outside config spec file) |

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

**D-SKL-1 — Pending state names still appear in templates (by design)**

- **Spec says:** Pending states MAY appear only as **drain** for in-flight changes.
- **Code says:** `specd-new/SKILL.md.tpl` lists `pending-spec-approval` / `pending-signoff` with “Drain only:” labels; `shared.md.tpl` mentions pending for drain context.
- **Assessment:** **PASS** — matches spec allowance; not a discrepancy.

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

## Closed vs prior audit (`20260829-142635/_partial-globals.md`)

| Prior finding                                       | Verdict                                            |
| --------------------------------------------------- | -------------------------------------------------- |
| D1 `DEPS_INCONSISTENT` (architecture/logging cycle) | **CLOSED**                                         |
| D2 bidirectional logging ↔ architecture cycle       | **CLOSED**                                         |
| D3 per-package wiring MEDIUM                        | **CLOSED**                                         |
| D4 JSDoc eslint-disable on observability logger     | **CLOSED**                                         |
| D5 observability layer unnamed                      | **CLOSED**                                         |
| D1 engine-derived error strings                     | **OPEN (LOW)** — comment-only / cross-spec wording |

---

## Summary counts

| Spec                            | Requirements checked | PASS   | Partial | FAIL  | HIGH  | MEDIUM | LOW   |
| ------------------------------- | -------------------- | ------ | ------- | ----- | ----- | ------ | ----- |
| `default:_global/architecture`  | 10                   | 10     | 0       | 0     | 0     | 0      | 0     |
| `default:_global/logging`       | 9                    | 7      | 2       | 0     | 0     | 0      | 2     |
| `core:config`                   | 10                   | 10     | 0       | 0     | 0     | 0      | 2     |
| `skills:skill-templates-source` | 14                   | 14     | 0       | 0     | 0     | 0      | 0     |
| **Total**                       | **43**               | **41** | **2**   | **0** | **0** | **0**  | **4** |

**Overall:** Implementation conforms to all four scoped specs. No HIGH or MEDIUM discrepancies. Four LOW items: Pino JSDoc eslint exception, missing console-prefix tests, config-loader default-approval test gap, and cross-package placement of in-place-gate verify scenario. Architecture/logging cycle and observability-facade model are **fully aligned** with change deltas.
