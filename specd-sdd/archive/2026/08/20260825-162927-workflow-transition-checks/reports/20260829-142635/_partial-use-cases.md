# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change (read-only audit)
- **Change:** `workflow-transition-checks`
- **Report:** `20260829-142635`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** fresh (`stale: false`); navigation via `graph search` / `graph impact` on `GetStatus`, `TransitionChange`, `ValidateArtifacts`, `GetArtifactInstruction`, `ApproveSpec`, `ApproveSignoff`
- **Code paths:** `packages/core/src/application/use-cases/*.ts`, `packages/core/src/composition/use-cases/*.ts`, matching tests under `packages/core/test/`
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior batch:** `reports/20260829-125651/_partial-use-cases.md`

---

## Requirements Summary

### `core:get-status`

| ID    | Requirement                                                                                                                                                                                                    | Spec location (preview)                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                          | Accepts a change name as input                    |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`                                                                               | Returns the change and its artifact statuses      |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                                                                                                        | Returns… / Throws ChangeNotFoundError             |
| GS-4  | Drafted: empty `availableTransitions` / `availableSteps`; `nextAction.command` MUST NOT recommend transition/validate                                                                                          | Drafted change read-only status                   |
| GS-5  | Drafted effective statuses via `projectArtifacts` only (same DAG cascade as `evaluateLifecycleVerdict` with empty `checksByTarget`); MUST NOT call `evaluateLifecycle` or `evaluateLifecycleVerdict` on drafts | Drafted change read-only status                   |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only (not detector)                                                                                                            | Implementation status / Optional pre-read refresh |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                                                                                                       | Drift-aware display status                        |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`                                                                               | Reports task completion counts / Constructor      |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                                                                                                     | Execute matching predicates then project          |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`                                                                                            | Constructor dependencies                          |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                                                                                                  | Config-based factory…                             |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                                                                                                  | Reports effective status…                         |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping shared with checks                                                                               | Returns lifecycle context / Identifies blockers   |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                                                                                                          | Graceful degradation                              |

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

| ID   | Requirement                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| AS-1 | Happy path: record consent in bound `from` (`ready` / `done`); MUST NOT transition to pending parking states |
| AS-2 | Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`                           |
| AS-3 | Gate disabled → `ApprovalGateDisabledError`; ctor `approvals` from config                                    |

### `core:config`

| ID    | Requirement                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| CFG-1 | `approvals.spec` / `approvals.signoff` default false; in-place gates; new work MUST NOT require pending hops as happy path |
| CFG-2 | Config MUST NOT document pending-spec-approval as required graph hop when spec gate is on                                  |

**Global / architecture (depth-1, relevant):** inner layers never import outer (`default:_global/architecture`). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted.

### Closed vs prior `20260829-125651` (this batch)

| Prior claim                                                                       | Re-verify (this pass)                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leftover **engine JSDoc on GetStatus** (`:771`, `:799`)                           | **CLOSED.** `get-status.ts` has **zero** `engine` matches (grep). `_nextActionAfterArchiveOverlap` (`:770-772`) and `_projectReview` (`:798-799`) now say **verdict**. `LifecycleContext.availableSteps` comment (`:232`) references `evaluateLifecycle`. |
| Drafted path uses `projectArtifacts` only vs full `evaluateLifecycleVerdict` (D2) | **CLOSED as discrepancy.** Preview delta now **requires** `projectArtifacts` only and **forbids** `evaluateLifecycle` / `evaluateLifecycleVerdict` on drafts (GS-5). Code (`:640-667`) and tests (`get-status.spec.ts:818-852` spy not called) align.     |
| Drafted `nextAction.command === null` test gap                                    | **CLOSED** (unchanged). `get-status.spec.ts:815`.                                                                                                                                                                                                         |
| Approve spec **engine check bindings** wording                                    | **STILL OPEN (LOW, spec-only).** `approve-spec` / `approve-signoff` Spec Dependencies still say "engine bindings" (`spec-preview` lines ~2938, ~3155). Code uses `boundFromStates` from `check-bindings.js`.                                              |

### Per-spec implementation

**GetStatus — IMPLEMENTED**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`. Domain `projectArtifacts` from `lifecycle-verdict.js` (`:12-17`).
- Active path: `projectArtifacts` `:452` → `executeChecksByLegalTargets` `:457-463` (no `failFastOn`) → archive predicates when `archivable` `:465-479` → `evaluateLifecycle` `:481-484`. Task paint from `taskCompletionFromChecks` after checks.
- Drafted: `_buildDraftedResult` `:621-715` — `projectArtifacts` only `:640-667`; empty hops `:673-676`; `nextArtifact: null` `:679`; `nextAction.command: null` `:709-713`.
- Schema fail: `try/catch` `SchemaNotFoundError` in active and drafted paths; degraded lifecycle on active path per spec.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187`.
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with `checksByTarget: { [requestedTarget]: evaluation.checks }`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); comments `:48-50` forbid pending rewrite.
- `resolveTransitionChangeDeps` `composition/use-cases/transition-change.ts:41-50` — no lifecycle key.

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor `:136-154` — no engine.
- `resolveValidateArtifactsDeps` `composition/use-cases/validate-artifacts.ts:38-53` — no lifecycle.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Ctor `:66-72` — no engine.
- `resolveGetArtifactInstructionDeps` `composition/use-cases/get-artifact-instruction.ts:37-48` — no lifecycle.

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: `boundFromStates('approval.spec')` (`approve-spec.ts:86`); drain only if `pending-spec-approval` (`:96-98`). Ready path does not `transition` to pending. Class JSDoc `:22-24` names binding table / drain.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` — repositories, hasher, `approvals` only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Loader defaults: `config-loader.ts:616` — `{ spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }`.
- Preview documents in-place gates; `approvals.spec: true` wait is the check, not a pending hop.

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain.

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

**`HAPPY_PATH_NEXT` / fail-fast protocol**

- Table: `change-state.ts:49-58`.
- GetStatus collects all fails: `executeChecksByLegalTargets` calls `executeMatchingPredicates` **without** `failFastOn` (`execute-matching-predicates.ts:219-231`).
- TransitionChange fail-fast: `failFastOn === result.id` with `'protocol.edge'`.

**`LifecycleEngine` class**

- Search under `packages/core`: **no** `class LifecycleEngine`. Graph class `GetStatus` is the use case, not an engine.

---

## Discrepancies

### D1 — LOW — leftover **"engine" wording in spec preview** (not in GetStatus code)

**Evidence (spec preview):**

- `core:validate-artifacts` requirement title: "DAG lifecycle from **engine** evaluate" (appears in spec + verify sections).
- `core:get-artifact-instruction` verify scenario: "Omitted artifactId uses **engine-derived** readiness"; sibling scenario "when **engine** reports dependency blockage".
- `core:approve-spec` / `core:approve-signoff` Spec Dependencies: "`from` states … come from **engine bindings**".

**Evidence (code):** No `engine` string in `get-status.ts`, `approve-spec.ts`, or `approve-signoff.ts`. Implementation uses `evaluateLifecycleVerdict`, `boundFromStates`, and `check-bindings` registry.

**Option A (prefer):** Spec/verify titles still name the removed `LifecycleEngine` class. Update to `evaluateLifecycleVerdict` / `transition-checks` bindings / `boundFromStates`.

**Option B:** Code should still expose an "engine" abstraction — **rejected** by search: no `class LifecycleEngine`, no ctor injection.

**Severity:** documentation / spec-preview drift only.

### D2 — none — drafted GetStatus `projectArtifacts` path

**Prior 125651:** LOW optional gap (code under-projects `nextArtifact`/`review` on drafts vs dual spec wording).

**This pass:** Preview delta **explicitly** requires `projectArtifacts` only and forbids `evaluateLifecycle` / `evaluateLifecycleVerdict` on drafts. Code and tests match. **No discrepancy.**

### D3 — INFO — config approvals default test gap

**Spec verify:** "GIVEN `specd.yaml` does not declare `approvals.spec` THEN `approvals.spec` defaults to `false`" (and signoff analogue).

**Code:** `config-loader.ts:616` implements defaults.

**Tests:** `config-loader.spec.ts:961-974` covers explicit `approvals` parsing; **no** test omits `approvals` and asserts `{ spec: false, signoff: false }`.

**Severity:** INFO — implementation likely correct; verify scenario not directly exercised.

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no `lifecycle:` composition stub on scoped `resolve*Deps`. **Compliant.**

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                    | Verdict                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`               | Covered                    |
| Drafted empty transitions / steps / **command null**                  | `get-status.spec.ts:795-815`                                         | Covered (`command` `:815`) |
| Drafted `projectArtifacts` parent-review; no `evaluateLifecycle`      | `get-status.spec.ts:818-858`                                         | Covered                    |
| Drafted missing schema artifacts from DAG                             | `get-status.spec.ts:861+`                                            | Covered                    |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)     | Covered                    |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)            | `execute-matching-predicates.spec.ts:43-71`                          | Covered (runner)           |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215` | Covered                    |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`    | Covered                    |
| Approvals stay in `ready` / `done`                                    | `transition-change.spec.ts:377-391`, `:435-447`                      | Covered                    |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                         | Covered                    |
| ApproveSignoff stays in `done`                                        | `approve-signoff.spec.ts:72-89`                                      | Covered                    |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241-264`                                 | Covered                    |
| GAI empty `checksByTarget` / auto `nextArtifact`                      | `get-artifact-instruction.spec.ts:98-104`                            | Covered                    |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-71`                                    | Covered                    |
| Config explicit approvals parse                                       | `config-loader.spec.ts:961-974`                                      | Covered                    |
| `boundFromStates` registry                                            | `transition-checks.spec.ts:221-223`                                  | Covered                    |

---

## Missing Tests

| Gap                                                             | Spec                        | Suggested assertion                                                                                                            |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Config approvals default when section omitted                   | CFG-1 verify                | Load minimal yaml without `approvals`; expect `{ spec: false, signoff: false }`                                                |
| GAI verify title "engine-derived"                               | GAI verify                  | Rename scenario only; behaviour already tested via `evaluateLifecycleVerdict` spy                                              |
| Composition never resolves `lifecycle` (explicit key assertion) | GS-11 / TC-6 / VA-3 / GAI-3 | Optional: `expect(deps).not.toHaveProperty('lifecycle')` in composition tests (pattern exists in `compile-context.spec.ts:88`) |
| GetStatus hop with two fails at **use case** level              | GS-9                        | Runner test exists; optional UC-level two-fail hop integration                                                                 |

**Closed vs 125651:** drafted `nextAction.command === null` — **not missing**. Draft `evaluateLifecycleVerdict` spy — **not missing** (spec now forbids the call). GetStatus engine JSDoc — **not missing** (removed).

No missing test for **second CountTasks on GetStatus** — `toHaveBeenCalledTimes(1)` on a single execute is present.

---

## Spec Dependency Chain

From `changes status` / preview `## Spec Dependencies` (depth 1, assigned specs):

- **core:get-status** → `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:transition-change** → `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:validate-artifacts** → `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, `core:spec-id-format`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:get-artifact-instruction** → `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-spec** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-signoff** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:config** → `core:vcs-adapter-port`, `default:_global/architecture`, `core:transition-checks`

**Consistency note:** several specs still **depend on** `core:lifecycle-engine` while implementation uses `evaluateLifecycle` / `evaluateLifecycleVerdict`. That is a **spec-id naming** artifact (the engine spec describes module functions). Not a code import violation.

**Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

---

## Summary counts

| Metric                               | Count                                           |
| ------------------------------------ | ----------------------------------------------- |
| Specs in this batch                  | 7                                               |
| Requirements tracked (tables above)  | 32                                              |
| Implemented (behaviour)              | 32 / 32                                         |
| Partial / wording-only               | 1 (D1 spec "engine" titles / dependencies text) |
| Functional discrepancies             | 0 HIGH; 0 LOW functional                        |
| Missing tests                        | 1 INFO (config approvals default); 3 optional   |
| Prior GetStatus engine JSDoc         | **CLOSED**                                      |
| Prior drafted `command` null test    | **CLOSED**                                      |
| Prior D2 draft `projectArtifacts`    | **CLOSED** (spec aligned)                       |
| Prior approve-spec "engine bindings" | **OPEN (LOW, spec-only)**                       |
| `LifecycleEngine` class              | **ABSENT**                                      |
| domain → application imports         | **ABSENT**                                      |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)                            |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`; tests spy empty bag)                                 |
| Drafted GetStatus `projectArtifacts` only, no evaluate calls     | **PASS** (code `:640-667`; test `:849-852`)                                                 |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (GetStatus, TransitionChange, ValidateArtifacts, GAI, ApproveSpec, ApproveSignoff) |
| Drafted GetStatus empty hops + `command` null                    | **PASS** (code `:675-713`; test `:815`)                                                     |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`; tests `:20-71`)                                     |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`; runner tests)                                                             |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`)                                              |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready` / `done`)              |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430`)                                 |
| Config approvals default false                                   | **PASS** (loader `:616`; explicit-parse test only)                                          |
