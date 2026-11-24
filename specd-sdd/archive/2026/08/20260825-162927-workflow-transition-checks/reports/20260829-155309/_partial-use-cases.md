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
