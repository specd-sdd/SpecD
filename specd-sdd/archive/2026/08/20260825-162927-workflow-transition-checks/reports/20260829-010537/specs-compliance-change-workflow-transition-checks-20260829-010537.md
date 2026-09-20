# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260829-010537
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state at audit:** designing (ARTIFACT_DRIFT / INCOMPLETE_ARTIFACT on specs; nextAction `/specd-design`)
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** Incremental index skipped files (`filesIndexed: 0`); later `graph stats` as reported by subagents was `stale: false` / `contentFresh: true` at `2948f1a2`. **File-level graph impact is broken** (`no-language-adapter` / `no indexed file matches`). Audits verified claims against **working-tree source**.
- **Read-only.** Partials in this directory must be kept.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide extras:** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (conformance only). Depth-1 deps noted inside partials.

**Batches:** `_partial-lifecycle-core.md`, `_partial-use-cases.md`, `_partial-archive-hooks.md`, `_partial-cli-skills.md`, `_partial-globals.md`

## Executive summary

Neither spec nor code is assumed true. **Focus contract of this change (checks own hops; functions not a LifecycleEngine class; DAG vs hop split) is implemented in code.** Remaining HIGH items are product/spec collisions, not a resurrected engine class.

### Closed vs prior audit (20260828-192030)

| Prior HIGH                                                   | Now                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain `LifecycleEngine` class imports application           | **Closed.** No class, no `LifecycleEngineOptions`, no `@deprecated` shim. Barrel `lifecycle-engine.ts` re-exports functions only.                     |
| Ctor/factory `LifecycleEngine` / `createEvaluateLifecycle()` | **Closed in code + spec.md constructors.** `createEvaluateLifecycle` does not exist. **Still open in some verify.md** (especially ValidateArtifacts). |
| Overlap `nextHop.targetStep` stays on current state          | **Closed.** Overlap → `designing` + `/specd-design`.                                                                                                  |

### Highest-severity open findings

1. **HIGH — code-wrong (locked by tests):** From `done`/`signed-off`, domain `nextHop.targetStep` is `archivable` but `resolveLifecycleCommand` returns `/specd-verify`. `lifecycle-engine.spec.ts` asserts that pair. Spec happy-path matrix wants `/specd-archive` (or signoff approve).
2. **HIGH — both:** `workflow.requires` always fails as `INCOMPLETE_ARTIFACT` (including `drifted-pending-review`). Live status of this change used that code. Spec also lists `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` as distinct mandatory codes.
3. **HIGH — spec-wrong (verify):** `core:validate-artifacts` verify still requires constructor `LifecycleEngine`, contradicting the same change’s spec.md and all four `resolve*Deps` helpers.
4. **MEDIUM — spec-wrong:** Widespread leftover `LifecycleEngine` / `.evaluate` in preview spec/verify (lifecycle-engine, get-status, transition-change, schema-format, storage, change interpretation prose).
5. **MEDIUM — both:** Domain still exports `LifecycleNextAction.command` type; architecture vs ambient `Logger` singleton (explicitly allowed by lifecycle + architecture deltas).
6. **MEDIUM — spec-wrong:** `core:change` still says any `taskCompletionCheck` auto-gates a step; `core:workflow-model` requires `requiresTaskCompletion`.
7. **LOW — code-wrong:** Drafted CLI JSON may still pass through `availableTransitions` (text + Core empty list; defense-in-depth). Composition tests still author a leftover `lifecycle` field on deps objects.
8. **LOW:** Dual `deps.consistent` after archive pre-hooks; repair-guide error prefix sketch; extra Core progress events beside check bus; `log()` vs `info()` untested; test files not mirroring `observability/logger.ts`.

### Architecture / logging (user constraint)

`default:_global/architecture` stays **package-agnostic** (no `evaluateLifecycle`, no core paths, no `LifecycleEngine`). Domain does not import `application/`. Ambient Logger from `observability/` is the documented exception. **0 blocking** vs that constraint.

### What is aligned

- GetStatus / TransitionChange import `evaluateLifecycle`; DAG UCs use `evaluateLifecycleVerdict` + `checksByTarget: {}`.
- Schema catch only `SchemaNotFoundError`.
- Draft Core `nextAction.command: null`.
- `--next` → `to: 'next'` in Core (`HAPPY_PATH_NEXT`).
- Archive is an operation (`archiveBindings`); hooks are `hook-pre.ts` / `hook-post.ts`; `RunStepHooks` on checks not use-case id loops.
- Approvals stay in `ready`/`done`.
- Archive allowed from `archivable` **and** `archiving` in code (`assertArchivable`); entity tests weak on `archiving`.
- Skills: `nextAction.command`, overlap → `/specd-design`, no engine injection copy.

## Recommended next fixes (not part of this audit)

1. Decide `/specd-verify` vs `/specd-archive` on `done` and update either guidance or spec + tests.
2. Map requires failures to drift/review codes **or** document INCOMPLETE_ARTIFACT-always.
3. Mechanical rename remaining `LifecycleEngine` in preview spec/verify (especially ValidateArtifacts ctor).
4. Move `LifecycleNextAction` to application **or** allow domain DTO in spec.
5. Force empty `availableTransitions` on drafted CLI JSON; drop `lifecycle` from composition test fixtures.

---

# Detailed findings (verbatim partials)

---

## Partial file: `_partial-lifecycle-core.md`

# Spec compliance partial: lifecycle core

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** `graph stats` reported `stale: false`, `contentFresh: true`, `currentRef: 2948f1a2`. `graph search` located `evaluateLifecycleVerdict`, `projectArtifacts`, `evaluateLifecycle`, `WorkflowCheck`, `classifyAlong`. `graph search LifecycleEngine` / `LifecycleEngineOptions` returned **zero symbols**. `graph impact --file core:src/domain/services/lifecycle-verdict.ts` failed (`no indexed file matches`). `graph impact --symbol evaluateLifecycleVerdict` failed (`not_found`). **All implementation claims below were verified against current source files**, not graph adjacency.
- **Spec source:** `changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md concatenated).
- **Neither spec nor code is assumed true.**

**Cross-cutting global consistency (architecture / logging / testing)**

| Constraint                                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/architecture` — domain does not import application; stateless domain = plain functions | Domain lifecycle is functions in `lifecycle-verdict.ts`. Domain does **not** import `application/`. Domain **does** import `../../observability/logger.js` (ambient `Logger` singleton). Architecture forbids module-level singletons and limits domain deps to stdlib + domain types. Change spec `core:lifecycle-engine` **explicitly permits** `Logger.debug`. **Tension: architecture vs logging exception.** |
| `default:_global/architecture` — inner layers never import outer                                        | `packages/core/src/domain/services/lifecycle-verdict.ts` → `packages/core/src/observability/logger.ts`. Observability is not `domain/`.                                                                                                                                                                                                                                                                           |
| `default:_global/logging`                                                                               | `Logger` implements console-compatible levels including `debug`. Domain uses `Logger.debug` only. Production path avoids raw `console` here.                                                                                                                                                                                                                                                                      |
| `default:_global/testing`                                                                               | Vitest; tests under `packages/core/test/` with `.spec.ts`. Domain verdict tests live at `test/domain/services/lifecycle-engine.spec.ts` while source is `lifecycle-verdict.ts` (name mismatch vs “mirror src”). That file **imports application** `evaluateLifecycle` (layer mixing in a domain test).                                                                                                            |

**Focus-area verification (do not assume)**

| Claim                                                                               | Verdict                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `LifecycleEngine` class                                                          | **Confirmed.** No class in graph or source. `lifecycle-engine.ts` is a re-export barrel only (`packages/core/src/domain/services/lifecycle-engine.ts:1-19`).                                                                          |
| No `@deprecated` shim                                                               | **Confirmed** for lifecycle types. Remaining `@deprecated` in core is unrelated (`rule-evaluator.ts`, `archived-change-index-entry.ts`).                                                                                              |
| No `LifecycleEngineOptions` alias                                                   | **Confirmed.** Input type is `LifecycleVerdictInput` (`lifecycle-verdict.ts:44`).                                                                                                                                                     |
| Domain: `evaluateLifecycleVerdict` / `projectArtifacts` / `nextHop` (no command)    | **Mostly confirmed.** `LifecycleNextHop` has no `command` (`lifecycle-verdict.ts:99-103`). Domain **still defines** `LifecycleNextAction` with `command` (`105-107`) and re-exports it from the domain barrel.                        |
| Application: `evaluateLifecycle` + `lifecycle-guidance.ts` for `nextAction.command` | **Confirmed structurally.** `evaluateLifecycle` at `lifecycle-evaluation.ts:19-36`. Commands in `lifecycle-guidance.ts`. **Happy-path command for `done`→`archivable` is `/specd-verify`, not `/specd-archive` (see discrepancies).** |
| Domain MUST NOT import application                                                  | **Confirmed** (no `application/` imports). Observability import remains.                                                                                                                                                              |
| Overlap review: `nextHop.targetStep` = `designing`                                  | **Implemented** `resolveLifecycleNextHop` `lifecycle-verdict.ts:813-818`. Covered by test `lifecycle-engine.spec.ts:344-382`.                                                                                                         |
| `workflow.requires`: complete \| skipped                                            | **Implemented** `domain/checks/workflow-requires.ts:33-36`. Binding skips `along=recovery` (`check-bindings.ts:35-38`).                                                                                                               |
| Change archive from `archivable` **and** `archiving`                                | **Code yes** (`change.ts:668-671` `isArchivable`; `1070-1073` `assertArchivable`). **Entity tests do not cover `archiving`.** Change **verify** scenario still says “not in `archivable` state” only.                                 |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary

1. **Stateless domain lifecycle verdict** — Plain functions in `lifecycle-verdict.ts`: `evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`. No class, no debug port, no `LifecycleEngineOptions`. Domain return `LifecycleDomainVerdict` without `nextAction.command`. Optional `Logger.debug`.
2. **Centralized validation logic** — Sole domain authority; project caller-supplied predicate `CheckResult`s; no `run:` effects; no snapshot bag; no `check.run` fallback; `projectArtifacts` is not a second availability algorithm.
3. **Effective artifact status** — DAG mapping: drift/review sticky; complete + unsatisfied upstream → `pending-parent-artifact-review`; recursive parent blocks. Spec text still says public contract is `LifecycleEngine.evaluate(...)` and forbids public `computeEffectiveStatus`.
4. **Canonical-state-only** — Ignore display `complete-with-drift` / `hasDrift` as extra states.
5. **Machine-readable blockers** — Structured `Blocker`; skippable omitted when bypass active; no `warnings`; mandatory codes including `INCOMPLETE_ARTIFACT` (not `MISSING_ARTIFACT`); overlap victim ≠ `OVERLAP_CONFLICT`.
6. **Available steps and domain next hop** — One predicate evaluation; `nextHop` without `command`; hop matrix including overlap → `designing`; archiving guidance.
7. **Application lifecycle guidance** — `lifecycle-guidance.ts` + `evaluateLifecycle`; DAG consumers may use empty `checksByTarget`.
8. **Archiving escape transitions** — `archivable` + `designing` in valid/available; recovery skips requires/taskCompletion; redesign for `archiving→designing`.
9. **Review summary** — Drift and overlap as diagnostics (overlap as review, not live archive overlap).
10. **Shared lifecycle interpretation** — Named consumers; no `LifecycleEngine` class; barrel re-export only; `CompileContext` not a consumer.
11. **Next artifact topological order** — `schema.artifactDag().topologicalOrder()`.

### Implementation Status (per requirement)

| Req                       | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain verdict  | **implemented** (with type smell) | Functions `evaluateLifecycleVerdict` `lifecycle-verdict.ts:146`, `projectArtifacts:313`, `findBlockingParent:330`. No class. Re-export `lifecycle-engine.ts:1-19`. `LifecycleNextAction` still in domain `:105-107`.                                                                                                                                                                                                                                       |
| Centralized validation    | **implemented**                   | Projects `options.checksByTarget` `:163-176`. No I/O in verdict. `Logger.debug` `:277`. Does not call `check.run`.                                                                                                                                                                                                                                                                                                                                         |
| Effective artifact status | **implemented**                   | `effectiveStatus` `:356-410`. Recursive parent via `findBlockingParentInternal`. No `computeEffectiveStatus` export.                                                                                                                                                                                                                                                                                                                                       |
| Canonical-state-only      | **implemented**                   | Uses `artifact.status` / file `status`, not `displayStatus` / `hasDrift` (`:362-371`, review from file `status` `:442-444`). Test `treats complete-with-drift as complete` `lifecycle-engine.spec.ts:417`.                                                                                                                                                                                                                                                 |
| Machine-readable blockers | **partial**                       | Shape `LifecycleBlocker` `:72-82`. Bypass omit `:798-800`. No `warnings` on domain verdict. Review overlap does not emit `OVERLAP_CONFLICT` `:551-552`. **`workflow.requires` fail code is always `INCOMPLETE_ARTIFACT` even for `drifted-pending-review` / `pending-review`** (`workflow-requires.ts:45-50`), while `artifactBlockers` would emit `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` (`:678-697`). Dual codes possible when checks + review both apply. |
| Available steps / nextHop | **implemented**                   | `validTransitions` from `VALID_TRANSITIONS` `:153`. `availableTransitions` from non-fail checks `:167-176`. `availableSteps` from `schema.workflow()` `:178`. `nextHop` via `resolveLifecycleNextHop` `:805`. Overlap → designing `:813-818`. Archiving incomplete commit → designing `:960-975`.                                                                                                                                                          |
| Application guidance      | **partial**                       | `evaluateLifecycle` `lifecycle-evaluation.ts:19-36`. `resolveLifecycleCommand` `lifecycle-guidance.ts:13`. Overlap command `/specd-design` because `review.required` `:22-24`. **`done` / `signed-off` always return `/specd-verify`** `:70-72` even when `nextHop.targetStep === 'archivable'`.                                                                                                                                                           |
| Archiving escapes         | **implemented**                   | `VALID_TRANSITIONS.archiving` `change-state.ts:42`. Recovery skip in bindings `exceptAlong: ['recovery']`. Verdict skips transitionBlockers for `archiving→archivable` `lifecycle-verdict.ts:220-222`. Test `keeps archiving recovery available` `lifecycle-engine.spec.ts:825-861`.                                                                                                                                                                       |
| Review summary            | **implemented**                   | `deriveReview` `:438-500`. Overlap without `OVERLAP_CONFLICT` blocker. **Overlap reason only if outstanding pending/drift files exist** (`:456-464`); empty `affectedArtifacts` on invalidation would yield `required: false`.                                                                                                                                                                                                                             |
| Shared consumers          | **implemented**                   | `GetStatus` → `evaluateLifecycle` `get-status.ts:481`. `TransitionChange` → `evaluateLifecycle` `transition-change.ts:219`. `ValidateArtifacts` / `GetArtifactInstruction` → `evaluateLifecycleVerdict` + `checksByTarget: {}` `validate-artifacts.ts:220`, `get-artifact-instruction.ts:97`. `CompileContext` has no lifecycle evaluate import.                                                                                                           |
| Next artifact DAG order   | **implemented**                   | `nextArtifact` uses `schema.artifactDag().topologicalOrder()` `:758`.                                                                                                                                                                                                                                                                                                                                                                                      |

### Discrepancies

1. **high | code-wrong | done/signed-off command is `/specd-verify` while `nextHop` is `archivable`**
   - **Evidence:** Spec hop matrix + application guidance: happy path from `done` with `archivable` available → archive (`spec-preview` Application lifecycle guidance / Projections). Code: `resolveLifecycleNextHop` sets `targetStep: 'archivable'` (`lifecycle-verdict.ts:930-936`) but `resolveLifecycleCommand` returns `'/specd-verify'` (`lifecycle-guidance.ts:70-72`). Test **locks this in**: `lifecycle-engine.spec.ts:751-769` expects `targetStep: 'archivable'` **and** `command: '/specd-verify'`.
   - **Option A:** Change `resolveLifecycleCommand` so `done`/`signed-off` with next hop `archivable` (or available `archivable`) maps to `/specd-archive`, and signoff-required stays `specd changes approve signoff`. Update the test.
   - **Option B:** Rewrite lifecycle-engine + transition-checks projection requirements to say the verify skill owns `done` until the user archives (contradicts `/specd-archive` in the same specs).

2. **high | both | `workflow.requires` vs mandatory blocker codes**
   - **Evidence:** Spec: `INCOMPLETE_ARTIFACT` for missing/in-progress; `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` for those states. Check `run()` fails every non-complete/skipped status as `INCOMPLETE_ARTIFACT` with `details.status` (`workflow-requires.ts:33-50`). Live change status for this worktree used `INCOMPLETE_ARTIFACT` with `drifted-pending-review`. Review path still adds `ARTIFACT_DRIFT` (`lifecycle-verdict.ts:528-537`).
   - **Option A:** Map requires failures to the same codes as `artifactBlockers` (drift/review/parent/incomplete).
   - **Option B:** Amend lifecycle-engine mandatory codes: requires-check failures are always `INCOMPLETE_ARTIFACT`; drift/review codes are review-summary only.

3. **medium | spec-wrong | Spec/verify still say `LifecycleEngine` / `LifecycleEngine.evaluate`**
   - **Evidence:** Purpose line 6; Effective status “public contract remains centered on `LifecycleEngine.evaluate`”; verify scenarios “WHEN `LifecycleEngine.evaluate` runs”; Next artifact “LifecycleEngine MUST scan”. Code and the **same spec’s** first requirement forbid the class.
   - **Option A:** Mechanical rename in spec.md/verify.md to `evaluateLifecycleVerdict` / `projectArtifacts`.
   - **Option B:** Restore a class named `LifecycleEngine` (rejected by this change’s explicit requirement).

4. **medium | spec-wrong | `resolveLifecycleCommand(nextHop, context)` signature**
   - **Evidence:** Spec lists two-arg form. Code is `resolveLifecycleCommand(change, nextHop, review, availableTransitions, approvals)` (`lifecycle-guidance.ts:13-18`).
   - **Option A:** Update spec to the real signature.
   - **Option B:** Narrow the function to `(nextHop, context)` wrapping those fields.

5. **medium | both | Domain owns `LifecycleNextAction.command` type**
   - **Evidence:** Spec: domain MUST NOT include command. Type lives in `lifecycle-verdict.ts:105-107` and is re-exported from domain `lifecycle-engine.ts:14`. Application attaches the field in `evaluateLifecycle`.
   - **Option A:** Move `LifecycleNextAction` to application.
   - **Option B:** Spec allows domain DTO for public merge as long as `evaluateLifecycleVerdict` does not populate `command`.

6. **medium | both | Ambient `Logger` vs hexagonal purity**
   - **Evidence:** Architecture: no module-level singletons; domain = stdlib + domain types. Code: `Logger` static impl `observability/logger.ts:28-38`; domain imports it `lifecycle-verdict.ts:13`. Lifecycle spec permits `Logger.debug`.
   - **Option A:** Document Logger as an architecture exception in `default:_global/architecture`.
   - **Option B:** Remove domain logging or inject a domain-safe no-op.

7. **low | spec-wrong | Incomplete restore vs `commitStarted` only**
   - **Evidence:** Spec: latest `archive-failed` with `commitStarted: true` **and** batch restore did not complete. Code treats `commitStarted` + still `archiving` as enough (`lifecycle-verdict.ts:964-974`). No explicit restore-success flag checked.
   - **Option A:** Add restore-incomplete fact to the event and branch on it.
   - **Option B:** Spec: remaining in `archiving` after `commitStarted` **is** incomplete restore.

8. **low | code-wrong | `isStepPermitted` still special-cases pending parking states**
   - **Evidence:** Spec: do not rewrite implementing/archivable to pending gates. Fallback `isStepPermitted` (`lifecycle-verdict.ts:342-354`) still keys off `pending-spec-approval` / `pending-signoff`. Used when `checksByTarget` lacks that step.
   - **Option A:** Permit only via `VALID_TRANSITIONS` + injected protocol checks.
   - **Option B:** Keep drain-state fallback; document it.

### Test Coverage / Missing Tests

**Covered (file:line):** no class (implicit); DAG parent-review `220-241`; spec approval nextAction `244-281`; overlap hop + `/specd-design` `344-382`; overlap bypass `385-415`; complete-with-drift `417+`; archiving escapes `494+`, `522-551`, `825-861`; implementing task gates `554-595`; designing/ready hops `597-641`; impl skippable flags `695-748`; skill hops from done `751-769` (**asserts the command bug**); next-artifact skipped deps `294-318`.

**Missing / weak:**

- Domain `nextHop` has no `command` asserted via `'command' in nextHop` (guidance tests use `evaluateLifecycle` so `nextAction.command` exists).
- `MISSING_ARTIFACT` absence as a dedicated assertion (partially covered by requires using `INCOMPLETE_ARTIFACT`).
- `availableSteps` omits `implementing` when workflow omits the row (verify scenario) — not found as a dedicated test name in `lifecycle-engine.spec.ts`.
- File-level `affectedArtifacts` for a **single** drifted file among two specs (verify “Detailed affected artifacts for drift”).
- `CompileContext` does not call evaluate — no dedicated compile-context test in this file (absence of import is the evidence).
- Restore incomplete vs restore succeeded still in archiving.
- `done` + signoff gate on → `specd changes approve signoff` (approval.spec covered; signoff analogue in this file not confirmed).

### Spec Dependency Chain

- `core:change` — persisted facts, `VALID_TRANSITIONS`, `isArchivable`.
- `core:workflow-model` — `workflow[]` extras, requires, taskCompletion.
- `core:schema-format` — artifact DAG, workflow YAML.
- `default:_global/architecture` — layers (tension on Logger).
- `default:_global/logging` — debug.
- `core:transition-checks` — check ids, along, projections.

### Summary counts: implemented, partial, missing, discrepancies, uncovered reqs

- **implemented:** 8
- **partial:** 3 (blockers codes; application command matrix; domain NextAction type / Logger)
- **missing:** 0
- **discrepancies:** 8
- **uncovered / weakly covered reqs:** ~5 verify scenarios (availableSteps omission, drift affectedArtifacts exactness, domain-only no-command, restore incompleteness, signoff command)

---

## Spec: `core:transition-checks`

### Requirements Summary

Shared evaluation of one transition **or** archive operation: check identity/labels/results; `WorkflowCheck` + `create*`; one file per check; `from`/`to`/`along` (forward/backward/redesign/recovery/any) + `AXIS_FALLBACK` splice; archive is not an edge; binding `phase`/`onFailure`; predicate vs effect; evaluation algorithm; registry bindings (incl. impl not on redesign; approval.spec not on redesign; approval.signoff not on archive); actionable diagnostics; generic progress bus; projections (`validTransitions` / `availableTransitions` / `nextAction`); no snapshot bag; one binding table.

### Implementation Status (per requirement)

| Req                       | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check identity and result | **implemented**                       | `CheckId` union `transition-checks.ts:20-34`. `CHECK_LABELS` gerunds `:42-57`. `CheckResult` `:70-85`. No `archive.publication` in union.                                                                                                                                                                                                                                                     |
| Check ABI / WorkflowCheck | **implemented**                       | Abstract class `workflow-check.ts:17`. Factories `create*` under `application/checks/`. Domain stubs `domain/checks/*` with `run` + stub `execute`.                                                                                                                                                                                                                                           |
| One file per check        | **implemented**                       | 18 modules under `application/checks/` (protocol, requires, taskCompletion, deps, readOnly, impl×2, approvals×2, schema name, archive.archivable, overlap, hooks).                                                                                                                                                                                                                            |
| Applicability along       | **implemented**                       | `classifyAlong` `transition-checks.ts:167-204`. Recovery `archiving→archivable` `:172-173`. Redesign `to===designing` `:175-176`. `buildAxis` splice `:139-157`. `AXIS_FALLBACK` `:107-114`.                                                                                                                                                                                                  |
| Archive is operation      | **implemented**                       | `ARCHIVE_BINDING_SPECS` `check-bindings.ts:84-94`. No `approval.signoff` on archive.                                                                                                                                                                                                                                                                                                          |
| Binding phase / onFailure | **implemented**                       | Hook rows `phase`/`onFailure` `check-bindings.ts:66-77`, `:92-93`. Transition `hook.post` `before-persist`; archive `hook.post` `after-persist`.                                                                                                                                                                                                                                              |
| Predicate vs effect       | **implemented**                       | `kind` on checks. Status uses predicates via `executeMatchingPredicates` / `executeChecksByLegalTargets`.                                                                                                                                                                                                                                                                                     |
| Evaluation of attempt     | **implemented**                       | `TransitionChange` fail-fast `protocol.edge` `transition-change.ts:215`. `GetStatus` collects all legal targets `get-status.ts:457`. No rewrite to pending (gates via `approval.*`).                                                                                                                                                                                                          |
| Registry bindings         | **implemented**                       | `TRANSITION_BINDING_SPECS` `check-bindings.ts:28-78`. impl `from=implementing` `along=forward` `:48-55`. `approval.spec` `from=ready` `along=forward` `:57-59`. `approval.signoff` `from=done` `to=archivable` `:61-64`. `workflow.requires` `exceptAlong: ['recovery']` `:35-38`. Archive runners listed `:84-91`. Application composes **same specs** `workflow-check-registry.ts:109-110`. |
| Actionable diagnostics    | **partial**                           | Compact impl summary required by spec — tests in `lifecycle-engine.spec.ts` for skippable flags. Full `deps.consistent` extracted vs persisted not re-audited line-by-line here; domain check exists `domain/checks/deps-consistent.ts`.                                                                                                                                                      |
| Progress bus              | **not fully re-traced in this batch** | Types/onCheckProgress exist on context (spec). `TransitionChange` wires `onCheckProgress` `transition-change.ts:199-213`. Treat as **implemented** at wiring level; CLI text rendering is `cli:*` (out of this batch).                                                                                                                                                                        |
| Projections               | **partial**                           | Domain projects availability; **commands are application**. Spec still says “LifecycleEngine SHALL project … nextAction” (No shared snapshot bag). `done` nextAction command mismatch (see lifecycle-engine).                                                                                                                                                                                 |
| No snapshot bag           | **implemented**                       | Test `transition-checks.spec.ts:383-387` asserts no `PredicateSnapshots` / `gatherPredicateSnapshots`. Registry comment GetStatus archive only in `archivable` `workflow-check-registry.ts:44-46`.                                                                                                                                                                                            |

### Discrepancies

1. **high | spec-wrong | “LifecycleEngine SHALL project nextAction”**
   - **Evidence:** `core:transition-checks` No shared snapshot bag + Purpose. Implementation split: domain `nextHop`, application `nextAction.command`.
   - **Option A:** Spec: domain projects hop; application attaches command via `evaluateLifecycle`.
   - **Option B:** Put command strings back in domain (violates architecture + lifecycle-engine).

2. **medium | both | Dual materialization `TRANSITION_BINDINGS` vs application registry**
   - **Evidence:** Spec: one binding table; domain must not copy independent `from/to/along` lists. Code: **one** `TRANSITION_BINDING_SPECS`; domain `TRANSITION_BINDINGS` applies domain stub checks (`check-bindings.ts:118-121`); application applies `create*` (`workflow-check-registry.ts:109`). Same rows, two instance tables.
   - **Option A:** Spec: specs are canonical; domain bindings are test fixtures.
   - **Option B:** Delete domain `TRANSITION_BINDINGS`; tests only use specs + matcher.

3. **medium | spec-wrong | GetStatus archive predicates only when `state === 'archivable'`**
   - **Evidence:** Spec: GetStatus runs overlap when `state === 'archivable'` (lifecycle-engine OVERLAP_CONFLICT). Code matches `get-status.ts:465`. Retry archive from **`archiving`** will not show live `OVERLAP_CONFLICT` on status. Archive operation still runs `archive.archivable` which allows `archiving` via `isArchivable`.
   - **Option A:** Also execute archive predicates when `state === 'archiving'`.
   - **Option B:** Spec: status overlap inventory is archivable-only; retry uses ArchiveChange.

4. **low | spec-wrong | verify still says `LifecycleEngine.evaluate` does not fall back to `check.run`**
   - **Evidence:** verify No shared snapshot bag. Function is `evaluateLifecycleVerdict`.

5. **low | both | `hook.pre` along `*` except recovery vs spec “along = \* except recovery”**
   - **Evidence:** Spec hook.pre transition: `to=*, from=*, along=* except recovery`. Code `along: '*'` + `exceptAlong: ['recovery']` `check-bindings.ts:72-76`. Matches intent.

### Test Coverage / Missing Tests

**Covered:** `packages/core/test/domain/services/transition-checks.spec.ts` (along/axis, no snapshot types). `lifecycle-engine.spec.ts` recovery requires skip, impl bypass flags, approval routing. `transition-change.spec.ts` archiving hops. `get-status.spec.ts` evaluateLifecycle / CountTasks.

**Missing / weak for this spec:**

- Dedicated test that `approval.signoff` is absent from archive matching list (verify “Signoff is not an archive predicate”) — not grepped as named scenario in this batch.
- Compact `examples:` text for >3 impl files (verify exists; confirm in impl-files-resolved tests separately if needed).
- Progress bus `check-start`/`check-done` without `Executing:` — likely CLI tests, not core domain.

### Spec Dependency Chain

`core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`.

### Summary counts

- **implemented:** 11
- **partial:** 2 (diagnostics depth; projections/command split)
- **missing:** 0
- **discrepancies:** 5
- **uncovered reqs:** ~3 verify scenarios (archive signoff list, progress bus, impl compact text) not confirmed in assigned files

---

## Spec: `core:change`

### Requirements Summary

Identity, `updatedAt`, workspaces/specIds/`specDependsOn`, **lifecycle** (`VALID_TRANSITIONS`, gates stay in ready/done, skill backward hops, archiving escapes), implementation tracking, approvals, artifacts (canonical states, skipped, parent-review not persistable), sync, history, archive outcome history, draft semantics, **lifecycle interpretation authority** (engine not entity), policy invalidation, per-file drift.

**Constraints of interest:** archive from `archivable` **and** `archiving`; skipped satisfies requires; task-completion “any step that requires an artifact with taskCompletionCheck is automatically gated” (**conflicts with workflow-model `requiresTaskCompletion`**).

### Implementation Status (per requirement)

| Req                                       | Status                                                                             | Evidence                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity / revision / workspaces          | **implemented** (pre-existing; not re-proven line-by-line)                         | Entity `change.ts`.                                                                                                                                                                                                                                                                                                  |
| Lifecycle / VALID_TRANSITIONS             | **implemented**                                                                    | `change-state.ts:30-42`. ready: implementing+designing only. done: archivable, designing, implementing, verifying. archiving: archivable+designing. Tests `change-state.spec.ts`.                                                                                                                                    |
| Skill-aligned backward hops               | **implemented**                                                                    | Table includes done/signed-off/archivable → implementing/verifying. `archivable → done` absent.                                                                                                                                                                                                                      |
| Archiving escapes                         | **implemented**                                                                    | Table + `transition()` uses `isValidTransition` `change.ts:680-684`.                                                                                                                                                                                                                                                 |
| Impl/verification loop                    | **implemented** at entity+checks                                                   | Task gate is `workflow.taskCompletion`, not entity.                                                                                                                                                                                                                                                                  |
| Implementation tracking                   | **implemented** (out of focus; entity methods exist).                              |
| Spec / signoff gates                      | **implemented**                                                                    | Stay in ready/done; checks `approval.spec` / `approval.signoff`. Entity still has drain states in `ChangeState`.                                                                                                                                                                                                     |
| Artifacts                                 | **implemented**                                                                    | Parent-review not persistable (spec). Engine derives it.                                                                                                                                                                                                                                                             |
| Artifact sync / history / archive outcome | **implemented** (pre-existing + archive-failed events used by verdict `:961-963`). |
| Drafting / drafted read-only              | **not deeply audited** this batch.                                                 |
| Lifecycle interpretation authority        | **partial naming**                                                                 | Entity does not compute DAG effective status. Spec still names `LifecycleEngine`. Functions are `evaluateLifecycleVerdict` / `projectArtifacts`.                                                                                                                                                                     |
| Policy invalidation / drift               | **implemented** (entity `invalidate`; canonical vs hasDrift).                      |
| Archive from archivable **and** archiving | **implemented in code, tests incomplete**                                          | `isArchivable` `change.ts:668-671`. `assertArchivable` `:1070-1073`. Tests `change.spec.ts:1075-1085` only assert **archivable**; title “returns true **only** in archivable state”. `assertArchivable` non-archivable list **omits `archiving` and `verifying`** (`:1118-1129`) — does not prove archiving allowed. |

### Discrepancies

1. **high | spec-wrong (internal) | Change constraints vs workflow-model on task gating**
   - **Evidence:** Change constraints: “Task completion gating is enforced generically … any step that requires an artifact with `taskCompletionCheck` is automatically gated”. Workflow-model: gating **only** when `requiresTaskCompletion` is set; artifact flag alone is insufficient.
   - **Option A:** Delete/amend the Change constraint to point at `requiresTaskCompletion`.
   - **Option B:** Change workflow-model to auto-gate (would invert this change’s design).

2. **medium | spec-wrong | verify “Archive from non-archivable state”**
   - **Evidence:** Constraints: both `archivable` and `archiving`. Verify: “WHEN archiving is attempted on a Change not in `archivable` state”. Code allows `archiving`.
   - **Option A:** Verify: throw unless `archivable` **or** `archiving`.
   - **Option B:** Disallow archive from `archiving` in `isArchivable` (would break retry).

3. **medium | spec-wrong | Lifecycle interpretation authority still says `LifecycleEngine`**
   - **Evidence:** spec.md requirement + verify “AND `LifecycleEngine` is responsible”.
   - **Option A:** Name the functions.
   - **Option B:** Keep marketing name “engine” without a class (document alias).

4. **low | code-wrong / tests | `isArchivable` tests contradict production getter**
   - **Evidence:** Production `state === 'archivable' \|\| state === 'archiving'`. Tests never transition to `archiving` for `isArchivable`.
   - **Option A:** Add `archiving` case; fix describe string.
   - **Option B:** If tests intended “only archivable”, production is wrong (conflicts with constraints).

5. **low | spec-wrong | `sanea` typo in artifacts requirement**
   - **Evidence:** preview “Load/save MUST **sanea** (coerce)”.
   - **Option A:** Fix to “sanitize”/“coerce”.
   - **Option B:** Ignore.

### Test Coverage / Missing Tests

**Covered:** `change-state.spec.ts` transitions including archiving escapes and skill hops. `change.spec.ts` identity, artifacts, `isArchivable` (archivable only), `assertArchivable`. `archive-change.spec.ts` archiving mutate. `transition-change.spec.ts` from archiving.

**Missing:** `isArchivable === true` when `state === 'archiving'`. `assertArchivable()` no-throw in `archiving`. Verify scenario update.

### Spec Dependency Chain

`core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`, `core:transition-checks`.

### Summary counts

- **implemented:** 16 (lifecycle-related + core entity; draft/schema-version treated implemented-preexisting without new findings)
- **partial:** 2 (interpretation naming; archive-from-archiving tests)
- **missing:** 0 for required behaviours in code
- **discrepancies:** 5
- **uncovered reqs:** archive-from-archiving entity tests; Change vs workflow-model constraint; several non-lifecycle reqs not re-listed as findings

---

## Spec: `core:workflow-model`

### Requirements Summary

`workflow[]` is lookup extras not protocol membership; unknown `step` rejected at `buildSchema`; step semantics (designing/implementing/verifying/archiving); **requires** as `workflow.requires` with complete\|skipped; **taskCompletion** via `requiresTaskCompletion` + `CountTasks` / `createWorkflowTaskCompletion`; availability from engine projections; workflow order = display + progress axis + AXIS_FALLBACK; step name = state; hooks as effects; two execution modes; requires are artifact IDs.

### Implementation Status (per requirement)

| Req                     | Status                                                          | Evidence                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step names / protocol   | **implemented**                                                 | `VALID_TRANSITIONS` independent of workflow rows. Omitted row → `workflowStep` null (schema). Unknown step: schema validation (schema-format).                                                                 |
| Step semantics          | **implemented** as documentation + routing in verdict/use cases | Drift → designing via review. Verification outcomes are skill/use-case, not a single function named in this file.                                                                                              |
| Requires-based gating   | **implemented**                                                 | `workflow.requires` `complete`/`skipped` `workflow-requires.ts:35`. Shared by GetStatus/TransitionChange via same check.                                                                                       |
| Task completion gating  | **implemented**                                                 | `createWorkflowTaskCompletion`; bindings `to=*`. Engine does not walk task files (`lifecycle-verdict` has no artifact content I/O).                                                                            |
| Step availability       | **partial naming**                                              | Projections from `evaluateLifecycleVerdict`, not `LifecycleEngine.evaluate`. `CompileContext` does not evaluate hops (no import). `isReady` may DAG-walk when checks missing (`lifecycle-verdict.ts:181-194`). |
| Workflow order / axis   | **implemented**                                                 | `classifyAlong` + `buildAxis`. `to=designing` → redesign. `archiving→archivable` → recovery.                                                                                                                   |
| Step-to-state mapping   | **implemented**                                                 | `TransitionChange` uses step name as `ChangeState`.                                                                                                                                                            |
| Hooks / two modes       | **implemented** at binding/use-case level                       | See transition-checks.                                                                                                                                                                                         |
| Requires = artifact IDs | **implemented**                                                 | Schema `requires` arrays; DAG cycle at build.                                                                                                                                                                  |

### Discrepancies

1. **medium | spec-wrong | Remaining `LifecycleEngine` / `LifecycleEngine.evaluate` / “engine walking files”**
   - **Evidence:** Step availability, constraints, verify “LifecycleEngine does not read the tasks file”, “CompileContext MUST NOT call LifecycleEngine.evaluate”.
   - **Option A:** Rename to `evaluateLifecycleVerdict` / `projectArtifacts`.
   - **Option B:** Keep informal “engine”.

2. **medium | spec-wrong | Availability scenario “reads persisted artifact state”**
   - **Evidence:** verify Step availability: persisted `complete` → available. Production requires **effective** status (parent-review can block a persisted-complete artifact). Requires-based scenarios correctly use pending-review / drift.
   - **Option A:** Availability scenarios use effective status.
   - **Option B:** Code should ignore parent-review for requires (would violate lifecycle-engine mapping).

3. **low | both | `isReady` DAG re-walk when checks absent**
   - **Evidence:** Spec: MUST project from `workflow.requires` when present; DAG allowed when `checksByTarget` empty. Code: `requiresFailed` from checks **or** `blockingArtifacts.length` (`lifecycle-verdict.ts:188-194`). Also fills `blockingArtifacts` from DAG even when checks exist (field, not second code).
   - **Option A:** Spec: `blockingArtifacts` may still list DAG ids.
   - **Option B:** Populate `blockingArtifacts` only from check details.

### Test Coverage / Missing Tests

Covered indirectly via lifecycle-engine + transition-checks + schema build tests. Missing dedicated workflow-model-named tests for “CompileContext MUST NOT report stepAvailable” (schema-format verify) — CompileContext has no such field (good). Unknown step `reviewing` covered at schema build (schema-format).

### Spec Dependency Chain

`core:change`, `core:schema-format`, `core:build-schema`, `core:compile-context`, `core:get-status`, `core:transition-change`, `core:archive-change`, `core:hook-execution-model`.

### Summary counts

- **implemented:** 8
- **partial:** 1 (naming + isReady extra walk)
- **missing:** 0
- **discrepancies:** 3
- **uncovered reqs:** 2 verify wording gaps (persisted vs effective; LifecycleEngine name)

---

## Spec: `core:schema-format`

### Requirements Summary

Full schema YAML contract (kind, extends, array ids, artifacts, DAG API, validations, workflow extras, plugins, resolve, etc.). **This change’s relevant slice:** `artifacts[].requires` feeds `projectArtifacts` / `artifactDag()`; no `Change.effectiveStatus()`; `workflow[]` lookup + complete\|skipped requires; omitted step ≠ deleted protocol state; unknown step rejected at build; consumers must use `schema.artifactDag()`.

### Implementation Status (per requirement)

| Req                                                                 | Status                                                                    | Evidence                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Schema file structure / kind / extends / array identity             | **implemented** (pre-existing; not re-audited every YAML rule).           |
| Artifact definition + requires cascade                              | **implemented**                                                           | Matches `effectiveStatus` cascade (`lifecycle-verdict.ts:379-407`). Naming still `LifecycleEngine.projectArtifacts` in spec.             |
| Schema artifact DAG API                                             | **implemented**                                                           | `schema.ts:98-103` lazy-cached `ArtifactDag`. Methods in `artifact-dag.ts` (`roots`, `childrenOf`, `topologicalOrder`, `descendantsOf`). |
| Canonical DAG derivation                                            | **implemented** for next-artifact                                         | `nextArtifact` uses `artifactDag().topologicalOrder()` only. `artifactDagFromChangeArtifacts` exists for tests (`artifact-dag.ts:168`).  |
| Workflow extras                                                     | **implemented**                                                           | Preview: requires complete\|skipped; AXIS_FALLBACK via transition-checks; unknown step SchemaValidationError.                            |
| verify.md format / other schema features                            | **implemented** (out of lifecycle focus).                                 |
| Explicit external hooks / plugins / resolution / validation on load | **not re-proven** this batch; no contradiction found with lifecycle code. |

### Discrepancies

1. **medium | spec-wrong | `LifecycleEngine` / `LifecycleEngine.projectArtifacts` in artifact requires + constraints**
   - **Evidence:** Artifact definition requires bullet; constraints “Artifact `requires` feeds `LifecycleEngine` DAG…”. Verify Workflow still says `GetStatus` / `LifecycleEngine`.
   - **Option A:** `projectArtifacts` / `evaluateLifecycleVerdict`.
   - **Option B:** Informal engine name.

2. **low | spec-wrong | Workflow verify “not `complete`” vs skipped**
   - **Evidence:** Scenario: requires artifact that is not `complete` → blocked. Spec.md: complete **or skipped**. A skipped optional should **not** block.
   - **Option A:** “not `complete` or `skipped`”.
   - **Option B:** Leave scenario as incomplete-status only.

3. **low | spec-wrong | CompileContext `stepAvailable`**
   - **Evidence:** verify “CompileContext MUST NOT report `stepAvailable`”. CompileContext has no such API (good). Spec invents a field name.
   - **Option A:** “MUST NOT compute hop availability”.
   - **Option B:** N/A.

### Test Coverage / Missing Tests

DAG/next-artifact: `lifecycle-engine.spec.ts` skipped-deps next artifact. Schema workflow omitted/unknown: schema-format verify — rely on existing `build-schema` / registry tests (not opened exhaustively). **Uncovered in this batch:** full schema-format suite vs every validation rule.

### Spec Dependency Chain

`core:delta-format`, `core:selector-model`, `core:content-extraction`, `core:schema-merge`. (Change-preview `specDependsOn` for schema-format has no `core:lifecycle-engine`; lifecycle-engine depends **on** schema-format.)

### Summary counts

- **implemented:** 6 (lifecycle-touching) + remainder assumed implemented-preexisting
- **partial:** 0 for lifecycle slice (naming only)
- **missing:** 0 for DAG/workflow extras
- **discrepancies:** 3 (all spec naming/verify wording)
- **uncovered reqs:** majority of non-workflow schema-format requirements not line-audited (~15); **not counted as missing implementation**

---

## Batch rollup (assigned five specs)

| Spec                                 | impl | partial | missing | discrepancies |                uncovered/weak |
| ------------------------------------ | ---: | ------: | ------: | ------------: | ----------------------------: |
| core:lifecycle-engine                |    8 |       3 |       0 |             8 |                            ~5 |
| core:transition-checks               |   11 |       2 |       0 |             5 |                            ~3 |
| core:change                          |   16 |       2 |       0 |             5 |                            ~3 |
| core:workflow-model                  |    8 |       1 |       0 |             3 |                            ~2 |
| core:schema-format (lifecycle slice) |    6 |       0 |       0 |             3 | many non-slice reqs unaudited |

**Highest-priority code issue:** `lifecycle-guidance.ts` maps `done`/`signed-off` → `/specd-verify` while domain `nextHop.targetStep` is `archivable`; tests currently require that pair.

**Highest-priority spec issue:** Widespread leftover `LifecycleEngine` / `.evaluate` after the class was removed; Change constraint auto-gates tasks vs `requiresTaskCompletion`.

**Highest-priority consistency issue:** `workflow.requires` always emits `INCOMPLETE_ARTIFACT` (including drift/review statuses) vs lifecycle-engine’s distinct blocker codes.

---

## Partial file: `_partial-use-cases.md`

# Spec-compliance partial: use cases (`workflow-transition-checks`)

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`
- **Source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Research:** graph search (`evaluateLifecycle`, `evaluateLifecycleVerdict`, `GetStatus`, `TransitionChange`, `resolveGetStatusDeps`, `createEvaluateLifecycle`) then working-tree reads. `graph stats`: `stale: false`, `contentFresh: true` at index `2948f1a2`. `graph impact --file` with `core:src/application/use-cases/*.ts` returned `no indexed file matches` (path form); implementations were confirmed by `graph search` locations + file reads. Treat graph as possibly lagging uncommitted tree; this audit used the working tree.

---

## Focus checklist (assigned)

| Focus                                                                                                               | Verdict                      | Evidence                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GetStatus / TransitionChange import `evaluateLifecycle` as module functions; no ctor lifecycle field                | **Pass (code)**              | `get-status.ts` import `evaluateLifecycle` from `../services/lifecycle-evaluation.js`; ctor fields: `_changes`, `_schemaProvider`, `_approvals`, `_refresh`, `_transitionBindings`, `_archiveBindings`. `transition-change.ts` same import; ctor has no lifecycle field. Graph: `createEvaluateLifecycle` **0 symbols**. |
| DAG consumers ValidateArtifacts / GetArtifactInstruction use `evaluateLifecycleVerdict` with empty `checksByTarget` | **Pass (code)**              | `validate-artifacts.ts` `:220–222` `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })`. `get-artifact-instruction.ts` `:97–99` same. Tests spy `checksByTarget: {}`.                                                                                                                                      |
| Factories MUST NOT inject `LifecycleEngine`                                                                         | **Pass (production wiring)** | `resolveGetStatusDeps`, `resolveTransitionChangeDeps`, `resolveValidateArtifactsDeps`, `resolveGetArtifactInstructionDeps` return ports/bindings only. No `lifecycle` key. Composition package has no `LifecycleEngine` / `createEvaluateLifecycle`.                                                                     |
| GetStatus schema catch: only `SchemaNotFoundError` degrades; other errors propagate                                 | **Pass (code + test)**       | Active and drafted paths: `if (!(err instanceof SchemaNotFoundError)) throw err`. Test `rethrows unexpected schema provider errors` (`disk exploded`). `schema: null` helper throws `SchemaNotFoundError` and degrades.                                                                                                  |
| Drafted status: `nextAction.command` null; empty `availableTransitions`                                             | **Pass (code)**              | `_buildDraftedResult`: `availableTransitions: []`, `nextAction.command: null`. Core test asserts empty transitions, **not** `command === null`. CLI `status.spec.ts` asserts `parsed.nextAction.command` is `null`.                                                                                                      |
| `to: 'next'` happy-path in Core, not CLI routing table                                                              | **Pass (code)**              | `TransitionChange.execute` maps `input.to === 'next'` via `HAPPY_PATH_NEXT[fromState]` / `HappyPathNextUnavailableError`. CLI `transition.ts` passes `to: 'next'` into `kernel.changes.transition.execute`. `validateRequestedTarget` only checks mutual exclusion / valid state names — no happy-path table.            |
| No `createEvaluateLifecycle()`                                                                                      | **Pass**                     | Graph search empty; grep of `packages/` source empty (hits only in a prior report).                                                                                                                                                                                                                                      |

---

## `core:get-status`

### Requirements Summary

| ID    | Requirement                                        | Spec intent (preview)                                                                                                                                                                        |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GS-01 | Accepts a change name as input                     | `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                          |
| GS-02 | Returns the change and its artifact statuses       | Active `change` vs `draftView`; no `getDiscarded`; drafted: empty transitions; no mutate commands                                                                                            |
| GS-03 | Revision evaluation                                | `ifModifiedSince` 304-style short-circuit                                                                                                                                                    |
| GS-04 | Drafted change read-only status                    | DAG via `projectArtifacts` / empty checks; empty `availableTransitions`; `nextAction.command` must not recommend transition/validate                                                         |
| GS-05 | Implementation status projection                   | Tracked files + links                                                                                                                                                                        |
| GS-06 | Optional pre-read refresh                          | Default true for **active** only; skip on 304, draft, or `false`                                                                                                                             |
| GS-07 | Drift-aware display status                         | File/artifact `displayStatus`                                                                                                                                                                |
| GS-08 | Task completion counts                             | From `workflow.taskCompletion` details; no second `CountTasks`; no global snapshot bag                                                                                                       |
| GS-09 | Execute matching predicates then project           | `executeChecksByLegalTargets`; archive predicates when `archivable`; `evaluateLifecycle` for `nextAction.command`                                                                            |
| GS-10 | Throws `ChangeNotFoundError`                       | Unknown name                                                                                                                                                                                 |
| GS-11 | Constructor dependencies                           | Repos, schema, approvals, refresh, `transitionBindings`, `archiveBindings`. **MUST NOT** ctor-inject `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`. **Import** `evaluateLifecycle`. |
| GS-12 | Config factory preserves bootstrap                 | Same status path as canonical                                                                                                                                                                |
| GS-13 | Reports effective status for every schema artifact | Full path: one entry per `schema.artifacts()`                                                                                                                                                |
| GS-14 | Returns lifecycle context                          | Review priority, overlap scan, check-derived `availableTransitions` / `availableSteps`                                                                                                       |
| GS-15 | Identifies blockers                                | Check codes, overlap rules, archive `OVERLAP_CONFLICT`                                                                                                                                       |
| GS-16 | Graceful degradation when schema resolution fails  | **Constraints:** only `SchemaNotFoundError` degrades; other `SchemaProvider.get()` errors propagate                                                                                          |
| GS-17 | `createGetStatus` via `resolveGetStatusDeps`       | No `lifecycle` / `LifecycleEngine` / `evaluateLifecycle` on deps                                                                                                                             |

### Implementation Status

| ID    | Status                               | Notes                                                                                                                         |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| GS-01 | **implemented**                      | `GetStatusInput` matches.                                                                                                     |
| GS-02 | **implemented**                      | `get` then `getDraft`; no `getDiscarded` in this class.                                                                       |
| GS-03 | **implemented**                      | `_buildUnchangedResult`.                                                                                                      |
| GS-04 | **implemented**                      | `projectArtifacts` (not hop `evaluateLifecycle`); empty transitions; `command: null`.                                         |
| GS-05 | **implemented**                      | `projectImplementationTracking`; drafts return empty tracking.                                                                |
| GS-06 | **implemented**                      | Refresh after 304 check; skip drafts.                                                                                         |
| GS-07 | **implemented**                      | `displayStatus()` + `aggregateDisplayStatus`.                                                                                 |
| GS-08 | **implemented**                      | `taskCompletionFromChecks` after `executeChecksByLegalTargets`.                                                               |
| GS-09 | **implemented**                      | Then `evaluateLifecycle(change, schema, { approvals, checksByTarget: checksByTargetMap })`.                                   |
| GS-10 | **implemented**                      |                                                                                                                               |
| GS-11 | **implemented (code)**               | Matches spec.md constructor. Spec.md still _names_ `LifecycleEngine` as the projector in other paragraphs.                    |
| GS-12 | **implemented**                      | Config form: `createCompositionResolver` → `resolveGetStatusDeps` → canonical `createGetStatus(deps)`.                        |
| GS-13 | **implemented**                      | Schema loop; 304 empty array; schema-miss uses persisted `change.artifacts` only.                                             |
| GS-14 | **implemented**                      | `_projectReview`, overlap helpers.                                                                                            |
| GS-15 | **implemented**                      | `_mergeBlockers`, `_nextActionAfterArchiveOverlap`.                                                                           |
| GS-16 | **implemented (code = Constraints)** | Requirement body says “if `get()` throws” without qualifying `SchemaNotFoundError`; Constraints + verify + code are narrower. |
| GS-17 | **implemented**                      | `GetStatusDeps` has no lifecycle field.                                                                                       |

### Discrepancies

1. **LifecycleEngine leftover wording in spec.md / verify.md vs module-function constructor**
   - **Kind:** `spec-wrong`
   - **Severity:** medium (docs/verify vs code; constructor section already correct)
   - **Spec:** GS-09/GS-13/GS-14/GS-15 and Purpose still say “LifecycleEngine MUST project / derive / MAY obtain from LifecycleEngine”; drafted GS-04 cites `LifecycleEngine.evaluate`; verify “uses LifecycleEngine to derive…”.
   - **Code:** I/O-free projection is `evaluateLifecycle` → `evaluateLifecycleVerdict` + `resolveLifecycleNextAction`. No `class LifecycleEngine` in `packages/core`.
   - **Why spec may be wrong:** Constructor + factory requirements already forbid injecting an engine; leftover class name from the pre-function design.
   - **Why code may be wrong:** Only if the product still intended a ctor-injected engine — contradicted by GS-11/GS-17 and `core:transition-checks` “no engine class”. **CODE WINS** for wiring.

2. **Graceful-degradation requirement body vs Constraints**
   - **Kind:** `spec-wrong` (internal)
   - **Severity:** low
   - **Spec:** Requirement GS-16: any throw from `SchemaProvider.get()` degrades silently. Constraints + verify scenario: only `SchemaNotFoundError`.
   - **Code:** instanceof `SchemaNotFoundError` only.
   - **CODE WINS** vs the unqualified requirement sentence.

3. **Drafted schema miss vs `schemaInfo: null`**
   - **Kind:** `both` (underspecified)
   - **Severity:** low
   - **Code:** drafted catch still fills `schemaInfo` from `draftView.schemaName` / version, `artifacts: []`. Active catch sets `schemaInfo: null`.
   - **Spec:** GS-16 `schemaInfo MUST be null` is not scoped to active-only.

4. **Composition tests still put `lifecycle` on `GetStatusDeps` literals**
   - **Kind:** `code-wrong` (tests)
   - **Severity:** low
   - **Evidence:** `packages/core/test/composition/use-cases/get-status.spec.ts` includes `lifecycle: {} as never` while `GetStatusDeps` has no such field. Runtime ignores the extra key. Spec: MUST NOT resolve `lifecycle`. Tests do not assert absence.

### Test Coverage

| Area                                                                                                                      | Coverage                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Not found / discarded                                                                                                     | Present (`ChangeNotFoundError`)                                                                                 |
| Refresh default / skip / draft                                                                                            | Present                                                                                                         |
| Schema miss degrade + rethrow other errors                                                                                | Present (`schema issues`)                                                                                       |
| Drafted empty `availableTransitions` / `availableSteps`; DAG `pending-parent-artifact-review` without `evaluateLifecycle` | Present                                                                                                         |
| Task completion / no second CountTasks / `evaluateLifecycle` spy                                                          | Present                                                                                                         |
| Archive overlap `nextAction`                                                                                              | Present                                                                                                         |
| 304 / `ifModifiedSince`                                                                                                   | Present (file has revision tests)                                                                               |
| Constructor “without LifecycleEngine”                                                                                     | **Not a dedicated ctor-shape test**; `makeGetStatus` simply does not pass one                                   |
| Drafted `nextAction.command === null`                                                                                     | **Missing in core** `get-status.spec.ts`; **present in CLI** `packages/cli/test/commands/change/status.spec.ts` |
| `resolveGetStatusDeps` does not resolve lifecycle                                                                         | **Missing** (only overlap `includeOverlapDetection` source string test)                                         |

### Missing Tests

- Core: drafted `nextAction.command` is `null` (and is not a transition/validate command).
- Core: `GetStatus` constructor / `GetStatusDeps` keys exclude `lifecycle` / `evaluateLifecycle`.
- Core: `resolveGetStatusDeps` return object `not.toHaveProperty('lifecycle')` (pattern exists for `compile-context`).
- Verify leftover “uses LifecycleEngine” should be rewritten to `evaluateLifecycle` so tests can be named against the real API.

### Spec Dependency Chain

- Direct (preview): `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- Drafted view: `core:drafted-change-view` (linked from GS-04).
- Consistency: GS-11/GS-17 align with `core:transition-checks` function-based evaluation. Remaining `LifecycleEngine` nouns in GetStatus spec.md conflict with those same sections.

---

## `core:transition-change`

### Requirements Summary

| ID          | Requirement                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01       | Input contract (`to: ChangeState \| 'next'`, skip hooks, refresh, `allowOutOfScope`; no per-call approval flags)                      |
| TC-02       | Approval gates baked at construction                                                                                                  |
| TC-03       | Change must exist                                                                                                                     |
| TC-04       | Optional pre-transition refresh                                                                                                       |
| TC-05–TC-08 | Approval as checks not pending hops; pending drain; direct persist when gates inactive                                                |
| TC-09       | Workflow requires via matching predicates / `evaluateLifecycle` projection                                                            |
| TC-10       | Task completion via `workflow.taskCompletion`                                                                                         |
| TC-11       | `verifying → implementing` does not clear validated artifacts                                                                         |
| TC-12       | Skill-aligned backward hop (signoff invalidate; no mass artifact downgrade)                                                           |
| TC-13       | Transition to designing / invalidate rules                                                                                            |
| TC-14       | `archiving → archivable` recovery                                                                                                     |
| TC-15–TC-16 | Pre/post hook effects via bindings, not `RunStepHooks` as UC port                                                                     |
| TC-17       | Delegate to `change.transition` (except invalidate-is-the-hop)                                                                        |
| TC-18       | `transitioned` progress                                                                                                               |
| TC-19       | Persistence via `mutate`                                                                                                              |
| TC-20       | Result `{ change }`                                                                                                                   |
| TC-21       | Progress callback                                                                                                                     |
| TC-22       | Dependencies: no ctor `LifecycleEngine` / `RunStepHooks` / `CountTasks`; import `evaluateLifecycle`                                   |
| TC-23       | **`to: 'next'` is Core happy-path (`HAPPY_PATH_NEXT`), not `GetStatus.nextAction.targetStep`; typed `HappyPathNextUnavailableError`** |
| TC-24       | Shared runner errors propagate                                                                                                        |
| TC-25       | `resolveTransitionChangeDeps` without lifecycle / `runStepHooks` on UC                                                                |

### Implementation Status

| ID          | Status                 | Notes                                                                                                                                  |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01–TC-08 | **implemented**        | `ApprovalGates` on ctor; `TransitionChangeInput` has no gate flags.                                                                    |
| TC-09       | **implemented**        | `executeMatchingPredicates` + `evaluateLifecycle(..., { requestedTarget, checksByTarget: { [requestedTarget]: evaluation.checks } })`. |
| TC-10       | **implemented**        | Fail mapping + `task-completion-failed` progress (see `_mapFailedPredicate` / `_emitFailureProgress`).                                 |
| TC-11–TC-14 | **implemented**        | Mutate callback: designing invalidate; signoff invalidate on skill hops; `transition` otherwise.                                       |
| TC-15–TC-16 | **implemented**        | `matchingEffects` + `executeCheckWithProgress`; skip selectors.                                                                        |
| TC-17–TC-21 | **implemented**        |                                                                                                                                        |
| TC-22       | **implemented (code)** | Module import; ctor: changes, actor, schemaProvider, refresh, approvals, transitionBindings.                                           |
| TC-23       | **implemented**        | `HAPPY_PATH_NEXT` in `change-state.ts`; CLI does not resolve hops.                                                                     |
| TC-24       | **implemented**        | Typed errors imported; mapping throws those types.                                                                                     |
| TC-25       | **implemented**        | `resolveTransitionChangeDeps` uses `resolveWorkflowCheckRegistry` without overlap flag (unlike GetStatus).                             |

### Discrepancies

1. **Purpose / Constraints / several verify scenarios still name `LifecycleEngine`**
   - **Kind:** `spec-wrong`
   - **Severity:** medium
   - **Spec:** Purpose “delegating … to LifecycleEngine”; Constraints “interpretation is centralized through LifecycleEngine”; verify GIVEN “LifecycleEngine reports…”.
   - **Code:** `evaluateLifecycle` module function; no ctor engine. TC-22/TC-25 already forbid ctor injection.
   - **CODE WINS** for composition.

2. **Composition tests still include `lifecycle: {} as never` on `TransitionChangeDeps`**
   - **Kind:** `code-wrong` (tests)
   - **Severity:** low
   - Same pattern as GetStatus factory tests.

### Test Coverage

| Area                                                                                 | Coverage                                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `to: 'next'` implementing → verifying                                                | Present                                                        |
| `to: 'next'` rejected: archivable, pending-spec-approval, pending-signoff, archiving | Present (`HappyPathNextUnavailableError`)                      |
| Schema miss throws (does not skip checks)                                            | Present                                                        |
| Approval / requires / tasks / hooks / mutate                                         | Broad file `transition-change.spec.ts`                         |
| Domain `HAPPY_PATH_NEXT` map                                                         | `change-state.spec.ts`                                         |
| CLI passes `to: 'next'` through                                                      | `packages/cli/test/commands/change/transition.spec.ts`         |
| Ctor / deps exclude `LifecycleEngine`                                                | Verify scenario exists; no explicit “property names” assertion |
| `resolveTransitionChangeDeps` has no lifecycle                                       | **Missing**                                                    |

### Missing Tests

- `resolveTransitionChangeDeps` / `TransitionChangeDeps` `not.toHaveProperty('lifecycle')`.
- CLI negative: CLI must not map `--next` to a concrete `ChangeState` before calling Core (today implied by `to: 'next'` expectation).

### Spec Dependency Chain

- Direct: `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- TC-23 explicitly **not** `GetStatus.nextAction` — matches `HAPPY_PATH_NEXT` comment in `change-state.ts`.

---

## `core:validate-artifacts`

### Requirements Summary

Focus-relevant plus constructor/factory/DAG (full spec also covers delta, cross-artifact, metadata, persist, etc.).

| ID              | Requirement                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VA-ctor         | Ports: changes, listWorkspaces, schemaProvider, parsers, actor, hasher, extractorTransforms, workspaceRoutes. DAG via **imported** `evaluateLifecycleVerdict`, not ctor engine. |
| VA-input        | Optional `specPath` for `scope: change`                                                                                                                                         |
| VA-schema-guard | `SchemaMismatchError`                                                                                                                                                           |
| VA-required     | Missing required artifacts → result failure, not throw                                                                                                                          |
| VA-deps         | Dependency order via verdict; one `evaluateLifecycleVerdict` per execute; `markVerdictComplete` in-memory                                                                       |
| VA-topo         | `artifactDag().topologicalOrder()` when no single filter                                                                                                                        |
| VA-factory      | `resolveValidateArtifactsDeps`; MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                                                |
| VA-DAG          | Empty `checksByTarget`; no hop predicates; no `gatherPredicateSnapshots`                                                                                                        |
| VA-exists       | `ChangeNotFoundError` if `get` null                                                                                                                                             |

(Other requirements: complete/skip bypass, approval hash scan, per-file/delta/structural/cross-artifact/metadata/hash/result/save/dependsOn — audited as **implemented in the same class**; not re-listed line-by-line here unless they conflict with DAG/engine focus.)

### Implementation Status

| Area                                                    | Status                             | Notes                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Constructor                                             | **implemented**                    | Optional defaults `extractorTransforms = new Map()`, `workspaceRoutes = []` (not in spec signature).                                     |
| `evaluateLifecycleVerdict(..., { checksByTarget: {} })` | **implemented**                    | Once at execute start.                                                                                                                   |
| `markVerdictComplete`                                   | **implemented**                    | In-memory patch of `artifactVerdicts`.                                                                                                   |
| Topological order                                       | **implemented**                    | When `artifactId` omitted.                                                                                                               |
| Factory                                                 | **implemented**                    | No lifecycle in `ValidateArtifactsDeps`.                                                                                                 |
| Schema miss                                             | **throws** (not GetStatus degrade) | Matches “schema cannot be resolved” as error for this UC. Tests: `throws SchemaNotFoundError`.                                           |
| Hop predicates / snapshot gather                        | **absent**                         | No `executeChecksByLegalTargets` in this file; `gatherPredicateSnapshots` not in source (asserted false in `transition-checks.spec.ts`). |

### Discrepancies

1. **verify.md still requires constructor `LifecycleEngine`**
   - **Kind:** `spec-wrong` (verify vs spec.md **and** vs code)
   - **Severity:** **high** for a literal verify audit
   - **verify:** “ValidateArtifacts is constructed with LifecycleEngine” / “constructor receives a LifecycleEngine dependency”.
   - **spec.md Ports and constructor + VA-factory:** no engine; `evaluateLifecycleVerdict` module function; factory MUST NOT resolve lifecycle.
   - **Code:** no engine ctor arg.
   - **CODE + spec.md WIN**; verify.md is stale and **contradicts** the change’s own spec.md.

2. **Optional ctor defaults not in spec type snippet**
   - **Kind:** `spec-wrong` (minor) or acceptable implementation convenience
   - **Severity:** low
   - Spec shows eight required constructor params; code defaults last two.

### Test Coverage

| Area                                                     | Coverage                                                  |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Empty `checksByTarget`                                   | Present (`evaluates lifecycle with empty checksByTarget`) |
| Dependency-blocked failures                              | Present (`Dependency order check`)                        |
| Schema mismatch / not found / unknown artifact           | Present                                                   |
| Factory `resolveValidateArtifactsDeps` without lifecycle | **No dedicated composition test file** for this UC        |
| “Constructed without LifecycleEngine”                    | **Missing**; verify still says **with**                   |

### Missing Tests

- Composition: `resolveValidateArtifactsDeps` has no `lifecycle`.
- Constructor arity / property names exclude engine (to lock verify.md once it is flipped).
- Explicit “does not call `executeChecksByLegalTargets` / hop predicates” (currently implied by empty `checksByTarget` spy).

### Spec Dependency Chain

- Direct: `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, `core:spec-id-format`, `core:schema-format`, plus composition-resolver (factory).
- DAG requirement points at `core:lifecycle-engine` `projectArtifacts` / topological order.
- **Internal spec vs verify contradiction** on `LifecycleEngine` ctor is the main dependency-chain defect.

---

## `core:get-artifact-instruction`

### Requirements Summary

| ID               | Requirement                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GAI-ctor         | changes, specs map, schemaProvider, parsers, expander; auto-select via `evaluateLifecycleVerdict` empty checks; **no** `LifecycleEngine` ctor |
| GAI-input        | `name`; optional `artifactId`; omit → `nextArtifact`; all complete/skipped → `ArtifactNotFoundError`                                          |
| GAI-lookup       | `ChangeNotFoundError`                                                                                                                         |
| GAI-schema-guard | `SchemaMismatchError`                                                                                                                         |
| GAI-artifact     | `ArtifactNotFoundError`                                                                                                                       |
| GAI-instruction  | rules / instruction / template / delta / outlines                                                                                             |
| GAI-result       | Result shape                                                                                                                                  |
| GAI-factory      | `resolveGetArtifactInstructionDeps`; MUST NOT resolve lifecycle                                                                               |
| GAI-DAG          | `evaluateLifecycleVerdict` empty `checksByTarget`; no hop predicates; no snapshot bag                                                         |

### Implementation Status

| ID                            | Status          | Notes                                                                                                                              |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GAI-ctor                      | **implemented** | Five ctor args; import `evaluateLifecycleVerdict`.                                                                                 |
| GAI-input                     | **implemented** | `resolvedId = input.artifactId ?? lifecycle.nextArtifact`; null → `ArtifactNotFoundError('(auto)', ...)`.                          |
| GAI-lookup / guard / artifact | **implemented** |                                                                                                                                    |
| GAI-instruction / result      | **implemented** | Template vars `{ change: { name, path } }` only.                                                                                   |
| GAI-factory                   | **implemented** |                                                                                                                                    |
| GAI-DAG                       | **implemented** | Always evaluates verdict (including when `artifactId` is explicit) with `{}` checks — extra DAG call, still empty checks, no hops. |

### Discrepancies

1. **verify.md Input scenarios still name `LifecycleEngine.nextArtifact` / `LifecycleEngine.evaluate`**
   - **Kind:** `spec-wrong`
   - **Severity:** low–medium
   - **spec.md** already says `evaluateLifecycleVerdict` / empty `checksByTarget`.
   - **verify** “Omitted artifactId uses engine-derived readiness” still GIVEN `LifecycleEngine.nextArtifact`.
   - **Code** uses `lifecycle.nextArtifact` from `evaluateLifecycleVerdict`.
   - **CODE + spec.md WIN**.

2. **Always calling `evaluateLifecycleVerdict` even when `artifactId` is set**
   - **Kind:** none (compliant) or tiny over-work
   - Spec: MUST use verdict when resolving next **or** required readiness. Calling it always with empty checks is allowed; it does not run hop predicates.

### Test Coverage

| Area                                              | Coverage                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `evaluateLifecycleVerdict` + `checksByTarget: {}` | Present (on a path **with** explicit `artifactId`)                          |
| Change / schema / artifact errors                 | Present                                                                     |
| Template expansion / no workspace key             | Present                                                                     |
| Omitted `artifactId` → `nextArtifact`             | Should be in file; spy currently on explicit-id template test               |
| Constructor without engine                        | **No dedicated test** (verify scenario exists as “without LifecycleEngine”) |
| Factory deps                                      | **No composition test file**                                                |

### Missing Tests

- Omitted `artifactId` asserts spy `nextArtifact` / returned `artifactId`.
- `resolveGetArtifactInstructionDeps` has no `lifecycle`.
- All-artifacts-complete auto-id throws `ArtifactNotFoundError`.

### Spec Dependency Chain

- Direct: `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks` (no `gatherPredicateSnapshots`).
- Aligns with ValidateArtifacts DAG path (empty checks, no GetStatus hop collection).

---

## Factories (all four)

| Helper                              | Resolves                                                                                                           | Injects `LifecycleEngine`? |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `resolveGetStatusDeps`              | changes, schemaProvider, approvals, refresh, transitionBindings, archiveBindings (`includeOverlapDetection: true`) | **No**                     |
| `resolveTransitionChangeDeps`       | changes, actor, schemaProvider, refresh, approvals, transitionBindings                                             | **No**                     |
| `resolveValidateArtifactsDeps`      | changes, listWorkspaces, schemaProvider, parsers, actor, contentHasher, extractorTransforms, workspaceRoutes       | **No**                     |
| `resolveGetArtifactInstructionDeps` | changes, specs, schemaProvider, parsers, templateExpander                                                          | **No**                     |

Config overloads all: `createCompositionResolver` → `resolve*Deps` → canonical `create*(deps)`. No inline fs wiring in these four files.

Stale tests: GetStatus and TransitionChange composition specs still **author** a `lifecycle` field on deps objects.

---

## Spec Dependency Chain (batch)

```
core:transition-checks ──► GetStatus (hop predicates + evaluateLifecycle)
                       ──► TransitionChange (fail-fast protocol.edge + evaluateLifecycle)
                       ──► ValidateArtifacts / GetArtifactInstruction (DAG only: empty checksByTarget)

core:lifecycle-engine ──► evaluateLifecycleVerdict / projectArtifacts (all four conceptually)
                      ──► evaluateLifecycle (GetStatus, TransitionChange) = verdict + guidance

core:composition-resolver ──► all four factories

core:count-tasks ──► inside workflow.taskCompletion (GetStatus / TransitionChange), not UC ctor
```

Contradiction to resolve in the change artifacts: **verify.md ValidateArtifacts “constructed with LifecycleEngine”** vs **spec.md + all four factories + working tree**.

---

## Summary counts

| Spec                            |                            Requirements (spec.md headings) | Implemented (code vs spec.md intent) |     Partial | Missing in code |                                            Discrepancies | Missing tests (material) |
| ------------------------------- | ---------------------------------------------------------: | -----------------------------------: | ----------: | --------------: | -------------------------------------------------------: | -----------------------: |
| `core:get-status`               |                                                         17 |                          17 (wiring) |           0 |               0 |                                                        4 |                        3 |
| `core:transition-change`        |                                                         25 |                          25 (wiring) |           0 |               0 |                                                        2 |                        2 |
| `core:validate-artifacts`       | 24+ (DAG/factory subset audited in depth; rest same class) |          DAG/factory **implemented** | 0 for focus |     0 for focus |                                                        2 |                        3 |
| `core:get-artifact-instruction` |                                                         10 |                                   10 |           0 |               0 |                                                1 wording |                        3 |
| **Batch**                       |                                                          — |         Focus items **pass in code** |           — |               — | **9** (mostly `spec-wrong` / stale verify / stale tests) |                   **11** |

| Kind         |                                                                                                                                Count |
| ------------ | -----------------------------------------------------------------------------------------------------------------------------------: |
| `spec-wrong` | 6 (LifecycleEngine leftover in GetStatus/TransitionChange/GAI verify; ValidateArtifacts verify ctor; GetStatus GS-16 vs Constraints) |
| `code-wrong` |                                                      2 (composition tests extra `lifecycle` property × GetStatus + TransitionChange) |
| `both`       |                                                                                              1 (drafted `schemaInfo` on schema miss) |

**createEvaluateLifecycle:** not present in graph or source. Current spec.md factory sections do **not** require it (prior 20260828 audit is outdated vs this preview).

**Overall:** Implementation of the four use cases and four `resolve*Deps` helpers matches the **updated spec.md constructor/factory/DAG rules**. Highest-severity remaining issue is **VerifyArtifacts verify.md still requiring a `LifecycleEngine` constructor dependency**, which would fail a literal verify run and contradicts the same change’s spec.md. GetStatus/TransitionChange code correctly import `evaluateLifecycle`; DAG UCs correctly call `evaluateLifecycleVerdict` with `checksByTarget: {}`. CLI `--next` is a pass-through to Core `HAPPY_PATH_NEXT`.

---

## Partial file: `_partial-archive-hooks.md`

# Spec-compliance partial: archive / hooks / approvals / storage / config

**Mode:** change `workflow-transition-checks`  
**Batch:** archive-hooks (`core:archive-change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:storage`, `core:config`)  
**CLI:** `node packages/cli/dist/index.js` (spec-preview + graph)  
**Graph:** `stale: false`, `contentFresh: true`, `currentRef: 2948f1a2`  
**Read-only:** no code or spec files modified.

Evidence: `changes spec-preview workflow-transition-checks <specId>`, then `graph search` (`ArchiveChange`, `RunStepHooks`, `createHookPre`, `createHookPost`, `ApproveSpec`) and source reads under `packages/core/src`. Graph `impact --file` rejected the `core:src/...` file id in this environment; file/symbol search + direct reads used as fallback.

---

## Scope and dependency inclusion (depth 1)

Change specs in this batch declare (among others): `core:transition-checks`, `core:run-step-hooks`, `core:change`, `core:workflow-model`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `default:_global/architecture`. Cross-batch contradictions with those deps are noted where they affect this batch.

---

# Spec: `core:archive-change`

## Requirements Summary

| ID    | Requirement                       | Intent                                                                                                                                                                               |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1  | Ports and constructor             | Inject repos, `archiveBindings`, parsers, schema, materialize, extractors, routes, root, snapshot, hasher. **MUST NOT** take `RunStepHooks` / `HookRunner` / `projectWorkflowHooks`. |
| AC-2  | Archive bindings not RunStepHooks | `archiveBindings` from registry; `RunStepHooks` only on `createHookPre` / `createHookPost`. `ArchiveChangeDeps` MUST NOT list `runStepHooks`.                                        |
| AC-3  | Input                             | `name`; `skipHookPhases` `pre`/`post`/`all`; `allowOverlap`; `allowOutOfScope` skips `impl.linksInScope` only, not `impl.filesResolved`.                                             |
| AC-4  | Schema name guard                 | Operation `archive`: `schema.nameMatch` before archivable, hooks, writes.                                                                                                            |
| AC-5  | ArchivedChange construction       | `ArchiveRepository.archive(change, { actor })`; use case never builds the entity.                                                                                                    |
| AC-6  | Archivable guard                  | `assertArchivable()`; archive is **not** a `from→to` hop; `approval.signoff` MUST NOT bind this operation.                                                                           |
| AC-7  | Deferred transition to archiving  | Mutate to `archiving` after preflight + snapshots, immediately before first `publish()`.                                                                                             |
| AC-8  | ReadOnly workspace guard          | Same runner as enter-`ready`; before hooks/writes; stay `archivable` on throw.                                                                                                       |
| AC-9  | Overlap guard                     | Archive-only `spec.overlap`; skippable with `allowOverlap`; still `archivable`.                                                                                                      |
| AC-10 | Pre-archive hooks                 | Operation-`archive` effects with `phase = before-persist`; select by binding table **not** `check.id === 'hook.pre'`; `onFailure` abort; skip via `skipHookPhases`.                  |
| AC-11 | Tracked artifact selection        | Use tracked `ArtifactFile.filename`; no alternate path probe.                                                                                                                        |
| AC-12 | Prepare archive plan              | Full-batch preflight before any canonical publish.                                                                                                                                   |
| AC-13 | Staged archive commit             | Preflight failure leaves canonical unchanged; commit-phase restore.                                                                                                                  |
| AC-14 | Batch canonical snapshot          | Before deferred `archiving`; no `metadata.json` in backup.                                                                                                                           |
| AC-15 | Batch canonical restore           | Reverse publish order; partial restore stays `archiving`.                                                                                                                            |
| AC-16 | Orphan backup detection           | Matching changeName auto-restore+abort; foreign abort.                                                                                                                               |
| AC-17 | Lifecycle rollback                | Successful restore → `archive-failed` + `archiving`→`archivable`.                                                                                                                    |
| AC-18 | Archive debug logging             | Structured debug at listed steps; no secrets/stderr/full files.                                                                                                                      |
| AC-19 | Delta merge and spec sync         | Per spec-scoped artifacts; parser registry; empty base for new specs.                                                                                                                |
| AC-20 | Archive repository call           | Actor required; then `archive()`; backup cleanup; fs-cache index is adapter detail.                                                                                                  |
| AC-21 | Archive index metadata            | `totalCount` maintained (adapter).                                                                                                                                                   |
| AC-22 | Post-archive hooks                | Effects with `phase = after-persist`; not `check.id === 'hook.post'`; default `collect`.                                                                                             |
| AC-23 | Spec metadata generation          | Preflight extract vs sealed `dependsOn`; post-commit `MaterializeSpecMetadata` `force`.                                                                                              |
| AC-24 | spec-lock sidecar                 | Sealed `dependsOn` precedence; `publish({ persistedState })` not separate write.                                                                                                     |
| AC-25 | Result shape                      | `archivedChange`, `archiveDirPath`, `postHookFailures`, `staleMetadataSpecPaths`, `invalidatedChanges`.                                                                              |
| AC-26 | Typed errors                      | Named `SpecdError` subclasses; no generic `Error` for those cases.                                                                                                                   |
| AC-27 | Archive checks share runners      | Registry order; no `archive.publication` check; remaining merge preflight **inside** use case.                                                                                       |
| AC-28 | Tracked implementation review     | `impl.filesResolved` same runner as forward exit `implementing`.                                                                                                                     |
| AC-29 | Implementation materialization    | Confirmed links into spec-lock.                                                                                                                                                      |
| AC-30 | Out-of-scope sidecar guard        | `impl.linksInScope`; `--allow-out-of-scope`.                                                                                                                                         |
| AC-31 | Config-based factory              | `resolveArchiveChangeDeps` → `createArchiveChange(deps)`; no `runStepHooks` on deps.                                                                                                 |

## Implementation Status

| ID                                    | Status                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1                                  | **Implemented**                                                                                                                               | `ArchiveChange` ctor in `packages/core/src/application/use-cases/archive-change.ts` (~222–249): `archiveBindings` 4th; no `RunStepHooks`.                                                                                                                                                                                                                              |
| AC-2                                  | **Implemented**                                                                                                                               | `ArchiveChangeDeps` in `packages/core/src/composition/use-cases/archive-change.ts` (~105–118): `archiveBindings`, no `runStepHooks`. Registry: `createWorkflowCheckRegistry` injects `runStepHooks` into `createHookPre`/`createHookPost` (`workflow-check-registry.ts` ~73–74, 109–110).                                                                              |
| AC-3                                  | **Implemented**                                                                                                                               | `ArchiveChangeInput`: `skipHookPhases`, `allowOverlap`, `allowOutOfScope`. Passed into check context.                                                                                                                                                                                                                                                                  |
| AC-4                                  | **Implemented**                                                                                                                               | `ARCHIVE_BINDING_SPECS` first row `schema.nameMatch` (`check-bindings.ts` ~84–85). Evaluated via `executeMatchingPredicates` before effects.                                                                                                                                                                                                                           |
| AC-5                                  | **Implemented**                                                                                                                               | `archiveRepository.archive(change, { actor })` after publications (flow ~after snapshots).                                                                                                                                                                                                                                                                             |
| AC-6                                  | **Implemented**                                                                                                                               | `archive.archivable` on archive table; `approval.signoff` only on `TRANSITION_BINDING_SPECS` (`from: done`, `to: archivable`). Archive applicability is `{ scope: 'archive' }` — not a hop.                                                                                                                                                                            |
| AC-7                                  | **Implemented**                                                                                                                               | Deferred mutate to `archiving` after plan/snapshots (spec + existing tests).                                                                                                                                                                                                                                                                                           |
| AC-8                                  | **Implemented**                                                                                                                               | `workspace.readOnly` on archive bindings; same `createWorkspaceReadOnly` instance as transitions.                                                                                                                                                                                                                                                                      |
| AC-9                                  | **Implemented**                                                                                                                               | `spec.overlap` archive-only; `allowOverlap` on context. Host still lists peers for invalidation when allowed.                                                                                                                                                                                                                                                          |
| AC-10                                 | **Implemented**                                                                                                                               | `matchingEffects(..., 'before-persist')` then `executeCheckWithProgress`; fail-fast → `throwHookFailed`. Comments state “not check id”.                                                                                                                                                                                                                                |
| AC-11–AC-21, AC-23–AC-26, AC-28–AC-29 | **Implemented** (pre-existing archive pipeline; this change wraps predicates/effects). Not re-proven line-by-line beyond hook/binding wiring. |
| AC-22                                 | **Implemented**                                                                                                                               | `matchingEffects(..., 'after-persist')`; `onFailure collect` → `postHookFailures`.                                                                                                                                                                                                                                                                                     |
| AC-27                                 | **Mostly implemented**                                                                                                                        | No `archive.publication` id. Predicates run via registry. **Also** `_assertArchiveDepsConsistent` re-invokes domain `runDepsConsistent` during `_prepareArchivePlan` (~784, 1127–1154) after before-persist effects. Spec explicitly allows remaining preflight **inside** `ArchiveChange`; this is a second invocation of the same runner, not a binding-table check. |
| AC-30                                 | **Implemented**                                                                                                                               | `impl.linksInScope` on archive table; `allowOutOfScope` on context (`impl-links-in-scope.ts`).                                                                                                                                                                                                                                                                         |
| AC-31                                 | **Implemented**                                                                                                                               | `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (~148); config factory delegates. Composition test constructs deps **without** `runStepHooks`.                                                                                                                                                                                             |

## Discrepancies

### D-AC-1 — Dual `deps.consistent` evaluation (hooks already ran)

- **Severity:** low
- **Blame:** both (spec allows in-use-case preflight; also says mismatch SHALL throw **via** `deps.consistent`)
- **Spec:** AC-27: named archive predicates include `deps.consistent` with sealed-set facts; remaining merge/publish preflight stays inside the use case after those predicates. AC-10: before-persist effects run after predicates that must precede effects.
- **Code:** `createDepsConsistent` loads sealed maps via `loadArchiveSealedDependsOnBySpecId` **before** hooks (`deps-consistent.ts` ~59–68). Later `_assertArchiveDepsConsistent` runs the same `runDepsConsistent` on publication-plan `finalDependsOn` **after** before-persist effects (`archive-change.ts` ~1127–1154).
- **Impact:** If merge-time extract disagrees with the earlier sealed snapshot, `run:` pre-hooks have already executed. Spec order (predicates → effects → remaining preflight) **requires** that. The second path does not go through `Check.execute` / `throwMappedArchiveFailure`.
- **If spec is wrong:** tighten AC-27 to say merge-time `runDepsConsistent` is required remaining preflight, not “via the check”.
- **If code is wrong:** fail archive on the named check only, or move merge-time assert before effects (would contradict “remaining preflight after predicates+effects”).

### D-AC-2 — verify.md leftover “state transition” wording vs deferred `archiving`

- **Severity:** low
- **Blame:** spec-wrong
- **Spec:** verify scenario “Guard runs after archivable check and **state transition**” still implies a hop before readOnly; spec.md deferred transition is after snapshots.
- **Code:** readOnly is an archive **predicate** while still `archivable`.
- **If spec is wrong:** rename the verify scenario.
- **If code is wrong:** N/A for this wording.

No leftover `hook.pre`/`hook.post` id branching in the use-case loop: selection is `matchingEffects` + `binding.phase` (`execute-hook-effect.ts`).

## Test Coverage

| Area                                                            | Tests                                                                   | Adequacy                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ctor without stored `RunStepHooks`                              | `archive-change.spec.ts` “does not store RunStepHooks”                  | Adequate for instance fields; helper still **takes** `RunStepHooks` to build bindings (`helpers.ts` `newArchiveChange`). |
| `ArchiveChangeDeps` has `archiveBindings`, not `runStepHooks`   | `composition/use-cases/archive-change.spec.ts`                          | Adequate.                                                                                                                |
| Skip `all`/`pre`/`post`                                         | `archive-change.spec.ts` skipHookPhases cases                           | Adequate.                                                                                                                |
| Matching archive effect slots                                   | `matching-effects.spec.ts` before-persist abort / after-persist collect | Adequate for binding policy; uses **domain** `ARCHIVE_BINDINGS` (noop execute).                                          |
| Constructor does not accept `RunStepHooks` as a typed parameter | Implicit via production ctor                                            | Weak: tests never type-fail a `RunStepHooks` 4th argument because the helper maps it to bindings.                        |

## Missing Tests

- Direct test that `ArchiveChange` constructor **parameter list** has no `RunStepHooks` (compile/API), not only `'runStepHooks' in uc`.
- Application-registry (I/O) archive effect order: `createWorkflowCheckRegistry` bindings, not only domain stubs.
- Divergence: early `loadArchiveSealedDependsOnBySpecId` pass vs later `_assertArchiveDepsConsistent` fail (documents D-AC-1).
- `throwHookFailed` unit tests (`hook-failed.ts` has none).

## Spec Dependency Chain

`core:archive-change` → `core:transition-checks` (archive operation + shared runners), `core:hook-execution-model` / `core:run-step-hooks` (effects via checks), `core:storage` (archive adapter), `core:change`, `core:schema-format`, `core:composition-resolver`. **Consistent** with archive-as-operation and `archiveBindings` vs `transitionBindings`.

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID   | Requirement                           | Intent                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1  | Two hook types                        | `instruction:` vs `run:`; exclusive keys (schema).                                                                                                                                                                                                                  |
| H-2  | External hooks explicit               | `external: { type, config }`; `HookRunner` still shell-only.                                                                                                                                                                                                        |
| H-3  | External hooks follow phase semantics | Same pre fail-fast / post collect-or-abort as shell.                                                                                                                                                                                                                |
| H-4  | instruction hooks passive             | Skip in Transition/Archive/`RunStepHooks`; `GetHookInstructions` only.                                                                                                                                                                                              |
| H-5  | Default execution                     | After predicates; slot from **binding** `phase`/`onFailure`; `RunStepHooks` ctor dep of hook **checks**, not launched by id in use cases; no private always-source.post; `skipHookPhases` by skip selectors because transition both effects share `before-persist`. |
| H-6  | Two execution modes                   | Standalone `RunStepHooks` fail-fast pre / fail-soft post; use cases use binding `onFailure`. Transition `hook.post` abort before persist.                                                                                                                           |
| H-7  | Change entity does not execute hooks  | Application layer.                                                                                                                                                                                                                                                  |
| H-8  | Manual skipHooks                      | Transition: `source.pre`/`source.post`/`target.pre`/`target.post`/`all`; archive: `pre`/`post`/`all`. `source.pre`/`target.post` no-ops on this table.                                                                                                              |
| H-9  | Pre-hook failure                      | Fail-fast; Transition/Archive throw `HookFailedError`; no persist / no files.                                                                                                                                                                                       |
| H-10 | Post-hook failure                     | Binding `onFailure`; archive post collect; transition post abort.                                                                                                                                                                                                   |
| H-11 | Hook ordering                         | Schema then project declaration order (in `RunStepHooks`).                                                                                                                                                                                                          |
| H-12 | Template variables                    | `change.name`/`path`, `project.root`; no `change.workspace`.                                                                                                                                                                                                        |

## Implementation Status

| ID                   | Status                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1, H-4, H-11, H-12 | **Implemented** (primarily `RunStepHooks` / schema; not re-audited in full).           |
| H-2, H-3             | **Not re-verified** in this batch beyond model text; dispatch lives in `RunStepHooks`. |
| H-5                  | **Implemented**                                                                        | Separate modules: `hook-pre.ts`, `hook-post.ts`; shared **class** `HookEffectCheck` in `hook-effect-shared.ts` (not a barrel re-exporting factories). `hook-failed.ts` is `throwHookFailed`, not a Check. Use cases: `matchingEffects` by `phase`. Skip: `HookEffectCheck.execute` uses `all` / archive `pre`/`post` / transition `target.pre`/`source.post` — **not** `binding.phase` alone (`hook-effect-shared.ts` ~131–147). |
| H-6                  | **Implemented**                                                                        | `hookFailureMode`: abort → fail-fast, collect → fail-soft (`execute-hook-effect.ts`). Transition bindings: both hook effects `before-persist` + `abort`. Archive post: `after-persist` + `collect`.                                                                                                                                                                                                                              |
| H-7                  | **Implemented**                                                                        | No `HookRunner` on `Change`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| H-8                  | **Implemented**                                                                        | Skip selectors as above; tests in `transition-change.spec.ts` for `source.pre`/`target.post` no-ops.                                                                                                                                                                                                                                                                                                                             |
| H-9, H-10            | **Implemented**                                                                        | `throwHookFailed` on abort; archive collect appends `details.commands`.                                                                                                                                                                                                                                                                                                                                                          |
| Domain stubs         | **Fixture-only**                                                                       | `domain/checks/hook-pre.ts` / `hook-post.ts` **always skip**. Comments still say “execute calls `RunStepHooks`” — false for domain objects. Production I/O is application `create*`.                                                                                                                                                                                                                                             |

## Discrepancies

### D-H-1 — No leftover factory barrel; shared implementation file remains

- **Severity:** info / none as defect
- **Blame:** n/a (compliant with “no leftover hook-effect barrel re-exporting factories”)
- **Code:** Glob: only `hook-effect-shared.ts`, not `hook-effect.ts`. Factories live in `hook-pre.ts` / `hook-post.ts` and import the class.
- **Note:** `hook-failed.ts` is an abort helper, not a Check module. Focus list named it beside Check files; `core:hook-execution-model` does not define a `hook.failed` check id.

### D-H-2 — Domain hook Check comments vs always-skip execute

- **Severity:** low
- **Blame:** code-wrong (comments)
- **Spec:** H-5: `RunStepHooks` is a constructor dep of hook **checks** (application `create*`). Domain table exists for matcher tests (`TRANSITION_BINDINGS`).
- **Code:** `domain/checks/hook-pre.ts` JSDoc: “execute calls `RunStepHooks`”; `execute` always `skip`.
- **If spec is wrong:** document domain stubs as skip-only.
- **If code is wrong:** fix comments (or stop claiming domain execute runs hooks).

### D-H-3 — `matchingEffects` tests use domain bindings (noop execute)

- **Severity:** low
- **Blame:** both (tests vs production registry)
- **Spec:** use cases MUST compose application `create*`.
- **Code:** `matching-effects.spec.ts` imports `TRANSITION_BINDINGS` / `ARCHIVE_BINDINGS` (domain). Slot/policy assertions still valid. Execution of real `RunStepHooks` is covered in use-case specs via `makeArchiveBindings` / transition helpers.

## Test Coverage

| Requirement                        | Coverage                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| H-5 skip not by phase alone        | `transition-change.spec.ts` source.pre / target.post / target.pre / source.post |
| Recovery omits both effects        | `matching-effects.spec.ts` `archiving → archivable`                             |
| Redesign/backward omit `hook.post` | `matching-effects.spec.ts`                                                      |
| Factory injects `RunStepHooks`     | `workflow-check-factories.spec.ts` `createHookPre`                              |
| `createHookPost` kind effect       | factories spec (build only, no execute)                                         |

## Missing Tests

- `createHookPost.execute` archive skip `pre` vs `post`.
- `throwHookFailed` mapping of missing `details`.
- Negative: no `packages/core/src/application/checks/hook-effect.ts` barrel (documentation/guard).
- External hook phase semantics (H-2/H-3) not in this file’s tests.

## Spec Dependency Chain

Depends on `core:workflow-model`, `core:run-step-hooks`, `core:transition-change`, `core:archive-change`, `core:transition-checks`, `core:config` (skip is use-case/CLI, not yaml). **Consistent** with checks owning `RunStepHooks`.

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                 | Intent                                                                                                                                                                       |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                  | Disabled → `ApprovalGateDisabledError` `'spec'`, no I/O; then load, actor, schema, name match.                                                                               |
| AS-2 | Change lookup               | `ChangeNotFoundError`.                                                                                                                                                       |
| AS-3 | Artifact hash computation   | Skip missing/skipped; skip null loads; cleanup then hash; keys `type:key`.                                                                                                   |
| AS-4 | Approval recording          | `recordSpecApproval`; **no** hop to `pending-spec-approval` / `spec-approved` when in bound `from` (`ready`); drain from `pending-spec-approval` MAY hop to `spec-approved`. |
| AS-5 | Persistence                 | `mutate`; return mutated `Change`.                                                                                                                                           |
| AS-6 | Input contract              | `name` + `reason` only.                                                                                                                                                      |
| AS-7 | Gates baked at construction | `approvals: ApprovalGates`.                                                                                                                                                  |
| AS-8 | Factory                     | `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`.                                                                                                              |

## Implementation Status

| ID                   | Status          | Evidence                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1–AS-3, AS-5–AS-8 | **Implemented** | `approve-spec.ts`; composition `resolveApproveSpecDeps` (~37–).                                                                                                                                                                                                                                                  |
| AS-4                 | **Implemented** | `boundFromStates('approval.spec')` (`check-bindings.ts` → `ready`). Mutate: `recordSpecApproval`; `transition('spec-approved')` **only if** `pending-spec-approval`. No `pending-spec-approval` write on ready. `VALID_TRANSITIONS.ready` is `implementing`/`designing` only — happy path cannot hop to pending. |

## Discrepancies

None material for in-place ready consent.

**Note:** verify “Change is not in ready or pending-spec-approval” / drafting → `InvalidStateTransitionError` is implemented via `consentFrom` + drain state (~86–88). Error `to` uses `consentFrom[0] ?? 'ready'`, not a pending hop.

## Test Coverage

| Scenario                           | Test                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| Ready stays ready                  | `approve-spec.spec.ts` “records consent and stays in ready” |
| Drain to spec-approved             | same file drain describe                                    |
| Gate disabled / not found / hashes | existing describes                                          |

## Missing Tests

- Explicit assert that `transition('pending-spec-approval')` is **never** called (spy on `Change.transition`).
- `boundFromStates('approval.spec')` equals `['ready']` coupled to bindings (would catch binding drift).

## Spec Dependency Chain

`core:transition-checks` (`from` states). Aligns with `core:config` Approvals (in-place `approval.spec`). No contradiction with `VALID_TRANSITIONS` (pending is drain-only inbound).

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec: stay in **`done`**; drain `pending-signoff` → `signed-off`; gate `'signoff'`; `resolveApproveSignoffDeps`.

## Implementation Status

**Implemented** (`approve-signoff.ts` ~86–98; `boundFromStates('approval.signoff')` → `done`). `VALID_TRANSITIONS.done` has no `pending-signoff`. Archive operation does **not** bind `approval.signoff` (AC-6).

## Discrepancies

None material.

## Test Coverage

`approve-signoff.spec.ts` “records consent and stays in done”; drain to `signed-off`.

## Missing Tests

Same as ApproveSpec: spy that `pending-signoff` is not written on `done`.

## Spec Dependency Chain

Same pattern as ApproveSpec + `approval.signoff` binding `done → archivable` forward only.

---

# Spec: `core:storage`

## Requirements Summary (focus + rest)

This change’s delta for storage is **Artifact dependency cascade**: DAG owned by `LifecycleEngine.projectArtifacts` / `_effectiveStatus`; **no** `Change.effectiveStatus()`; load-time file statuses from hashes; rewrite persisted `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory; effective DAG may still **report** `pending-parent-artifact-review`.

Other storage requirements (directory naming, archive pattern, fs-cache index, staged archive, locks, etc.) are **unchanged by this delta** and treated as inherited; not re-audited exhaustively here.

## Implementation Status

| Focus item                        | Status          | Evidence                                                                                                                              |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No `Change.effectiveStatus()`     | **Implemented** | No matches in `packages/core/src/domain/entities`.                                                                                    |
| `projectArtifacts` owns cascade   | **Implemented** | `lifecycle-verdict.ts` `projectArtifacts` (~313–327) calls private `effectiveStatus` (~356+). Re-exported from `lifecycle-engine.ts`. |
| Load rewrite PPAR → `in-progress` | **Implemented** | `change-repository.ts` (~1422, ~1701).                                                                                                |
| `ArtifactFile` rejects PPAR       | **Implemented** | `artifact-file.ts` (~52–54).                                                                                                          |
| Effective DAG may be PPAR         | **Implemented** | `effectiveStatus` returns `pending-parent-artifact-review` (~406).                                                                    |

## Discrepancies

### D-ST-1 — Spec name `_effectiveStatus` vs code `effectiveStatus`

- **Severity:** low
- **Blame:** spec-wrong
- **Spec:** “`LifecycleEngine.projectArtifacts` / `_effectiveStatus`”.
- **Code:** function is `effectiveStatus` (unexported) in `lifecycle-verdict.ts`, not a method `_effectiveStatus` on `LifecycleEngine` (that file is a re-export barrel).
- **If spec is wrong:** say `projectArtifacts` + private `effectiveStatus` in `lifecycle-verdict.ts`.
- **If code is wrong:** rename to `_effectiveStatus` on an engine object (unlikely desired).

Comments in `transition-change.spec.ts` still say `effectiveStatus('tasks')` as a shorthand for DAG projection — not a `Change` method.

## Test Coverage

`lifecycle-engine.spec.ts` / `get-status.spec.ts` cascade cases. `artifact-file` reject token. Fs load rewrite: `change-repository.spec.ts` (inherited).

## Missing Tests

- Explicit `expect(Change.prototype).not.toHaveProperty('effectiveStatus')` or similar API lock.
- Config-level test N/A.

## Spec Dependency Chain

Storage → `core:lifecycle-engine` for DAG. **Consistent** with GetStatus/TransitionChange using `projectArtifacts`, not entity methods.

---

# Spec: `core:config`

## Requirements Summary

This change’s delta is **Requirement: Approvals**: `approvals.spec` / `approvals.signoff` are **in-place checks**, not pending hops; stay in `ready` / `done`; drain remaining; `change transition` targeting pending is never next-action.

**`skipHookPhases`:** not a `specd.yaml` field in this spec (or this delta). It is use-case/CLI input (`core:hook-execution-model`, CLI flags).

**`allow-out-of-scope`:** not a config key; `ArchiveChangeInput` / `TransitionChangeInput` + `impl.linksInScope`.

All other config requirements (discovery, workspaces, storage paths, plugins, …) are inherited; not the focus of this delta.

## Implementation Status

| Item                       | Status                    | Evidence                                                           |
| -------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Approvals yaml shape       | **Implemented**           | Spec preview Approvals section; `ApprovalGates` on use cases.      |
| In-place spec gate         | **Implemented**           | `approval.spec` check + `VALID_TRANSITIONS.ready` without pending. |
| In-place signoff           | **Implemented**           | `approval.signoff` on `done → archivable`; archive unbound.        |
| skipHookPhases in yaml     | **N/A (correct absence)** | No matches in `specd-config.ts`.                                   |
| allow-out-of-scope in yaml | **N/A (correct absence)** | Flag on check context, not config.                                 |

## Discrepancies

### D-CFG-1 — Config verify scenario not covered under config-loader tests

- **Severity:** low
- **Blame:** both
- **Spec:** verify “Spec gate on does not require pending-spec-approval in the graph” (WHEN change in `ready` evaluated for `implementing`, wait is `approval.spec`).
- **Code:** behavior lives in transition checks + `TransitionChange`, not config-loader. Grep of `packages/core/test` `*config*` found **no** `pending-spec-approval` assertion.
- **If spec is wrong:** move scenario to `core:transition-checks` / `core:get-status` verify only.
- **If code is wrong:** add a config-package test that only documents defaults (weak) **or** keep scenario in transition tests and drop it from config verify.

`TransitionChange._assertDrainAndGateTargets` blocks targeting pending **when the gate is off** (`gate-not-required`). When the gate is **on**, protocol still cannot hop `ready → pending-spec-approval` because it is not in `VALID_TRANSITIONS`. Compliant with “new work MUST NOT enter pending as happy-path hop”.

## Test Coverage

Config verify load defaults / `approvals.spec: true` — existing config-loader tests (inherited). In-place wait: `transition-change` / approval check tests, not config package.

## Missing Tests

- Config verify scenario “Spec gate on does not require pending hop” as an automated test (or relocate the scenario).
- No tests should assert `skipHookPhases` on `SpecdConfig` (would be spec-wrong).

## Spec Dependency Chain

`core:config` now depends on `core:transition-checks`. Aligns with ApproveSpec/Signoff and `approval.*` bindings. Does **not** contradict skip-hook CLI mapping living on lifecycle use cases.

---

# Cross-cutting (focus checklist)

| Focus                                                      | Verdict                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive is operation not hop                               | **Pass** — `ARCHIVE_BINDING_SPECS` `scope: 'archive'`; no `protocol.edge`; no `approval.signoff` on archive.                                      |
| `archiveBindings` vs `transitionBindings`                  | **Pass** — `WorkflowCheckRegistry` both tables from `applyBindingSpecs`.                                                                          |
| Separate Check modules; no factory barrel                  | **Pass** — `hook-pre.ts` / `hook-post.ts`; helper `hook-failed.ts`; `hook-effect-shared.ts` is shared **implementation**, not a re-export barrel. |
| `RunStepHooks` dep of hook checks, not use-case loop-by-id | **Pass** — registry injects into `createHook*`; use cases call `matchingEffects` + `check.execute`.                                               |
| Approvals stay ready/done                                  | **Pass** — use cases + `VALID_TRANSITIONS`.                                                                                                       |
| Storage DAG / no `Change.effectiveStatus()`                | **Pass** (naming nit D-ST-1).                                                                                                                     |
| Config skipHook / allow-out-of-scope                       | **N/A on yaml**; implemented on use-case input + checks.                                                                                          |

---

# Summary counts

| Spec                               | Requirements reviewed | Implemented                    | Partial               | Missing | Discrepancies                                      |
| ---------------------------------- | --------------------- | ------------------------------ | --------------------- | ------- | -------------------------------------------------- |
| `core:archive-change`              | 31                    | 30                             | 1 (AC-27 dual runner) | 0       | 2 (D-AC-1 low both; D-AC-2 low spec-wrong)         |
| `core:hook-execution-model`        | 12                    | 12 (H-2/H-3 not deep-verified) | 0                     | 0       | 2 (D-H-2 low code-wrong comments; D-H-3 low tests) |
| `core:approve-spec`                | 8                     | 8                              | 0                     | 0       | 0                                                  |
| `core:approve-signoff`             | 8                     | 8                              | 0                     | 0       | 0                                                  |
| `core:storage` (focus + inherited) | 1 delta + inherited   | Focus 5/5                      | 0                     | 0       | 1 (D-ST-1 low spec-wrong)                          |
| `core:config` (Approvals delta)    | 1 delta + N/A flags   | Delta implemented              | 0                     | 0       | 1 (D-CFG-1 low both)                               |

**Totals (this batch):**

- **Requirements with a finding:** 6 discrepancy rows (none high/critical).
- **Highest severity:** low.
- **Blockers for “checks own hooks / archive is an operation / in-place approvals”:** none found.

**Severity × blame**

| ID      | Severity | Blame      |
| ------- | -------- | ---------- |
| D-AC-1  | low      | both       |
| D-AC-2  | low      | spec-wrong |
| D-H-2   | low      | code-wrong |
| D-H-3   | low      | both       |
| D-ST-1  | low      | spec-wrong |
| D-CFG-1 | low      | both       |

---

## Partial file: `_partial-cli-skills.md`

# Partial audit: CLI + skills (`workflow-transition-checks`)

- **Mode:** change `workflow-transition-checks` (state `designing`; assigned specs via `changes spec-preview`)
- **CLI:** `node packages/cli/dist/index.js` (not bare `specd`)
- **Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`. Symbol search works; **no language-adapter file index** (`fileCount: 0`, `coverage.reasons: no-language-adapter`). `graph impact --file cli:src/commands/change/status.ts` failed (`no indexed file matches`). Navigation: `graph search` for `GetStatus` / `TransitionChange` (core classes) + spec search, then read `packages/cli` and `packages/skills`.
- **Read-only.** Specs from `changes spec-preview workflow-transition-checks <specId>`.

Project-wide constraints used: adapter CLI delegates to kernel/SDK (`default:_global/architecture`); Vitest unit tests with mocked ports (`default:_global/testing`). Direct deps (depth 1): `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:archive-change`, `core:hook-execution-model`, `core:change`, `cli:entrypoint`, `skills:skill`, `skills:workflow-automation`.

---

# Spec: `cli:change-status`

## Requirements Summary

| Requirement                                      | Intent                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Command signature                                | `change status <name> [--format text\|json\|toon]`                                                                      |
| Drafted change status is read-only               | `draftView` → no mutating transitions; `isDrafted`; suppress `nextAction.command` even if Core attached one             |
| Output format                                    | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display projection                                                   |
| Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` stays boolean                                         |
| Display-state rendering                          | Text prefers display status (`complete-with-drift`); JSON has canonical + display                                       |
| Lifecycle projections come from GetStatus checks | Pass through `validTransitions` / `availableTransitions` / `nextAction` / blockers; no local `VALID_TRANSITIONS` filter |
| Text status omits duplicated review file lists   | `review:` header without `affectedArtifacts` paths; hide invalidation `OVERLAP_CONFLICT`; print overlap peers           |
| Text blockers include check labels               | `! CODE — label: message`; JSON `label` + `checkId`                                                                     |
| Schema version warning                           | stderr from `lifecycle.schemaInfo` vs recorded schema; skip if `schemaInfo` null; exit 0                                |
| Change not found                                 | exit 1, `error:`                                                                                                        |
| Schema-derived fields                            | `schema.artifactDag` via `artifactDag()` / `childrenOf`; text DAG roots + no duplicate convergent subtrees              |
| Delegates refresh policy to GetStatus            | no `RefreshImplementationTracking` / `ImplementationDetector` in the command                                            |
| Implementation section                           | `--implementation` uses `sdk:build-implementation-review` only                                                          |
| Task completion in details                       | `tasks: N/M`                                                                                                            |
| Basic info section                               | name + state; no standalone `specs:` list                                                                               |
| Specs and dependencies                           | text bullets + JSON `specDependsOn`                                                                                     |

**Constraints (binding):** serialize GetStatus as-is; no SchemaRegistry/config-show to recompute lifecycle; drafted **must** null `nextAction.command`; no second `VALID_TRANSITIONS` filter.

## Implementation Status

**Mostly implemented.** Handler: `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`). Tests: `packages/cli/test/commands/change/status.spec.ts`.

| Requirement                                                                 | Status          | Evidence                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature                                                           | **implemented** | Commander `status <name>`, `--format`, `--implementation`                                                                                                                                                                                                                            |
| Drafted read-only + suppress command                                        | **partial**     | Text: `state … (drafted)`, `transitions: (none — change is drafted)`, `command: (none)` via `nextAction = { …statusResult.nextAction, command: null }`. JSON: `isDrafted: true`, `command: null`. **JSON still copies `lifecycle.availableTransitions` unchanged** (no force-empty). |
| GetStatus as-is / no VALID_TRANSITIONS filter                               | **implemented** | `kernel.changes.status.execute({ name })` only. Renders `lifecycle.availableTransitions` as given. No local hop table.                                                                                                                                                               |
| Review header / overlap / no file lists                                     | **implemented** | Text `review:` required/route/reason/message; overlap section; filter `OVERLAP_CONFLICT` when `reason === 'spec-overlap-conflict'`; help schema lists `overlapDetail`                                                                                                                |
| Blocker gerund labels                                                       | **implemented** | `! ${code} — ${label}: ${message}` vs `! ${code}: ${message}`; JSON spreads `label`/`checkId`                                                                                                                                                                                        |
| DAG / hasTasks / display state                                              | **implemented** | `resolveStatusSchemaDag` prefers `schema.artifactDag()`; `visited` Set skips convergent re-expansion (spec MAY omit); DAG uses `displayStatus`                                                                                                                                       |
| Refresh delegation                                                          | **implemented** | Test asserts `refreshImplementationTracking.execute` not called                                                                                                                                                                                                                      |
| Schema warning / not found / specs section / details tasks / implementation | **implemented** | Matches spec; implementation via `enrichImplementationTracking`                                                                                                                                                                                                                      |

## Discrepancies

### 1. Drafted JSON still serializes Core `availableTransitions` — **code-wrong** (defense-in-depth; Core may already empty them)

**Evidence**

- Spec: “MUST NOT print actionable lifecycle transitions that would mutate the drafted change.” Constraint: suppress `nextAction.command` even if Core attached a command.
- Text overrides transitions to `(none — change is drafted)`.
- JSON drafted branch (`status.ts` ~166–182) sets `command: null` but `availableTransitions: lifecycle.availableTransitions` with **no** override.
- Test `JSON drafted status includes isDrafted and empty transitions` mocks Core already returning `availableTransitions: []` and `command: null` — does **not** prove CLI nulls a Core-attached command or empties hops.

**A (code-wrong, spec wins):** JSON drafted payload should force `availableTransitions: []` (and still null `command`) so agents cannot copy hops into `change transition`.  
**B (spec-wrong):** JSON is a GetStatus dump; only text is “print.” Unlikely: requirement is not format-scoped.  
**C (both):** GetStatus for `draftView` should already empty hops (`core:get-status`); CLI should still defend like it does for `command`.

**Severity:** medium (JSON agents).

### 2. Repair-oriented blockers vs GetStatus as-is — **none** for active changes

Active path does not re-filter `availableTransitions`. OVERLAP_CONFLICT hiding in **text only** when `review.reason === 'spec-overlap-conflict'` is specified, not a local protocol-graph filter.

## Test Coverage

| Area                                                         | Covered?                                  | Notes                                          |
| ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| Drafted text + JSON `isDrafted` / command none               | yes (weak JSON)                           | Core already returns empty hops / null command |
| GetStatus-only, no refresh                                   | yes                                       |                                                |
| Review / overlap / no file paths / hide invalidation OVERLAP | yes                                       |                                                |
| Live OVERLAP_CONFLICT still prints                           | yes                                       |                                                |
| JSON `overlapDetail`                                         | yes                                       |                                                |
| DAG hasTasks counts + details `tasks: N/M`                   | yes                                       |                                                |
| JSON `artifactDag.state` display projection                  | yes                                       |                                                |
| Schema mismatch warning                                      | yes                                       |                                                |
| Change not found                                             | yes                                       |                                                |
| Specs and dependencies; no standalone `specs:`               | yes                                       |                                                |
| Implementation `--implementation`                            | present in command tests (shared helpers) |                                                |

## Missing Tests

1. **Drafted + Core still sends `nextAction.command: '/specd-design'`** → JSON `command === null` and text `(none)` (constraint is explicit).
2. **Drafted + Core sends non-empty `availableTransitions`** → JSON must not advertise hops (if discrepancy #1 is accepted).
3. **Verify scenario: `DEPS_INCONSISTENT` + label `Checking spec dependencies` + JSON `blockers[].label` / `checkId`** — implemented, **no matching test** (`status.spec.ts` has no `DEPS_INCONSISTENT`).
4. **Verify: GetStatus omits `verifying` → CLI does not add it from `VALID_TRANSITIONS`.**
5. **Verify: `nextAction.command` is `/specd-verify` → status does not print `/specd-implement`.**
6. **Verify: `artifact-review-required` + files under details, not under `review:`.**
7. **Text `complete-with-drift`** (JSON DAG state is tested; text display-state scenario is not).
8. **Convergent DAG** (`design` child of `proposal` and `specs` appears once).
9. **`--help` JSON schema lists `overlapDetail`** (code has it; no help-string test).

## Spec Dependency Chain

- `cli:entrypoint` — format / exit codes: OK.
- `core:get-status` — CLI projects result; drafted command suppression is **CLI-owned** even if Core attaches a command.
- `core:transition-checks` — gerund labels / check-derived hops: pass-through.
- `sdk:build-implementation-review` — `--implementation` path, not local graph matching.
- `default:_global/architecture` — adapter; no domain hop table in CLI.

Consistency: change spec forbids a second VALID_TRANSITIONS filter; implementation matches. Drafted JSON hops vs “no actionable transitions” is the only tension with `core:get-status` draftView.

## Summary

- Requirements checked: **16**
- Implemented: **15**
- Partial: **1** (drafted JSON transitions)
- Missing: **0** (all named reqs have code)
- Discrepancies: **1** (code-wrong)
- Spec-wrong: **0**
- Code-wrong: **1**
- Both: **0**
- Test gaps: **9** listed

---

# Spec: `cli:change-transition`

## Requirements Summary

| Requirement                       | Intent                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Command signature                 | `<name> [step]` or `--next`; `--skip-hooks` phases; `--allow-out-of-scope` → `allowOutOfScope` only; no approval flags |
| Next-transition resolution        | `to: 'next'` to `TransitionChange.execute`; **no CLI from→to table**; **do not** resolve via `GetStatus.nextAction`    |
| Delegates refresh                 | pre-status and repair `GetStatus` with `refreshImplementationTracking: false`; no detector/refresh use cases           |
| Approval-gate routing             | no rewrite to pending parking; user names delivery target                                                              |
| Hook execution                    | map `--skip-hooks` → `skipHookPhases`                                                                                  |
| Progress / check bus              | gerund `check-start`/`check-progress`/`check-done`; hooks on same bus; **no** `stream: "hook-progress"`                |
| Shared presenter                  | `run-hooks` may keep `_hook-progress-presenter`                                                                        |
| Success output                    | text confirmation; JSON terminal `stream: "change-transition"` `complete`                                              |
| Post-hook / HookFailedError       | exit **2**, **no** repair guide, check bus `✗`                                                                         |
| Invalid transition / repair guide | stderr from GetStatus `nextAction` + labeled blockers; JSON `complete` + `result: "failure"`                           |
| Incomplete tasks                  | exit 1; artifact named; status already omitted `verifying` (Core)                                                      |
| Check progress rendering          | no `Executing:` prefix; `Running pre/post hooks`                                                                       |

## Implementation Status

**Mostly implemented.** `packages/cli/src/commands/change/transition.ts`, presenter ` _check-progress-presenter.ts`. Tests: `packages/cli/test/commands/change/transition.spec.ts`.

| Requirement                                        | Status          | Evidence                                                                                                                                                                               |
| -------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--next` → `to: 'next'`                            | **implemented** | `requestedTarget = opts.next === true ? 'next' : step`; tests `expect.objectContaining({ to: 'next' })`. Pre-status used only for `fromState` / drafted guard, **not** next hop.       |
| No from→to table                                   | **implemented** | `CHANGE_STATES` is argument validation, not routing. No map drafting→designing.                                                                                                        |
| Repair guide from GetStatus                        | **implemented** | `writeTextRepairGuide` uses `status.nextAction` + blockers/labels; second GetStatus `refreshImplementationTracking: false`. Verify-skill test: `command: /specd-verify` not implement. |
| HookFailedError                                    | **implemented** | not in `isRepairGuideError`; `handleError` exit 2; tests no `repair guide:`; check bus `✗ Running pre hooks`                                                                           |
| Check bus / no hook-progress stream                | **implemented** | `createCheckProgressPresenter({ streamName: 'change-transition' })`; JSON test asserts no `hook-progress`. `run-hooks` still uses `_hook-progress-presenter` (allowed).                |
| skip-hooks / allowOutOfScope / no approval flags   | **implemented** | tests for `all`, comma phases, omit `allowOutOfScope`, no `approvalsSpec`                                                                                                              |
| JSON success complete record                       | **implemented** |                                                                                                                                                                                        |
| Legacy `requires-check` / `task-completion-failed` | **partial**     | still handled in `makeProgressRenderer` because **Core still emits them** (`transition-change.ts` union + emit). Spec wants a single check bus.                                        |

## Discrepancies

### 1. Repair-guide stderr prefix sketch vs Core message — **spec-wrong**

**Evidence**

- Spec.md canonical block: `error: cannot transition to <step>`.
- Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Tests assert the Core `InvalidStateTransitionError` text, not the sketch.
- Verify scenarios: “prints an error message to stderr” + repair guide — not a literal `cannot transition to`.

**A (spec-wrong, CODE WINS):** treat the boxed example as shape (`error:` + `! CODE` + `repair guide:`), not a frozen prefix.  
**B (code-wrong):** rewrite to `cannot transition to ${step}`. Would fight Core’s structured messages (approval-required, `--next` unavailable).

**Severity:** low.

### 2. Dual progress event families — **both** (CLI/core contract)

**Evidence**

- CLI spec: one bus `check-start` / `check-progress` / `check-done`.
- Core `TransitionProgressEvent` still includes `requires-check` and `task-completion-failed`; CLI prints `✓ requires …` / `✗ tasks incomplete…` **in addition to** the gerund presenter.
- Not an `Executing:` regression; it is a second public text shape.

**A (code-wrong Core + CLI):** Core should only emit check events; CLI drop legacy cases.  
**B (spec-wrong CLI):** document the extra diagnostic events until Core is fully on the check bus.

**Severity:** low–medium (text noise / agent parsers).

### 3. JSON structured **failure** complete record — **implemented, untested** (not a code/spec mismatch)

`transition.ts` ~298–312 writes `event.type: "complete"`, `result: "failure"`, `blockers`, `nextAction`. No test in `transition.spec.ts` for `--format json` failure.

## Test Coverage

| Area                                                 | Covered?                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `--next` → `to: 'next'`                              | yes                                                        |
| Mutual exclusion step + `--next`                     | yes                                                        |
| HappyPathNextUnavailableError messages               | yes (pending-spec-approval, pending-signoff, archivable)   |
| No pending rewrite                                   | yes                                                        |
| HookFailedError exit 2, no repair guide, check-bus ✗ | yes (text)                                                 |
| Repair guide stderr / GetStatus nextAction verify    | yes                                                        |
| Labeled blockers on repair guide                     | yes (`READ_ONLY_WORKSPACE — Checking workspace ownership`) |
| skip-hooks mapping                                   | yes                                                        |
| JSON success + check events + no hook-progress       | yes                                                        |
| JSON failure complete                                | **no**                                                     |
| Refresh false on status calls                        | yes                                                        |

## Missing Tests

1. JSON/TOON failed transition: terminal `stream: "change-transition"`, `result: "failure"`, `blockers`, `nextAction` on stdout; no repair guide on stdout.
2. HookFailedError with `--format json`: exit 2, no repair guide, no `complete`/`nextAction` repair payload (structured `handleError` only).
3. Gerund predicate progress `Checking implementation links (impl.linksInScope)` (verify scenario); hook labels covered.
4. Explicit assertion that execute input is **not** derived from `status.nextAction.targetStep` when `--next` is set (today implied by `to: 'next'`).

## Spec Dependency Chain

- `core:transition-change` — `to: 'next'` owned by Core; CLI complies.
- `core:get-status` — repair guide projection; refresh false.
- `core:transition-checks` / `core:hook-execution-model` — check bus vs leftover requires-check events (Core still dual).
- `cli:entrypoint` — exit 1 vs 2 for hooks.

No contradiction with “no CLI routing table.” `CHANGE_STATES` is a closed enum for typos, allowed.

## Summary

- Requirements checked: **14**
- Implemented: **13**
- Partial: **1** (legacy progress events)
- Missing: **0**
- Discrepancies: **2** (1 spec-wrong, 1 both)
- Spec-wrong: **1**
- Code-wrong: **0** (CLI `--next` / repair / hooks match)
- Both: **1**
- Test gaps: **4** listed

---

# Spec: `cli:change-approve`

## Requirements Summary

Signatures `approve spec|signoff <name> --reason`; no gate flags on execute; hashes owned by Core; stay in `ready`/`done`; help uses bound-from language; kernel `changes.approveSpec` / `approveSignoff` not `kernel.specs.*`; JSON `{ result, gate, name }`.

## Implementation Status

**Implemented.** `packages/cli/src/commands/change/approve.ts`.

- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape; no `approvalsSpec` / hashes.
- Help: spec “in ready (pending-spec-approval remains valid for drain)”; signoff “in done (…)”.
- Success text `approved spec|signoff for <name>`; tests assert no `pending-spec-approval` / `moved`.
- Errors: missing `--reason` (Commander), `ChangeNotFoundError` exit 1, `ApprovalGateDisabledError` exit 1.

**Core alignment:** CLI does not pass skippable check flags (approve is not a hop). Gate enablement is kernel-baked — matches `core:transition-checks` in-place gates.

## Discrepancies

None material.

Minor: verify “execute receives an object with **exactly** `name` and `reason`” — tests use `toHaveBeenCalledWith({ name, reason })` (exact for those keys). No spy that `kernel.specs.approveSpec` is unused; the command never references `kernel.specs`.

## Test Coverage

Success text/JSON, drain from pending states (output still `approved …`, no “moved to pending”), missing reason, unknown sub-verb, not found, wrong-state via gate-disabled error.

## Missing Tests

1. Explicit `kernel.specs.approveSpec` / `approveSignoff` **not** invoked.
2. Help-text contains bound-from `ready` / `done` (not “routes to pending”).
3. Artifact hashes not present on execute input (property assertion).

## Spec Dependency Chain

- `core:change` / `core:transition-checks` — in-place consent; CLI output does not invent pending hops.
- `cli:entrypoint` — usage errors.

No conflict with global architecture.

## Summary

- Requirements checked: **7**
- Implemented: **7**
- Partial: **0**
- Missing: **0**
- Discrepancies: **0**
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Spec: `cli:change-archive`

## Requirements Summary

`changes archive` + singular alias; `--skip-hooks pre|post|all`; `--allow-overlap`; `--allow-out-of-scope` → `impl.linksInScope`; archivable prerequisite; ArchiveChange merge/move; check-bus gerund progress; post-hook failures exit 2; JSON `stream: "change-archive"` complete only (no second unwrapped ok object); overlap invalidation listing.

## Implementation Status

**Implemented and aligned with Core.** `packages/cli/src/commands/change/archive.ts`.

| Flag / field      | CLI                                                         | Core `ArchiveChangeInput` (`archive-change.ts`)    |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `skipHookPhases`  | `Set<'pre'\|'post'\|'all'>` via `parseCommaSeparatedValues` | `ReadonlySet<ArchiveHookPhaseSelector>` same union |
| `allowOverlap`    | set only if `--allow-overlap`                               | `allowOverlap?: boolean`                           |
| `allowOutOfScope` | set only if `--allow-out-of-scope`                          | same skippable `impl.linksInScope` (spec)          |
| omitted flags     | `undefined` (not `false`)                                   | Core treats missing as default-off                 |

Progress: same `createCheckProgressPresenter` with `streamName: 'change-archive'`. Tests: gerund `Checking workspace ownership`, `Running pre hooks`, no `Executing:`; JSON NDJSON check-start/done then complete.

Post-hooks: `postHookFailures.length > 0` → `cliError(..., 2)` **before** success stdout.

`SpecOverlapError` → stderr hint `--allow-overlap`, exit 1 (live overlap, not invalidation review).

## Discrepancies

### 1. Prerequisites “naming the current state” — **possible code-wrong / test-weak**

Spec: not `archivable` → exit 1, `error:` **naming the current state**. CLI forwards `InvalidStateTransitionError` through `handleError` (`err.message`). Test only `toMatch(/error:/)` — does not assert state `done` appears. Whether Core’s message names the state is a `core:archive-change` concern; CLI does not add a local prefix.

If Core message lacks the current state: **code-wrong** (CLI or Core). Not verified here beyond the CLI mapping.

## Test Coverage

skip-hooks all/pre/post/comma; allowOverlap / allowOutOfScope omit-by-default; JSON stream; invalidated text/JSON; post-hook exit 2; not found; missing name; check progress.

No test for singular alias `change archive` vs `changes archive` in this file (registration is typically on both parents in the command tree — not re-audited here).

## Missing Tests

1. Verify: `--skip-hooks pre,post` accepted (code supports it; archive.spec has comma test).
2. Non-archivable stderr **mentions current state** (e.g. `done`).
3. JSON complete is the **only** JSON object (no trailing unwrapped `{ result: "ok" }`) — current test parses a **single** JSON line when no progress; with progress, last line is complete (good). Explicit “no second object” would lock the requirement.

## Spec Dependency Chain

- `core:archive-change` — skip-hooks / allowOverlap / allowOutOfScope **aligned**.
- `core:hook-execution-model` — skip is effects only; CLI does not bypass predicates.
- `core:transition-checks` — gerund check bus.
- `cli:command-resource-naming` — plural canonical; not re-tested in archive.spec.

## Summary

- Requirements checked: **10**
- Implemented: **10**
- Partial: **0** (state-in-message unverified)
- Missing: **0**
- Discrepancies: **0** confirmed; **1** unverified (current-state in error text)
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Spec: `skills:skill-templates-source`

## Requirements Summary (assigned + this change’s deltas)

Templates under `packages/skills/templates/` with `.md.tpl` + meta JSON; shared Handlebars; graph/search/frontmatter/optimizer/metadata (pre-existing). **This change** adds:

| Requirement                                            | Intent                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place approval gates                                | stay `ready`/`done` + human approve; no `change transition` into pending; `specd` router must not teach signoff; new-skill pending rows drain-only                                  |
| Overlap invalidation vs live archive                   | hop skills: no typical `OVERLAP_CONFLICT`; `spec-overlap-conflict` → **`/specd-design`**, not `--allow-overlap`; archive MAY list OVERLAP + `--allow-overlap` only for live overlap |
| Implementation tracking in verify/implement            | shared cookbook; verify drains open files; implement zero-open before `/specd-verify`                                                                                               |
| Archive skips only pre                                 | `--skip-hooks pre` not `all`; no post `run-hooks` after archive                                                                                                                     |
| Design review scope                                    | `review: required: yes` trigger; files from `artifacts (details):` / `affectedArtifacts`, not listed under text `review:`                                                           |
| **nextAction.command** (user focus)                    | hop skills + shared: prefer status `nextAction` / **next action:** command over local hop invention                                                                                 |
| **No LifecycleEngine injection language** (user focus) | templates must not teach ctor-injected `LifecycleEngine`                                                                                                                            |

## Implementation Status

**Implemented for the change-owned and focus items.**

| Item                               | Status                   | Evidence                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nextAction.command                 | **implemented**          | `shared.md.tpl` “Next Action engine” + `command` field; hop skills “Follow the **next action:** command recommendation” (`specd-design` L43–44); `specd-new` “Follow the `nextAction.command` recommendation” |
| Review overlap → `/specd-design`   | **implemented**          | design/implement/verify/new/archive: `spec-overlap-conflict` → `/specd-design`, `not `--allow-overlap``; archive still documents live `--allow-overlap`                                                       |
| LifecycleEngine in templates       | **implemented (absent)** | no matches under `packages/skills/templates/` for `LifecycleEngine` / `evaluateLifecycle`                                                                                                                     |
| In-place gates                     | **implemented**          | `template-workflow.spec.ts` `does not teach pending parking…`                                                                                                                                                 |
| OVERLAP vs invalidation            | **implemented**          | same file, hop skills typical-blocker group excludes `OVERLAP_CONFLICT`                                                                                                                                       |
| Archive `--skip-hooks pre`         | **implemented**          | template + test                                                                                                                                                                                               |
| Design review not a file list      | **implemented**          | “Text `review:` only has required/route/reason — not file paths”                                                                                                                                              |
| Verify drain / implement zero-open | **implemented**          | tests + templates                                                                                                                                                                                             |

`specd-new` still has a **`nextAction.targetStep` table** after “follow command”. That table is **required** by the in-place-gates requirement (pending = drain-only). It can diverge from `nextAction.command` if Core command and the table disagree; agents are told to follow `command` first when blockers exist, then the table when `review.required` is false. Not a spec contradiction.

## Discrepancies

None for templates vs this change’s skill deltas.

**Not in this spec, but related:** Core/CLI specs elsewhere still mention `LifecycleEngine` ctor injection (other partials). Skills templates do **not** carry that leftover.

## Test Coverage

`packages/skills/test/template-workflow.spec.ts` covers pending parking, overlap routing, archive skip-pre, design review header, implementation drain, optimizer/metadata (older reqs).

No assertion `expect(template).not.toContain('LifecycleEngine')`.

No assertion that hop skills contain `nextAction.command` or “next action:” **command** (they do in source).

## Missing Tests

1. Negative: all workflow templates + `shared.md.tpl` do not contain `LifecycleEngine`, `createEvaluateLifecycle`, or “inject LifecycleEngine”.
2. Positive: `specd-design` / `specd-implement` / `specd-verify` / `specd-archive` instruct following status **next action command** (not only blockers list).
3. `specd-new` table: pending rows `Drain only` already asserted; optional: table is not used when `review.required` is true (`/specd-design` regardless of state) — copy exists, no dedicated test.

## Spec Dependency Chain

- `core:transition-checks` — in-place gates; templates match stay-in-state.
- `cli:change-status` — skills assume text `review:` has no file list; CLI implements that.
- `cli:change-archive` — `--skip-hooks pre` matches CLI/Core archive phases.
- `skills:workflow-automation` — command-role copy still tested.

No leftover LifecycleEngine injection language in skills templates (unlike some **core** preview specs).

## Summary

- Requirements checked (this change + focus): **8** clusters (in-place, overlap, impl tracking, archive hooks, design review, nextAction, no LifecycleEngine, plus pre-existing template-source still in preview)
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **0**
- Spec-wrong: **0** / Code-wrong: **0** / Both: **0**
- Test gaps: **3**

---

# Cross-spec consistency (CLI/skills vs globals and Core)

| Topic                         | Change specs                                    | Code                        | Verdict                                        |
| ----------------------------- | ----------------------------------------------- | --------------------------- | ---------------------------------------------- |
| GetStatus projections         | CLI must not recompute hops                     | Status pass-through         | OK (drafted JSON hops: see status discrepancy) |
| `--next`                      | Core resolves `to: 'next'`                      | CLI passes `to: 'next'`     | OK                                             |
| Repair guide                  | GetStatus `nextAction`                          | Same                        | OK                                             |
| HookFailedError               | exit 2, no repair guide                         | `handleError` + tests       | OK                                             |
| Check bus gerunds             | CLI + archive                                   | Shared presenter            | OK; Core still emits extra event types         |
| Approve/archive flags         | skip-hooks / allow-overlap / allow-out-of-scope | Mapped to Core input shapes | **Aligned**                                    |
| Skills overlap                | `/specd-design`, not `--allow-overlap`          | Templates + tests           | OK                                             |
| LifecycleEngine in skills     | user focus: none                                | None in templates           | OK                                             |
| LifecycleEngine in Core specs | other batches                                   | N/A here                    | out of this partial                            |

---

# Batch totals

| Spec                          | Reqs | Impl | Partial | Missing impl | Disc. | spec-wrong | code-wrong | both | Notable test gaps                                                                 |
| ----------------------------- | ---: | ---: | ------: | -----------: | ----: | ---------: | ---------: | ---: | --------------------------------------------------------------------------------- |
| cli:change-status             |   16 |   15 |       1 |            0 |     1 |          0 |          1 |    0 | drafted command override; DEPS label; verify nextAction; artifact-review-required |
| cli:change-transition         |   14 |   13 |       1 |            0 |     2 |          1 |          0 |    1 | JSON failure complete record                                                      |
| cli:change-approve            |    7 |    7 |       0 |            0 |     0 |          0 |          0 |    0 | specs.\* not called                                                               |
| cli:change-archive            |   10 |   10 |       0 |            0 |     0 |          0 |          0 |    0 | error names current state                                                         |
| skills:skill-templates-source |  8\* |    8 |       0 |            0 |     0 |          0 |          0 |    0 | LifecycleEngine absence                                                           |

\*Focus + change-delta clusters, not every pre-existing template-source requirement line-by-line (frontmatter/optimizer/graph snippet still present in preview and previously covered by `template-workflow.spec.ts`).

**Highest-priority findings for this batch**

1. **code-wrong:** drafted status JSON may still advertise `availableTransitions` (text already suppresses).
2. **spec-wrong (low):** repair-guide `error: cannot transition to <step>` sketch vs Core `err.message`.
3. **both (low):** CLI still pretty-prints Core `requires-check` / `task-completion-failed` beside the gerund check bus.
4. **test gaps:** status verify scenarios (labels, nextAction verify vs implement, drafted command override); transition JSON failure stream; skills negative LifecycleEngine test.

**Approve/archive skip-hooks and allow-overlap:** CLI forwards the same selector sets and optional booleans Core defines; omitted flags are omitted (not forced false). Skills archive uses `--skip-hooks pre` only, matching Core post-hooks inside `ArchiveChange`.

---

## Partial file: `_partial-globals.md`

# Spec-compliance partial: project-wide globals

- **Mode:** change `workflow-transition-checks`
- **Batch:** `_partial-globals.md`
- **Change specs (via `changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Disk specs (`specs show`, not in change):** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (docs only if public API/docs drifted)
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`, `coverageComplete: true`. Code-graph relations are empty (`fileCount: 0`, `IMPORTS: 0`, `languages[0]`, coverage reason `no-language-adapter`). Symbol search still resolved `Logger` and `evaluateLifecycle`. `graph impact --file` failed (`no indexed file matches`). `graph impact --symbol Logger` returned `not_found`. File-level import checks used source reads after graph.

**User-enforced architecture constraint (audited):** architecture spec remains package-agnostic. Ambient `Logger` is the only inner-layer import exception. Spec MUST NOT mention `evaluateLifecycle`, core file paths, or `LifecycleEngine`.

---

## `default:_global/architecture` (change preview)

### Requirements Summary

| ID  | Requirement                                                                                   | Change delta?                 |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| A1  | Layered structure: `domain` / `application` / `infrastructure` with inner-never-imports-outer | No (baseline)                 |
| A2  | Domain layer is pure (no I/O); **exception: ambient Logger**                                  | **Yes** — exception paragraph |
| A3  | Application uses ports only; Logger import is not an infrastructure adapter                   | **Yes** — Logger sentence     |
| A4  | Rich domain entities / typed errors                                                           | No                            |
| A5  | Value objects expose behaviour, not structure                                                 | No                            |
| A6  | Ports with shared construction are abstract classes; methods not property signatures          | No                            |
| A7  | Stateless domain operations are plain functions in `domain/services/`                         | No                            |
| A8  | Manual DI at package entry; no IoC                                                            | No                            |
| A9  | `composition/` only layer that imports `infrastructure/`; kernel / factories                  | No                            |
| A10 | YAML validated at infrastructure boundary                                                     | No                            |
| A11 | Adapter packages contain no business logic                                                    | No                            |
| A12 | No circular package dependencies                                                              | No                            |
| A13 | Curated public barrels; hosts use SDK                                                         | No                            |

**Verify.md (change):** added scenarios “Domain imports ambient Logger” and “Application imports ambient Logger”.

**Package-agnostic / forbidden terms:** change `spec.md` / `verify.md` deltas and merged preview **do not** mention `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...` paths. Disk `specs/_global/architecture/spec.md` likewise has none of those terms. **PASS** for the user constraint.

### Implementation Status

| Req                | Status                                           | Evidence                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1                 | **Mostly implemented** (pre-existing)            | Core uses `domain/`, `application/`, `infrastructure/`, `composition/`. Code also has `observability/` (sibling of `domain`), not named in the spec.                                                                                                                                                                                                      |
| A2                 | **Implemented as specified, via sibling module** | Domain has no `node:fs` / net imports in this audit. Sole domain production `Logger` import: `packages/core/src/domain/services/lifecycle-verdict.ts` → `../../observability/logger.js`. **No** `src/domain/**` import from `application/` except `domain/errors` exporting `DeltaApplicationError` (name collision, not a layer import).                 |
| A3                 | **Implemented**                                  | Use cases import `Logger` from `application/logger.js` (re-export). Use cases still take ports via constructors; Logger is not a constructor port.                                                                                                                                                                                                        |
| A4–A6, A8, A10–A13 | **Not re-litigated**                             | Outside this change’s architecture delta. No contradiction found with the Logger exception.                                                                                                                                                                                                                                                               |
| A7                 | **Implemented for new lifecycle verdict**        | `evaluateLifecycleVerdict` is a plain function in `domain/services/lifecycle-verdict.ts`. `domain/services/lifecycle-engine.ts` is a named re-export barrel of that module (not a class). Application `evaluateLifecycle` lives in `application/services/lifecycle-evaluation.ts` (guidance assembly) — architecture does not name that symbol (correct). |
| A9                 | **Implemented**                                  | `createKernel` in `composition/kernel.ts` is the composition root that calls `Logger.setImplementation(createDefaultLogger(...))`. `composition-resolver.ts` imports infrastructure adapters (allowed: it is `composition/`). `createKernelBuilder.build()` delegates to `createKernel` (same wiring).                                                    |

**Observability vs `application/logger`:**

- Canonical implementation: `packages/core/src/observability/logger.ts` + `logger.port.ts`.
- Compatibility shims: `application/logger.ts` and `application/ports/logger.port.ts` re-export observability.
- Public barrel `packages/core/src/public.ts` exports `Logger` / `LoggerPort` from the **application** shims, not `observability/` (keeps the extra folder off the documented package layout in the spec).
- Domain **must** import observability (or an equally non-`application/` path). Importing `application/logger.js` from `src/domain/` would trip `no-restricted-imports`.
- Application, infrastructure, and composition generally import the application shim (e.g. `FsChangeRepository` → `../../application/logger.js`, `kernel.ts` → `../application/logger.js`). That is legal under eslint (infra/composition may import application) but is a second path to the same ambient facade.

### Discrepancies

1. **Three layers vs `observability/` (spec vs code)**
   - **Spec might be right:** staying package-agnostic forbids naming `observability/` or core paths; “import ambient Logger” is the exception, location is an implementation detail.
   - **Code might be right:** a fourth folder is how the exception is realized without weakening `domain ↛ application`.
   - **Both:** A1 still says packages “must be organized in three layers”; a sibling `observability/` is not described. Not a user-constraint violation (no core paths in the spec).

2. **“Each package wires the implementation at its composition root” (architecture A2 text) vs process-level wiring**
   - Only `@specd/core` `createKernel` calls `Logger.setImplementation`. CLI, code-graph, SDK consume `@specd/core`’s static `Logger`. No other package composition root wires a logger.
   - **Spec might be right:** every package with a composition root should assign an impl (CLI/code-graph would be incomplete).
   - **Code might be right:** logging change text says each package _chooses_ how to use Logger; one process-level assignment in kernel is enough.
   - Tension is **inside this change** (architecture wording vs logging wording).

3. **`LoggerPort` canonical file is `observability/logger.port.ts`**
   - Architecture: ports live in `application/ports/`.
   - Code: types defined in observability, re-exported from `application/ports/logger.port.ts`.
   - **Spec might be right:** move the interface into `application/ports` and have observability import the port (domain importing a port from application would **fail** eslint — so this would force either an eslint exception or keeping types in observability).
   - **Code might be right:** port beside the ambient facade avoids domain → application imports.

4. **Architecture `## Spec Dependencies` still `*none*`** while the exception body links to `default:_global/logging`. Logging’s change delta **does** depend on architecture. One-way documented dependency + reverse prose link. Documentation-cycle smell, not a runtime cycle.

No discrepancy on forbidden symbols in the architecture spec itself.

### Test Coverage

| Scenario (verify.md)                    | Coverage                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain imports infrastructure / node:fs | Enforced by eslint `no-restricted-imports` + TS; not a dedicated vitest.                                                                                                                                                                                                            |
| Domain imports ambient Logger           | **No** lint/unit test that domain _may_ import Logger. Production import exists and compiles. Domain tests import Logger from **`application/logger.js`** (`test/domain/services/lifecycle-engine.spec.ts`) — tests are not under `src/domain/` so eslint layer rules do not apply. |
| Application imports Logger              | Exercised indirectly by use-case tests that spy on `Logger.debug`.                                                                                                                                                                                                                  |
| Use case receives port via constructor  | Pre-existing; not Logger.                                                                                                                                                                                                                                                           |
| Other architecture scenarios            | Pre-existing eslint/tsc; not expanded by this change.                                                                                                                                                                                                                               |

`packages/core/test/application/logger-port.spec.ts` covers no-throw default impl and delegation after `setImplementation` — supports A2/A3 observability more than hexagonal structure.

### Missing Tests

- No test that a **domain** module importing `application/logger` is a lint error, while importing observability (or the public `Logger` type-only) is allowed.
- No compiler/eslint fixture for “Logger is not treated as infrastructure adapter”.
- Domain lifecycle tests live in `lifecycle-engine.spec.ts` while the implementation file is `lifecycle-verdict.ts` (conventions file-pairing; see conventions section).

### Spec Dependency Chain

- Architecture (change): **none** listed.
- Downstream in this change: `default:_global/logging` (preview) depends on architecture; several core specs (`core:transition-checks`, `core:lifecycle-engine`, `core:change`, …) depend on architecture per change `specDependsOn`.
- Disk `default:_global/testing` depends on architecture (layer unit vs integration).
- Disk `default:_global/eslint` does **not** list architecture as a spec dependency, but its “Layer boundary enforcement” requirement restates architecture import rules.

### Summary counts — architecture

|                                                       | Count                                |
| ----------------------------------------------------- | ------------------------------------ |
| Requirements reviewed                                 | 13                                   |
| Implemented (change-relevant A2/A3/A7/A9)             | 4 (with observability layout caveat) |
| Discrepancies                                         | 4                                    |
| Missing tests                                         | 3                                    |
| Blocking vs user constraint (forbidden terms in spec) | 0                                    |

---

## `default:_global/logging` (change preview)

### Requirements Summary

| ID  | Requirement                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | Console-compatible methods: `log`, `info`, `debug`, `warn`, `error`                                                                                                      |
| L2  | `log()` is an alias of `info()`                                                                                                                                          |
| L3  | Minimal **console** impl: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`                                                             |
| L4  | Level semantics: trace < debug < info < warn < error < fatal                                                                                                             |
| L5  | Avoid direct `console.*` in production; use logging abstraction                                                                                                          |
| L6  | **Ambient Logger** (change add): composition assigns impl; **no-op before wiring**; any layer may import; not for control flow / persistence; each package chooses usage |

Disk `specs/_global/logging/spec.md` has L1–L5 only (`Spec Dependencies: none`). Change preview adds L6 and a dependency on architecture.

### Implementation Status

| Req | Status                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Implemented**                                              | `LoggerPort` in `observability/logger.port.ts` includes those methods plus `fatal`, `trace`, `isLevelEnabled`, `child`. Ambient `Logger` static methods match.                                                                                                                                                                                                        |
| L2  | **Implemented in Pino adapter; facade is pass-through**      | `PinoLogger.log` calls `this.logger.info(...)`. Ambient `Logger.log` calls `impl.log`, not `impl.info`. Alias holds if every impl aliases; a non-aliasing impl would split `log` vs `info`.                                                                                                                                                                           |
| L3  | **N/A in code**                                              | No console-backed logger. `PinoLogger` uses pino levels; **no** `[FATAL]` / `[TRACE]` prefixes.                                                                                                                                                                                                                                                                       |
| L4  | **Partially implemented**                                    | `LogLevel` union: `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal' \| 'silent'`. Extra `silent` not in spec. Ordering not encoded as a comparable enum. `fatal` does **not** terminate the process (pino fatal only).                                                                                                                                    |
| L5  | **Mostly; CLI still uses `console`**                         | Core production logging uses `Logger`. CLI: `console.warn` in `load-config.ts`, `cli-context.ts`; `console.error` in `spec-preview.ts`.                                                                                                                                                                                                                               |
| L6  | **Implemented for no-op + ambient use; wiring is core-only** | `NullLogger` default; `setImplementation` / `resetImplementation`. Domain `lifecycle-verdict.ts` logs via ambient `Logger.debug` with **no** logger constructor argument. Kernel assigns pino at `createKernel`. `@specd/cli` / `@specd/code-graph` do not call `setImplementation` (they use core’s static after kernel boot, or no-op if kernel was never created). |

`Logger.isLevelEnabled('debug')` in `packages/cli/src/handle-error.ts` gates whether a stack is written to **stderr**. That is diagnostic output shaping, not domain control flow. Borderline vs “MUST NOT be used for control flow”.

### Discrepancies

1. **No-op MUST NOT write to console (verify L6)**
   - **Code:** `NullLogger` methods are empty — no `console` calls.
   - **Tests:** `logger-port.spec.ts` only asserts `not.toThrow()`; does **not** spy `console`.
   - Spec correct / tests incomplete, or tests sufficient if empty methods are accepted as proof.

2. **“Each package wires the implementation” (architecture) vs “each package chooses” (logging L6)**
   - See architecture discrepancy 2. Logging text matches the code better.

3. **L3 console mapping**
   - **Spec might be right:** a console adapter should exist for “minimal implementations”.
   - **Code might be right:** pino is not a console adapter; L3 does not apply.
   - No in-repo console logger to violate or satisfy L3.

4. **L5 CLI `console.*`**
   - **Spec might be right:** migrate warnings/errors to `Logger`.
   - **Code might be right:** bootstrapping / user-facing CLI stderr is excluded (verify says “excluding bootstrapping or infrastructure adapters”). CLI warnings are arguably bootstrap UX, not core domain.

5. **Public dual module**
   - Tests and most packages import `@specd/core` / `application/logger.js`. Domain production uses `observability/logger.js`. Same class; two import graphs. Logging spec is generic (good) and does not require a single path.

6. **`LogLevel` includes `silent`**
   - Extension beyond spec. Harmless if treated as implementation; spec-incomplete if `silent` is part of the contract.

### Test Coverage

| Scenario                           | Coverage                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic methods available            | Type-level on `LoggerPort`; no interface snapshot test.                                                                                                                                       |
| `log()` calls `info()`             | **Missing** on ambient `Logger`. Pino `log` → `info` untested explicitly.                                                                                                                     |
| Fatal/trace prefixes               | **Missing** (no console impl).                                                                                                                                                                |
| Severity ordering                  | **Missing**.                                                                                                                                                                                  |
| Console usage lint/review          | ESLint does not ban `console.*`.                                                                                                                                                              |
| Logger safe before wiring          | Partial: no-throw for `info`/`error` only; not all methods; no console spy.                                                                                                                   |
| Ambient import without logger port | **Implemented in production** (`evaluateLifecycleVerdict`); tests spy `Logger` in `lifecycle-engine.spec.ts` / use-case specs; they do not assert the function signature omits a logger port. |

`packages/core/test/infrastructure/logging/pino-logger.spec.ts`: callback destination, `child`, `isLevelEnabled` — infrastructure adapter, not ambient facade.

### Missing Tests

- `Logger.log` vs `Logger.info` identical delegation.
- All ambient methods no-throw + no `console` I/O before `setImplementation`.
- `resetImplementation` restores no-op (partially implied).
- Console `[FATAL]`/`[TRACE]` if a console adapter is claimed.
- Package-level wiring tests for CLI/code-graph (only if L6 is interpreted as per-package `setImplementation`).

### Spec Dependency Chain

- Logging (change) → `default:_global/architecture` (ambient exception).
- Disk logging → none.
- Architecture does not list logging as a spec dependency.

### Summary counts — logging

|                       | Count                                                     |
| --------------------- | --------------------------------------------------------- |
| Requirements reviewed | 6                                                         |
| Implemented           | 4 (L1, L2 with caveat, L6 with wiring caveat, L4 partial) |
| N/A / untested        | L3                                                        |
| Discrepancies         | 6                                                         |
| Missing tests         | 5                                                         |

---

## `default:_global/conventions` (disk — conformance of this change)

### Requirements Summary

TypeScript strict/ESM/named exports/kebab-case/`no any`/explicit public return types/`SpecdError`/underscore backing fields/lazy loading/immutability.

### Implementation Status (change-touched files)

| Check                                          | Result                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kebab-case                                     | `lifecycle-verdict.ts`, `observability/logger.ts`, `logger.port.ts` — **pass**                                                                                                                                                                                                                                                        |
| Named exports                                  | `export class Logger` — **pass**; `application/logger.ts` re-export — **pass**                                                                                                                                                                                                                                                        |
| Tests in `test/` mirroring `src/`              | Logger tests: `test/application/logger-port.spec.ts` vs source `src/observability/logger.ts` — **mismatch**. Lifecycle tests: `test/domain/services/lifecycle-engine.spec.ts` vs `src/domain/services/lifecycle-verdict.ts` (+ re-export `lifecycle-engine.ts`) — **partial** (matches barrel name, not primary implementation file). |
| Explicit return types on public Logger methods | **pass**                                                                                                                                                                                                                                                                                                                              |
| No default export                              | **pass**                                                                                                                                                                                                                                                                                                                              |
| Layer barrels                                  | `domain/services/index.ts` pre-existing; `observability/index.ts` added as a barrel under a non-root folder — conventions allow layer barrels only for domain/application/composition when >50 modules. **`observability/index.ts` is an extra barrel** not listed in the exception.                                                  |

### Discrepancies

1. **Test path vs source path for Logger**
   - Spec: `change.ts` → `test/.../change.spec.ts`.
   - Code: tests sit under `application/` because of the shim.
   - Spec right: add `test/observability/logger.spec.ts`. Code right: testing the public application re-export is what consumers use.

2. **`observability/index.ts` barrel**
   - Spec might be right: delete barrel, import `logger.js` directly (domain already does).
   - Code might be right: small package-local index; conventions exception is incomplete.

3. **JSDoc file-level eslint-disable** on `observability/logger.ts` (`NullLogger` methods) and `lifecycle-verdict.ts` (private helpers) — conflicts with eslint/docs JSDoc-on-everything (see eslint). Conventions themselves do not require JSDoc (docs spec does).

### Test Coverage / Missing Tests

Conventions are enforced by eslint/tsc more than vitest. No new convention-specific tests required for this change beyond pairing filenames.

### Spec Dependency Chain

- Conventions → `default:_global/error-handling-conventions`.
- Testing and eslint depend on conventions.

### Summary counts — conventions

|                                         | Count                                  |
| --------------------------------------- | -------------------------------------- |
| Requirements reviewed (change-relevant) | 8                                      |
| Conformance issues                      | 2 (test pairing; observability barrel) |
| Missing tests                           | 0 (lint-enforced)                      |

---

## `default:_global/testing` (disk — conformance of this change)

### Requirements Summary

Vitest; `test/` mirror; unit tests mock ports; full port mocks; infrastructure integration with tmpdir cleanup; `given/when/then` names; no snapshots.

### Implementation Status

| Check              | Result                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest             | `logger-port.spec.ts` and `pino-logger.spec.ts` use vitest — **pass**                                                                                                                                                                  |
| Unit tests no fs   | Logger proxy tests mock `LoggerPort` — **pass**                                                                                                                                                                                        |
| Full port mock     | `logger-port.spec.ts` implements all `LoggerPort` methods — **pass**                                                                                                                                                                   |
| Integration tmpdir | `pino-logger.spec.ts` uses callback/`pino.destination(1)` for empty destinations — **not** tmpdir-based; acceptable for a stream logger                                                                                                |
| Test descriptions  | Logger tests: `'does not throw when using default null implementation'` — **not** `given/when/then`                                                                                                                                    |
| Snapshots          | No `toMatchSnapshot` under `packages/core/test` — **pass**                                                                                                                                                                             |
| Domain unit tests  | `lifecycle-engine.spec.ts` is unit-level; imports application `evaluateLifecycle` and test helpers from `test/application/use-cases/helpers.ts` — allowed for tests; does not violate “unit tests must not touch filesystem” by itself |

### Discrepancies

1. **Naming pattern** for new/updated logger tests vs testing spec. Widespread pre-existing debt; this change’s logger tests continue it.

2. **`pino-logger.spec.ts` `createDefaultLogger([])`** uses stdout destination (`pino.destination(1)`). Testing spec: unit tests must not touch fs/network/processes; this is an **infrastructure** test writing to stdout — grey area (I/O), not tmpdir leak.

### Missing Tests

Same as logging section. Testing spec also wants every invariant-enforcing domain method tested: `evaluateLifecycleVerdict` is covered in `lifecycle-engine.spec.ts` (including Logger spy usage) — **present**, naming/file pairing aside.

### Spec Dependency Chain

- Testing → architecture, conventions.

### Summary counts — testing

|                                           | Count                               |
| ----------------------------------------- | ----------------------------------- |
| Requirements reviewed                     | 6                                   |
| Conformance issues                        | 2 (naming; stdout I/O in pino test) |
| Missing tests (from logging/architecture) | 5                                   |

---

## `default:_global/eslint` (disk — conformance of this change)

### Requirements Summary

No `any`; named exports; explicit public return types; kebab-case; JSDoc on all functions/classes; **layer `no-restricted-imports`**.

### Implementation Status — `no-restricted-imports`

Root `eslint.config.js`:

- `packages/*/src/domain/**`: forbid `**/application/**`, `**/infrastructure/**`, `**/composition/**`.
- `application/**`: forbid infrastructure, composition.
- `infrastructure/**`: forbid composition.
- **No** exception pattern for Logger or `observability/**`.
- **No** restriction on `observability/` from domain.

**This matches the intended exception:** domain may import ambient Logger **without** importing `application/`. There is **no** eslint hole allowing `domain → application/logger`.

If an author followed the spec literally and imported `Logger` from `../application/logger.js` inside `src/domain/`, **eslint would correctly fail**. Production domain code uses observability — **conformant**.

### Discrepancies

1. **JSDoc requirement vs file eslint-disable**
   - `observability/logger.ts`: file-level disable of `jsdoc/require-jsdoc` (and param/returns) while `Logger` public methods still have JSDoc; `NullLogger` methods do not.
   - `lifecycle-verdict.ts`: disable for private helpers.
   - **Spec might be right:** document helpers or drop the disable.
   - **Code might be right:** eslint spec is too strict for private engine helpers; architecture/logging do not require JSDoc on NullLogger.

2. **eslint spec `## Spec Dependencies` lists conventions only**, not architecture, while it encodes architecture layers. Pre-existing. This change does **not** need an eslint delta if observability stays outside restricted groups.

3. **eslint does not forbid `console.*`** despite logging L5 / verify “linting or code review check”. Logging verify is SHOULD-level for console. Not an eslint-spec miss unless logging is considered in scope for eslint.

### Test Coverage / Missing Tests

Layer scenarios in eslint verify.md are enforced by the config, not vitest. No missing eslint _rule_ for this change.

### Spec Dependency Chain

- ESLint → conventions (disk). Architecture is an undeclared peer.

### Summary counts — eslint

|                                 | Count                                                  |
| ------------------------------- | ------------------------------------------------------ |
| Requirements reviewed           | 6                                                      |
| Layer rules vs Logger exception | **Conformant**                                         |
| Discrepancies                   | 2 (JSDoc disables; undeclared architecture dependency) |
| Missing tests                   | 0                                                      |

---

## `default:_global/docs` (disk — only if public API/docs drifted)

### Scope decision

This change specifies **ambient `Logger`** as a cross-layer observability surface and already **exports** `Logger` / `LoggerPort` from `@specd/core` `"."`. `docs/` has **zero** hits for `Logger`, `LoggerPort`, or `observability`.

- **No stale lifecycle/logging doc contract** was found (nothing in `docs/` documents the old or new Logger API).
- **No** template-variable / listing-shape / CLI-reference edits are implied by the **logging/architecture** deltas alone (CLI check _output_ belongs to CLI/lifecycle specs, not this batch).

### Discrepancy (optional, docs-spec lens)

Docs spec: new public ports under `application/ports/` get `docs/core/` entries. `LoggerPort` is re-exported from `application/ports`. If reviewers treat L6 as **newly specified public API**, `docs/core/` silence is a **same-change documentation gap**. If Logger was already public and undocumented, this is **pre-existing** and not introduced by the delta text.

**Recommendation for parent report:** do **not** fail the globals batch on docs unless the change is explicitly selling Logger as a new integrator contract. Flag as **INFO / optional**.

### Summary counts — docs

|                                     | Count    |
| ----------------------------------- | -------- |
| Drift of existing docs              | 0        |
| Optional undocumented public Logger | 1 (INFO) |

---

## Cross-cutting: domain/services vs application; observability vs application/logger

| Check                                        | Result                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/domain/services` imports `application/` | **None** (production)                                                                       |
| Domain Logger import                         | **Only** `lifecycle-verdict.ts` → `observability/logger.js`                                 |
| `evaluateLifecycle`                          | Application wrapper over `evaluateLifecycleVerdict`; **not** in architecture spec (correct) |
| `LifecycleEngine`                            | **No** class; `lifecycle-engine.ts` re-exports verdict types/functions                      |
| `application/logger.ts`                      | One-line re-export of observability                                                         |
| `no-restricted-imports`                      | Domain cannot use the application shim; observability is the allowed path                   |

---

## Overall summary counts

| Spec                                    | Reqs reviewed | Discrepancies | Missing tests | Blocking (user architecture constraint) |
| --------------------------------------- | ------------- | ------------- | ------------- | --------------------------------------- |
| `default:_global/architecture` (change) | 13            | 4             | 3             | **0**                                   |
| `default:_global/logging` (change)      | 6             | 6             | 5             | 0                                       |
| `default:_global/conventions` (disk)    | 8 relevant    | 2             | 0             | 0                                       |
| `default:_global/testing` (disk)        | 6             | 2             | 5 (shared)    | 0                                       |
| `default:_global/eslint` (disk)         | 6             | 2             | 0             | 0                                       |
| `default:_global/docs` (disk)           | scoped        | 0–1 INFO      | 0             | 0                                       |

**Highest-signal findings for the parent report:**

1. Architecture **preview is package-agnostic** and **does not** mention `evaluateLifecycle`, `LifecycleEngine`, or core file paths — user constraint **held**.
2. Domain **does not** import application; ambient Logger lives in **`observability/`**; eslint layer rules **do not** need a Logger exception if that layout is kept.
3. Dual surface `observability/*` vs `application/logger.ts` is the main implementation smell vs “ports live in application/ports”.
4. Ambient no-op is implemented; tests do not prove “no console”; `log()`↔`info()` untested on the facade.
5. Only `createKernel` wires `Logger.setImplementation`; architecture vs logging wording disagree on per-package wiring.
6. Docs: no Logger documentation; optional gap only if L6 is a new public API.
