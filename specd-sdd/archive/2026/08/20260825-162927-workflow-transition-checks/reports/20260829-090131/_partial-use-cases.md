# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change
- **Change:** `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** reindexed (`stale: false`); navigation via `graph search` / `graph impact`
- **User-enforced:** no `domain` → `application` imports; no `LifecycleEngine` class
- **Neither spec nor code is truth.** Discrepancies list Option A (spec wrong / wording drift) and Option B (code wrong).

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

Evidence is `packages/core/src/...` line numbers unless noted. Dist confirmation: `packages/core/dist/chunk-OEJ6NTAS.js` (bundled).

### Closed vs prior `20260829-013719` (this batch)

| Prior claim                                                        | Re-verify                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH: ValidateArtifacts ctor `LifecycleEngine`                     | **CLOSED.** Ctor `packages/core/src/application/use-cases/validate-artifacts.ts:136-154` has no lifecycle engine. Call `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })` at `:220-222`. Dist `chunk-OEJ6NTAS.js:28556` same call. Test `validate-artifacts.spec.ts:241` spies empty `checksByTarget`. Graph: class `ValidateArtifacts` at `validate-artifacts.ts:114`. |
| GetStatus / GAI leftover engine **language**                       | **Mostly closed for call graph; leftover comments remain.** GetStatus imports `evaluateLifecycle` `:18`, calls `:481-484`. GAI imports `evaluateLifecycleVerdict` `:15`, calls `:97-99`. **No `engine` token in GAI source.** GetStatus JSDoc still says “engine” at `:232`, `:723`, `:771-801`.                                                                                        |
| TransitionChange pending-gate verify still named `LifecycleEngine` | **CLOSED in previewed deltas.** `spec-preview core:transition-change` pending scenarios now say `evaluateLifecycle` (preview ~369–379). Implementation: `evaluateLifecycle` import `:14`, call `:219-223`; drain/gate `_assertDrainAndGateTargets` `:337-366`; no pending rewrite of `to`. Tests `transition-change.spec.ts:377-391` stay in `ready` on approval-required.              |
| composition `lifecycle: {} as never`                               | **CLOSED.** `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` returns changes/schema/approvals/refresh/bindings only. Same pattern for TransitionChange `:41-50`, ValidateArtifacts `:38-53`, GAI `:37-48`, ApproveSpec `:37-44`, ApproveSignoff `:37-44`. Workspace search: no `lifecycle: {} as never`.                                                              |
| dist stale / `INCOMPLETE_ARTIFACT` from old engine                 | **src + dist + tests agree.** Dist has `evaluateLifecycleVerdict` (`chunk-OEJ6NTAS.js:22600`, GAI `:23272`, ValidateArtifacts `:28556`). **Zero** `LifecycleEngine` matches under `packages/core/dist`. Graph search for `class LifecycleEngine`: **no class**. `lifecycle-engine.ts` is a **re-export barrel** of `lifecycle-verdict.js` (`:1-18`).                                    |

### Per-spec implementation

**GetStatus — IMPLEMENTED (contracts hold)**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`.
- Active path: `executeChecksByLegalTargets` `:457` then `evaluateLifecycle` `:481-484`; task paint `taskCompletionFromChecks` `:96-120`, `:488`.
- Drafted: `_buildDraftedResult` `:621-715` — `availableTransitions: []` `:675`, `availableSteps: []` `:676`, `nextAction.command: null` `:709-713`. Effective status via `projectArtifacts` `:640-641` (same DAG as `evaluateLifecycleVerdict` which calls `projectArtifacts` at `lifecycle-verdict.ts:153`). Explicitly does **not** call `evaluateLifecycle` (test spy `get-status.spec.ts:847-850`).
- Schema fail: try/catch `SchemaNotFoundError` `:395-444`; `availableTransitions` stays `[]`.
- Composition: `resolveGetStatusDeps` does not resolve lifecycle (`get-status.ts` composition `:39-50`).

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187` (`change-state.ts:49-58`).
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with `checksByTarget: { [requestedTarget]: evaluation.checks }`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); comments `:48-50` forbid pending rewrite.
- `resolveTransitionChangeDeps` `:41-50` — no lifecycle key.

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor `:136-154` — no engine.
- `resolveValidateArtifactsDeps` `:38-53` — no lifecycle.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Ctor `:66-72` — no engine.
- `resolveGetArtifactInstructionDeps` `:37-48` — no lifecycle.

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: consent in `boundFromStates('approval.spec')`; drain only if `pending-spec-approval` (`approve-spec.ts:86-98`). Ready path does not `transition` to pending.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- Ctor comments still say “engine binds” (`approve-spec.ts:23`, `approve-signoff.ts:23`) — wording only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:219-220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Preview: gates stay in `ready`/`done`; pending not happy-path.

**Architecture / domain imports — IMPLEMENTED**

- Grep `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain (`:1-12` domain-only imports).

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

Matches the assigned contract.

---

## Discrepancies

### D1 — LOW — leftover “engine” **wording** (GetStatus + domain checks + change specs)

**Evidence (code):** `get-status.ts:232` “from the engine”; `:723`, `:771-801` “Engine” JSDoc. `workflow-requires.ts:22-23`, `:96` “Engine bindings”. ApproveSpec/Signoff class JSDoc “engine binds” (`approve-spec.ts:23`, `approve-signoff.ts:23`).

**Evidence (spec):** GetStatus “availableSteps MUST be the extras-bearing `schema.workflow()` rows from the **engine**”; GAI verify scenario title “Omitted artifactId uses **engine-derived** readiness”; ApproveSpec depends-on text “engine check bindings”.

**Option A (prefer for wording):** Specs and comments still name the removed class; behaviour already uses `evaluateLifecycle` / `evaluateLifecycleVerdict` / `boundFromStates`. Update wording to those names.

**Option B:** Treat leftover “engine” as a remaining `LifecycleEngine` abstraction — **rejected by graph**: no `class LifecycleEngine`; barrel only.

**Severity:** documentation / spec-preview drift, not a ctor/import violation.

### D2 — LOW — drafted GetStatus does not call `evaluateLifecycleVerdict`

**Spec:** compute effective statuses via the same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`). Also: compute artifact **and lifecycle projections** for inspection.

**Code:** `projectArtifacts` only (`get-status.ts:640-667`). Lifecycle inspection fields zeroed (`validTransitions: []`, `nextArtifact: null`, empty checks). Test **asserts** `evaluateLifecycle` is not called (`get-status.spec.ts:816-857`).

**Option A:** Spec’s parenthetical `projectArtifacts` plus “MUST NOT surface transitions” is the intended draft path; empty lifecycle extras are correct.

**Option B:** Spec wants a full `evaluateLifecycleVerdict(..., { checksByTarget: {} })` for inspection (`nextArtifact`, review) while still emptying mutation surfaces. Then code under-projects `nextArtifact`/review on drafts.

**Assessment:** functional contract for **empty transitions / null command / parent-review cascade** is met (`pending-parent-artifact-review` test `:852-853`). Gap is only whether draft inspection must include verdict `nextArtifact`/`review`.

### D3 — INFO — GetStatus `LifecycleContext.availableSteps` comment vs implementation

Comment `:232` says “from the engine”; implementation copies `verdict.availableSteps` from `evaluateLifecycle` (`:524`). Same as D1.

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no dist symbol, no `lifecycle:` composition stub. **Compliant** with user-enforced rule.

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                       | Verdict                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`                  | Covered                           |
| Drafted empty transitions / steps                                     | `get-status.spec.ts:795-857`                                            | Covered (`availableSteps` `:856`) |
| Drafted parent-review cascade                                         | `get-status.spec.ts:816-857`                                            | Covered                           |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:362-434` (`toHaveBeenCalledTimes(1)` `:430`)        | Covered                           |
| Recount on second `GetStatus.execute` (no instance cache)             | `get-status.spec.ts:437-454`                                            | Covered                           |
| Schema degrade empty `availableTransitions`                           | `get-status.spec.ts:286-296`                                            | Covered                           |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215`    | Covered                           |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-254`                                     | Covered                           |
| Approvals stay in `ready`                                             | `transition-change.spec.ts:377-391`                                     | Covered                           |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241`                                        | Covered                           |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-50`                                       | Covered                           |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                            | Covered                           |
| Dist vs src DAG functions                                             | `chunk-OEJ6NTAS.js` `evaluateLifecycleVerdict` at ValidateArtifacts/GAI | Covered by rebuild artifact       |

---

## Missing Tests

| Gap                                                                  | Spec                | Suggested assertion                                                                                                                         |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafted `nextAction.command === null`                                | GS-4                | `get-status.spec.ts` drafted block asserts `result.nextAction.command` is `null` (currently only transitions/steps/nextArtifact)            |
| Drafted `evaluateLifecycleVerdict` not required vs spec dual wording | GS-5 / D2           | If Option A: assert `projectArtifacts` / parent-review only. If Option B: spy `evaluateLifecycleVerdict` once with `{ checksByTarget: {} }` |
| GetStatus `failFastOn` omitted (collect all fails)                   | GS-9                | Exists at `execute-matching-predicates.spec.ts:43` — **not missing**; ensure GetStatus integration still has a hop with two fails           |
| GAI verify title “engine-derived”                                    | GAI verify          | Rename scenario; keep `evaluateLifecycleVerdict` spy (`empty checksByTarget`)                                                               |
| TransitionChange verify scenarios named `LifecycleEngine`            | TC (historical)     | **Re-previewed closed**; keep tests on `evaluateLifecycle` import (`transition-change.spec.ts:15`)                                          |
| Composition never resolves `lifecycle`                               | GS-11 / TC-6 / VA-3 | Source-string tests exist for overlap flag; could assert deps object keys omit `lifecycle`                                                  |

No missing test for **second CountTasks on GetStatus** — `toHaveBeenCalledTimes(1)` on a single execute is present.

---

## Spec Dependency Chain

From `changes status workflow-transition-checks` `specDependsOn` (depth 1, assigned specs):

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

| Metric                                     | Count                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| Specs in this batch                        | 7                                                               |
| Requirements tracked (tables above)        | 32                                                              |
| Implemented (behaviour)                    | 31                                                              |
| Partial / wording-only                     | 1 (D1 leftover “engine” strings)                                |
| Functional discrepancies                   | 0 HIGH; 1 LOW optional (D2 draft verdict vs `projectArtifacts`) |
| Missing tests                              | 1–2 (draft `command: null`; optional verdict spy)               |
| Prior HIGH ValidateArtifacts ctor          | **CLOSED**                                                      |
| Prior composition `lifecycle: {} as never` | **CLOSED**                                                      |
| Prior dist stale engine                    | **CLOSED** (src + `dist/chunk-OEJ6NTAS.js` + tests)             |
| `LifecycleEngine` class                    | **ABSENT**                                                      |
| domain → application imports               | **ABSENT**                                                      |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)        |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`)                                  |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (all six composition helpers in this batch)                    |
| Drafted GetStatus empty transitions / steps / `command` null     | **PASS** (`:675-676`, `:713`)                                           |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`)                                 |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`)                                                       |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`)                          |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready`)   |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430` one execute) |
