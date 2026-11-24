# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change
- **Change:** `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** treated as reindexed per parent; navigation via `graph search` (`evaluateLifecycleVerdict`, `resolveGetStatusDeps`, class `GetStatus` at `get-status.ts:287`)
- **User-enforced:** no `domain` → `application` imports; no `LifecycleEngine` class
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior `20260829-090131` this batch:** leftover engine JSDoc on GetStatus; drafted `command` null test gap; D2 draft `projectArtifacts` vs verdict.

---

## Requirements Summary

### `core:get-status`

Previewed delta requirements (abridged, all checked):

| ID    | Requirement                                                                                                                         | Spec location (preview)                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                               | Accepts a change name as input                              |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`    | Returns the change and its artifact statuses                |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                             | Returns… / Throws ChangeNotFoundError                       |
| GS-4  | Drafted: empty `availableTransitions`; `nextAction.command` MUST NOT recommend transition/validate; `availableSteps` empty          | Drafted change read-only status / Returns lifecycle context |
| GS-5  | Drafted effective statuses via same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`)              | Drafted change read-only status                             |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only (not detector)                                 | Implementation status / Optional pre-read refresh           |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                            | Drift-aware display status                                  |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`    | Reports task completion counts / Constructor                |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                          | Execute matching predicates then project                    |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`                 | Constructor dependencies                                    |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                       | Config-based factory…                                       |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                       | Reports effective status…                                   |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping is shared with checks | Returns lifecycle context / Identifies blockers             |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                               | Graceful degradation                                        |

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

**Global / architecture (depth-1, relevant):** inner layers never import outer (`specs/_global/architecture` layered structure). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted.

### Closed vs prior `20260829-090131` (this batch)

| Prior claim                                                    | Re-verify (this pass)                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leftover **engine JSDoc on GetStatus**                         | **PARTIAL.** `LifecycleContext.availableSteps` now says `evaluateLifecycle` (`get-status.ts:232`). **Still leftover:** `_nextActionAfterArchiveOverlap` (`:771` “so the engine can still recommend”) and `_projectReview` (`:799` “Projects engine review”). Grep of this file: only those two `engine` hits. |
| Drafted `nextAction.command === null` **test gap**             | **CLOSED.** `get-status.spec.ts:795-815` asserts `result.nextAction.command` is `null` together with empty `validTransitions` / `availableTransitions` / `availableSteps`.                                                                                                                                    |
| D2 draft `projectArtifacts` vs full `evaluateLifecycleVerdict` | **STILL OPEN (LOW).** Unchanged behaviour: `_buildDraftedResult` uses `projectArtifacts` (`:640-641`), zeros `nextArtifact` / `review.required` / checks (`:673-714`). Test still spies that `evaluateLifecycle` is **not** called (`:849-852`).                                                              |

### Per-spec implementation

**GetStatus — IMPLEMENTED (contracts hold)**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`. Domain `projectArtifacts` imported from `lifecycle-verdict.js` (`:12-17`).
- Active path: `projectArtifacts` `:452` → `executeChecksByLegalTargets` `:457-463` (no `failFastOn`) → archive predicates when `archivable` `:465-479` → `evaluateLifecycle` `:481-484`. Task paint `taskCompletionFromChecks` then `evaluateLifecycle` (order test `:387-434`, `CountTasks` once `:430`).
- Drafted: `_buildDraftedResult` `:621-715` — empty hops `:673-676`, `nextAction.command: null` `:709-713`. Effective status via `projectArtifacts` (same DAG helper `evaluateLifecycleVerdict` uses internally).
- Schema fail: `try/catch` `SchemaNotFoundError` `:395-430`; `validTransitions` from `VALID_TRANSITIONS`; `availableTransitions` stays `[]`.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187` (`change-state.ts:49-58`; pending/archivable/archiving omitted).
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

- ApproveSpec: `boundFromStates('approval.spec')`; drain only if `pending-spec-approval` (`approve-spec.ts:86-98`). Ready path does not `transition` to pending. Class JSDoc `:22-24` names the binding table / drain, not a removed engine class.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` — repositories, hasher, `approvals` only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:219-220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Preview: stay in `ready`/`done`; `approvals.spec: true` wait is the check, not a pending hop (`core:config` verify “Spec gate on does not require pending-spec-approval in the graph”).

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain (`:1-12`).

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

Matches the assigned contract.

**`HAPPY_PATH_NEXT` / fail-fast protocol**

- Table: `change-state.ts:49-58`.
- GetStatus collects all fails: `executeChecksByLegalTargets` calls `executeMatchingPredicates` **without** `failFastOn` (`execute-matching-predicates.ts:219-231`).
- TransitionChange fail-fast: `failFastOn === result.id` (`:143-147`) with `'protocol.edge'`.

**`LifecycleEngine` class**

- Search under `packages/core`: **no** `class LifecycleEngine`. Graph class `GetStatus` is the use case, not an engine.

---

## Discrepancies

### D1 — LOW — leftover “engine” **wording** (GetStatus JSDoc + some spec/verify titles)

**Evidence (code):** `get-status.ts:771`, `:799` still say “engine”. **Improved vs 090131:** `:232` no longer says “from the engine”. ApproveSpec/Signoff class comments no longer say “engine binds”. `workflow-requires.ts` no longer uses “Engine bindings” in the runner header.

**Evidence (spec):** GetStatus “availableSteps MUST be … from the **engine**”; GAI verify scenario title “Omitted artifactId uses **engine-derived** readiness”; ApproveSpec depends-on text “engine check bindings”.

**Option A (prefer for wording):** Specs and remaining comments still name the removed class; behaviour already uses `evaluateLifecycle` / `evaluateLifecycleVerdict` / `boundFromStates`. Update wording to those names.

**Option B:** Treat leftover “engine” as a remaining `LifecycleEngine` abstraction — **rejected by search**: no `class LifecycleEngine`.

**Severity:** documentation / spec-preview drift, not a ctor/import violation.

### D2 — LOW — drafted GetStatus does not call `evaluateLifecycleVerdict`

**Spec:** compute effective statuses via the same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`). Also (result requirement): compute artifact **and lifecycle projections** for inspection; MUST NOT surface mutating transitions.

**Code:** `projectArtifacts` only (`get-status.ts:640-667`). Lifecycle inspection fields zeroed (`validTransitions: []`, `nextArtifact: null`, empty checks, `review.required: false`). Test **asserts** `evaluateLifecycle` is not called (`get-status.spec.ts:818-852`).

**Option A:** Spec’s parenthetical `projectArtifacts` plus “MUST NOT surface transitions” is the intended draft path; empty lifecycle extras are correct. Parent-review cascade is covered (`pending-parent-artifact-review` `:853-855`).

**Option B:** Spec wants a full `evaluateLifecycleVerdict(..., { checksByTarget: {} })` for inspection (`nextArtifact`, review) while still emptying mutation surfaces. Then code under-projects `nextArtifact`/review on drafts.

**Assessment:** functional contract for **empty transitions / null command / parent-review cascade** is met. Gap is only whether draft inspection must include verdict `nextArtifact`/`review`. Unchanged since 090131.

### D3 — INFO — GetStatus `LifecycleContext.availableSteps` comment vs D1

Comment `:232` now matches `evaluateLifecycle`. Remaining engine language is D1 (`:771`, `:799`).

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no `lifecycle:` composition stub on these `resolve*Deps`. **Compliant.**

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                    | Verdict                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`               | Covered (deps object has no lifecycle field)            |
| Drafted empty transitions / steps / **command null**                  | `get-status.spec.ts:795-815`                                         | **Covered** (`command` `:815`; `availableSteps` `:812`) |
| Drafted parent-review cascade; no `evaluateLifecycle`                 | `get-status.spec.ts:818-858`                                         | Covered                                                 |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)     | Covered                                                 |
| Recount on second `GetStatus.execute`                                 | `get-status.spec.ts:437+`                                            | Covered                                                 |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)            | `execute-matching-predicates.spec.ts:43`                             | Covered (runner, not UC integration)                    |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215` | Covered                                                 |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`    | Covered                                                 |
| Approvals stay in `ready`                                             | `transition-change.spec.ts:377-391`                                  | Covered                                                 |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241-264`                                 | Covered                                                 |
| GAI empty `checksByTarget`                                            | `get-artifact-instruction.spec.ts:98-104`                            | Covered                                                 |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-71`                                    | Covered                                                 |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                         | Covered                                                 |
| ApproveSignoff stays in `done`                                        | `approve-signoff.spec.ts:72-89`                                      | Covered                                                 |

---

## Missing Tests

| Gap                                                                  | Spec                | Suggested assertion                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafted `evaluateLifecycleVerdict` not required vs spec dual wording | GS-5 / D2           | If Option A: keep `projectArtifacts` / parent-review only (current). If Option B: spy `evaluateLifecycleVerdict` once with `{ checksByTarget: {} }` and assert `nextArtifact`/`review` from verdict |
| GAI verify title “engine-derived”                                    | GAI verify          | Rename scenario; keep existing `evaluateLifecycleVerdict` spy                                                                                                                                       |
| Composition never resolves `lifecycle`                               | GS-11 / TC-6 / VA-3 | Optional: assert deps object keys omit `lifecycle` (shape already implied by composition tests)                                                                                                     |
| GetStatus hop with two fails on **use case** (not only runner)       | GS-9                | Runner test exists; optional UC-level two-fail hop                                                                                                                                                  |

**Closed vs 090131:** drafted `nextAction.command === null` is **no longer missing**.

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

**Consistency note:** several specs still **depend on** `core:lifecycle-engine` while implementation uses `evaluateLifecycle` / `evaluateLifecycleVerdict`. That is a **spec-id naming** leftover (the engine spec now describes functions). Not a code import of a class.

**Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

---

## Summary counts

| Metric                                | Count                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| Specs in this batch                   | 7                                                                  |
| Requirements tracked (tables above)   | 32                                                                 |
| Implemented (behaviour)               | 31–32 (all listed contracts hold; D2 is optional extra projection) |
| Partial / wording-only                | 1 (D1 leftover “engine” on GetStatus `:771`, `:799` + spec titles) |
| Functional discrepancies              | 0 HIGH; 1 LOW optional (D2 draft verdict vs `projectArtifacts`)    |
| Missing tests                         | 0 required for GS-4 command null; 1 optional (D2 verdict spy)      |
| Prior leftover GetStatus engine JSDoc | **PARTIAL** (`:232` fixed; `:771`/`:799` remain)                   |
| Prior drafted `command` null test     | **CLOSED** (`get-status.spec.ts:815`)                              |
| Prior D2                              | **OPEN (LOW)**                                                     |
| `LifecycleEngine` class               | **ABSENT**                                                         |
| domain → application imports          | **ABSENT**                                                         |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)                            |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`; tests spy empty bag)                                 |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (GetStatus, TransitionChange, ValidateArtifacts, GAI, ApproveSpec, ApproveSignoff) |
| Drafted GetStatus empty hops + `command` null                    | **PASS** (code `:675-713`; test `:815`)                                                     |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`; tests `:20-71`)                                     |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`; runner tests)                                                             |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`; pending/archivable tests)                    |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready` / `done`)              |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430` one execute)                     |
