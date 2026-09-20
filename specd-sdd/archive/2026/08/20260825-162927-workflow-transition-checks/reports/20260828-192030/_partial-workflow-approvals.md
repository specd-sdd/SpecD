# Partial audit: workflow / approvals / schema extras

**Mode:** change `workflow-transition-checks` (assigned batch)  
**Graph:** `stale: false`, `contentFresh: true` (`lastIndexedAt` 2026-08-28T17:21:07Z)  
**CLI:** `node packages/cli/dist/index.js`  
**Sources:** `changes spec-preview` for the six spec IDs; implementation via `graph search` / `graph impact` then targeted reads.  
**Read-only:** no code or spec files modified.

**Focus applied:** pending states drain-only; approval as checks not pending hops; hooks as check `execute`; schema `workflow[]` extras vs protocol membership.

**Consistency lens:** `default:_global/architecture` (domain vs application vs composition), `default:_global/logging`, `default:_global/testing`; deps `core:transition-checks`, `core:composition`, `core:kernel`, `HookRunner` port.

---

# Spec: `core:workflow-model`

## Requirements Summary

| ID    | Requirement                                  | Normative gist                                                                                                                                                            |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1  | Step names reference domain lifecycle states | `workflow[]` is extras lookup onto `ChangeState`. Omit ≠ delete protocol. Unknown `step` → `SchemaValidationError` at `buildSchema`. `workflowStep` null means no extras. |
| WM-2  | Step semantics                               | Designing / implementing / verifying outcomes / archiving atomic. Drift → designing.                                                                                      |
| WM-3  | Requires-based gating                        | `workflow.requires` with `to = effective`; complete **or** skipped; status and execute share evaluation.                                                                  |
| WM-4  | Task completion gating                       | `workflow.taskCompletion` via `CountTasks` / `createWorkflowTaskCompletion`; subset of `requires`; skip missing file / invalid regex.                                     |
| WM-5  | Step availability evaluation                 | `LifecycleEngine` / predicate projections; `GetStatus` reports; `CompileContext` MUST NOT evaluate hops.                                                                  |
| WM-6  | Workflow array order                         | Display + progress axis (`buildAxis` / `AXIS_FALLBACK` splice). `to=designing` is redesign; `archiving→archivable` is recovery.                                           |
| WM-7  | Step-to-state mapping                        | Step name IS target `ChangeState`.                                                                                                                                        |
| WM-8  | Hook execution at step boundaries            | Matching `run:` effects; pre `to=step`; post `from=step` + `along=forward`; before persist. Archive via operation `archive`.                                              |
| WM-9  | Two execution modes                          | Auto-run unless `skipHookPhases`; not a second engine.                                                                                                                    |
| WM-10 | Requires are artifact IDs                    | Not step names; `buildSchema` rejects step-as-require.                                                                                                                    |

## Implementation Status

| ID    | Status                                    | Evidence                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WM-1  | Implemented                               | `buildSchema` rejects unknown steps (`workflow step '…' is not a valid lifecycle state`); `Schema.workflowStep` Map lookup; `VALID_TRANSITIONS` keys remain protocol. `lifecycle-engine.spec.ts`: omit `implementing` → no extras row, hop still protocol-evaluated. |
| WM-2  | Partial                                   | Routing outcomes live in skills/guidance + `TransitionChange` invalidate-on-designing. No dedicated domain enum for `implementation-failure` vs `artifact-review-required` as transition inputs.                                                                     |
| WM-3  | Implemented                               | `domain/checks/workflow-requires.ts`: skip if no row or empty requires; fail unless `complete`/`skipped`. Shared via bindings on `GetStatus` / `TransitionChange`.                                                                                                   |
| WM-4  | Implemented                               | `createWorkflowTaskCompletion` + `CountTasks`; `buildSchema` subset + `hasTasks`.                                                                                                                                                                                    |
| WM-5  | Implemented                               | `GetStatus` copies engine `availableTransitions` / `availableSteps`. `CompileContext` JSDoc: hook instructions are `GetHookInstructions`, not this UC. `compile-context.spec.ts` asserts no `stepAvailable`.                                                         |
| WM-6  | Implemented (in `core:transition-checks`) | `buildAxis` in `transition-checks.ts`; redesign/recovery classified there.                                                                                                                                                                                           |
| WM-7  | Implemented                               | `TransitionChange` `input.to` is `ChangeState`.                                                                                                                                                                                                                      |
| WM-8  | Implemented                               | Bindings: `hook.post` forward + `before-persist`/`abort`; `hook.pre` `*` except recovery. `HookEffectCheck.execute` → `RunStepHooks`.                                                                                                                                |
| WM-9  | Implemented                               | `skipHookPhases` on effect checks; predicates still run (`transition-change.spec.ts`).                                                                                                                                                                               |
| WM-10 | Implemented                               | `requires` typed as artifact IDs; `buildSchema` validates IDs against artifacts.                                                                                                                                                                                     |

## Discrepancies

1. **`hasTasks` vs `taskCompletionCheck` (spec-wrong vs spec-internal)**  
   WM-4 / `WorkflowStep` JSDoc require listed IDs to declare `taskCompletionCheck`. `core:schema-format` and `buildSchema` require `hasTasks: true` only. Code follows schema-format. An artifact can have `hasTasks` without `taskCompletionCheck`.
   - If specs should be identical: **workflow-model spec-wrong**.
   - If both flags must hold: **code-wrong** (missing `taskCompletionCheck` check).

2. **`core:schema-format` Workflow vs WM-3 (spec-wrong on schema-format)**  
   Schema-format says requires must be `complete`. Workflow-model and `workflow-requires` allow `skipped`. Code matches workflow-model.

3. **Step-semantics scenarios (both / underspecified in code)**  
   Verify scenarios (`implementation-failure` → implementing, `artifact-review-required` → designing) are agent/skill routing, not `TransitionChange` inputs. Code implements designing-return invalidation, not named verification outcomes. Spec reads as product behavior; core does not encode those labels.

4. **Architecture**  
   Domain stubs (`workflowRequires.execute`) vs application `create*` I/O: matches hexagonal split. Axis/`along` live in `transition-checks`, not this spec’s files — acceptable dependency, not a layering break.

## Test Coverage

- Unknown step: `build-schema.spec.ts` (`reviewing`).
- Omit implementing extras: `lifecycle-engine.spec.ts`.
- Requires complete/skipped/incomplete: domain + transition/get-status suites.
- Task completion + CountTasks: `transition-change.spec.ts`, `get-status.spec.ts`, `workflow-check-factories.spec.ts`.
- CompileContext no hop field: `compile-context.spec.ts`.
- Hooks auto/skip/along: `transition-change.spec.ts`, `archive-change.spec.ts`.

## Missing Tests

- `buildSchema` fixture: `workflow[]` lists only `designing`+`ready` and **asserts** `implementing` remains a `ChangeState` (engine test covers extras; schema-format verify scenario is thin).
- Explicit `workflow.requires` skip when `workflowStep(to)===null` (implied by omit-implementing engine test, not named at check unit).
- Named verification-outcome routing (if those WM-2 scenarios are in-scope for core).
- `requiresTaskCompletion` artifact with `hasTasks` but no `taskCompletionCheck` (documents intended invariant).

## Spec Dependency Chain

- Declared: `core:transition-checks` (axis, check ids, along).
- Implicit: `core:change` (states), `core:schema-format` / `core:build-schema`, `core:hook-execution-model`, `core:compile-context`, `core:get-status`.
- **Consistency:** WM extras-vs-protocol matches `transition-checks` / design. Tension with schema-format `requires: complete` only and `hasTasks` vs `taskCompletionCheck`.

## Summary

- Requirements: **10**
- Implemented: **8** (WM-2 partial counted separately)
- Partial: **1** (WM-2)
- Missing: **0**
- Discrepancies: **3** (1 spec-internal/code fork, 1 schema-format vs this spec, 1 semantic routing)
- Test gaps: **4**

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID    | Requirement                           | Normative gist                                                                                                       |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------- | ---- | --------------------------------------------------------- |
| HE-1  | Two hook types                        | `instruction:` vs `run:`; mutually exclusive at schema.                                                              |
| HE-2  | Explicit external hooks               | `external: { type, config }`; `HookRunner` shell-only; unknown type fails.                                           |
| HE-3  | External hooks follow phase semantics | Same pre fail-fast / post collect-or-abort as shell.                                                                 |
| HE-4  | instruction hooks passive             | Skipped by Transition/Archive/`RunStepHooks`; `GetHookInstructions` only; not predicates/effects.                    |
| HE-5  | Default execution                     | Effects after predicates; binding `phase`/`onFailure`; `RunStepHooks` ctor dep of hook checks; no id-switch launch.  |
| HE-6  | Two modes for run                     | Standalone fail-fast pre / fail-soft post; UC uses binding `onFailure`. Transition `hook.post` abort before persist. |
| HE-7  | Change entity does not execute hooks  | Application layer; auto-run still required.                                                                          |
| HE-8  | Manual skipHooks                      | Transition: `source.pre                                                                                              | post`, `target.pre | post`, `all`. Archive: `pre | post | all`. `source.pre`/`target.post` no-ops on current table. |
| HE-9  | Pre-hook failure                      | Fail-fast; Transition/Archive `HookFailedError`; standalone CLI 2.                                                   |
| HE-10 | Post-hook failure                     | Binding `abort` vs `collect`. Archive post collect after persist.                                                    |
| HE-11 | Ordering                              | Schema hooks then project overrides, declaration order.                                                              |
| HE-12 | Template expansion                    | `change.name/path`, `project.root`; no `change.workspace`; unknown left literal; shell-escaped.                      |

## Implementation Status

| ID      | Status      | Evidence                                                                                                                                                                     |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HE-1    | Implemented | `HookEntry` union; schema YAML Zod.                                                                                                                                          |
| HE-2    | Implemented | `RunStepHooks` + `ExternalHookRunner` map; `ExternalHookTypeNotRegisteredError`.                                                                                             |
| HE-3    | Implemented | Same `HookEffectCheck` / `_executeHooks` phase loops.                                                                                                                        |
| HE-4    | Implemented | `_collectHooks` filters run/external; instructions via `GetHookInstructions`.                                                                                                |
| HE-5    | Implemented | `createHookPre`/`createHookPost({ runStepHooks })`; `TransitionChange._executeEffect` calls `binding.check.execute` (no `hook.pre` switch). Bindings in `check-bindings.ts`. |
| HE-6    | Implemented | `RunStepHooks` phase policy vs effect `onFailure` + `throwHookFailed`.                                                                                                       |
| HE-7    | Implemented | `Change` has no `HookRunner`.                                                                                                                                                |
| HE-8    | Implemented | `HookEffectCheck` skip set: `all`, archive `pre`/`post`, transition `target.pre`/`source.post` only. Tests for no-op selectors.                                              |
| HE-9–10 | Implemented | Archive/transition specs + tests.                                                                                                                                            |
| HE-11   | Implemented | Schema merge / overrides (schema-format + merge tests).                                                                                                                      |
| HE-12   | Implemented | `HookRunner` / template-variables specs; tests for unknown + no workspace.                                                                                                   |

## Discrepancies

1. **`workflow-step.ts` comments vs HE-4 (code-wrong comments / spec-right)**  
   Comments still say `instruction:` hooks “inject text into the compiled agent instruction block” / “compiled context block”. `CompileContext` class JSDoc and HE-4 say the opposite (`GetHookInstructions` only). Runtime matches spec; **comments are stale** (documentation drift in domain VO, not behavior).

2. **schema-format verify “Post hook failure prompts user / not rolled back” vs HE-6/HE-10 (spec-wrong on schema-format)**  
   Transition `hook.post` is `abort` + `before-persist` (state not persisted). Archive post is collect after persist. Generic “prompt user” is CLI-era wording, not core.

3. **Logging**  
   Hook progress maps to check-progress events; Transition uses `Logger.debug` for routing. Compatible with `default:_global/logging`. No finding.

## Test Coverage

- `workflow-check-factories.spec.ts`: hook execute uses `RunStepHooks`.
- `transition-change.spec.ts`: skip `all` / `target.pre` / `source.post` / no-op `source.pre`/`target.post`; predicates still run with skip all.
- `archive-change.spec.ts`: skip pre/post/all; post collect.
- Run-hooks CLI/use-case tests for instruction skip and fail-soft post.

## Missing Tests

- Dedicated `hook-effect.ts` unit file (behavior covered via factories + transition).
- Recovery `archiving → archivable` omits `hook.pre`/`hook.post` (`exceptAlong: recovery`) at effect execute (binding matcher tests exist in transition-checks suite; confirm coverage of execute skip vs unmatched).
- Comment/JSDoc drift not testable.

## Spec Dependency Chain

- `core:transition-checks` (bindings, along, phase/onFailure).
- `core:workflow-model`, `core:template-variables`, `core:change`.
- Ports: `HookRunner`, `ExternalHookRunner`.
- Composition: `workflow-check-registry` injects `createRunStepHooks`.
- **Kernel:** effects composed with use cases, not entity methods. Aligns with architecture.

## Summary

- Requirements: **12**
- Implemented: **12**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (stale VO comments; schema-format verify leftover)
- Test gaps: **2**

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                 | Normative gist                                                                                                                            |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                  | Disabled → `ApprovalGateDisabledError` `'spec'`, no repo I/O; then get/actor/schema/mismatch.                                             |
| AS-2 | Change lookup               | Missing → `ChangeNotFoundError`.                                                                                                          |
| AS-3 | Artifact hashes             | Skip missing/skipped; null load skip; cleanup then hash; `type:key` keys.                                                                 |
| AS-4 | Recording and transition    | `recordSpecApproval`; **no** hop to pending/`spec-approved` from bound `from` (`ready`); drain `pending-spec-approval` → `spec-approved`. |
| AS-5 | Persistence                 | `mutate`; return updated Change.                                                                                                          |
| AS-6 | Input                       | `name` + `reason` only.                                                                                                                   |
| AS-7 | Gates baked at construction | `ApprovalGates` from `config.approvals`.                                                                                                  |
| AS-8 | Factory                     | `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`.                                                                        |

## Implementation Status

| ID   | Status      | Evidence                                                                                     |
| ---- | ----------- | -------------------------------------------------------------------------------------------- |
| AS-1 | Implemented | Gate first; `get` not called when disabled (`approve-spec.spec.ts`).                         |
| AS-2 | Implemented |                                                                                              |
| AS-3 | Implemented | `_computeArtifactHashes` inside mutate on **fresh** change.                                  |
| AS-4 | Implemented | `boundFromStates('approval.spec')` + drain branch; no `transition('pending-spec-approval')`. |
| AS-5 | Implemented | `mutate` once.                                                                               |
| AS-6 | Implemented | `ApproveSpecInput`.                                                                          |
| AS-7 | Implemented | Ctor + kernel `resolveApproveSpecDeps` → `resolver.config.approvals`.                        |
| AS-8 | Implemented | `composition/use-cases/approve-spec.ts`.                                                     |

Happy path is **consent in `ready`**, not a pending hop. `approval.spec` predicate (`domain/checks/approval-spec.ts`) gates **forward leave of ready**. Aligns with `core:config` / `core:transition-checks`.

## Discrepancies

1. **Hash-then-mutate order (spec-wrong)**  
   Spec Persistence: compute hashes **then** `mutate`. Code hashes **inside** the mutate callback on `freshChange`. Safer vs TOCTOU; tests assert `mutate` + ready stays `ready`. Treat as **spec wording lag**.

2. **“Obtain schema once” (minor code vs spec)**  
   Gate calls `schemaProvider.get()`; hashes call `get()` again. Not forbidden strongly; slight duplication.

3. **Architecture**  
   Use case in application; `boundFromStates` from domain `check-bindings` — avoids hardcoding `ready`. Matches composition/kernel. **No layering violation.**

4. **Testing names**  
   Drain tests still dominate hashing/persist; ready-path persist-through-mutate is only implied by the ready consent test (no dedicated `mutate` spy on ready).

## Test Coverage

- Ready stays `ready` + event.
- Drain → `spec-approved`.
- Disabled gate no `get`.
- Drafting → `InvalidStateTransitionError`.
- Schema mismatch before mutate.
- Not found.
- Composition factory instance + deps form.

## Missing Tests

- Schema `get()` throw propagates (verify: Schema resolution failure).
- Cleanup-rule vs no-cleanup hashing (verify: two artifact types).
- Null artifact skip not in hash map.
- `createApproveSpec(config)` receives `config.approvals` (spy / baked-gate), not only `toBeInstanceOf`.
- Ready-path `mutate` spy (verify Persistence scenario names `ready`).
- Input-type compile-only (acceptable).

## Spec Dependency Chain

- `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks` (`from` for `approval.spec`).
- **Consistent** with drain-only pending + in-place consent.

## Summary

- Requirements: **8**
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (order wording; double schema get)
- Test gaps: **5**

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec for signoff: gate `'signoff'`; `recordSignoff`; stay in **`done`**; drain `pending-signoff` → `signed-off`; `approval.signoff` bound `from=done`, `to=archivable`, `along=forward`.

## Implementation Status

Symmetric to ApproveSpec (`approve-signoff.ts`, `resolveApproveSignoffDeps`, kernel). Drain-only pending. No happy-path `pending-signoff` hop.

## Discrepancies

Same hash-inside-mutate and double `schemaProvider.get()` as ApproveSpec (**spec-wrong** order vs **code-right**).

Test describe `'given the change is not in pending-signoff state'` covers drafting (also not `done`) — **test title drift**, behavior matches verify “not in done or pending-signoff”.

## Test Coverage

Parallel to ApproveSpec (`approve-signoff.spec.ts`, composition factory).

## Missing Tests

Same five gaps as ApproveSpec, plus: factory baked `approvals.signoff`; schema throw; cleanup hashing; null skip; `mutate` spy on **done** happy path.

## Spec Dependency Chain

Same as ApproveSpec with `approval.signoff` bindings. Consistent with config: stay in `done`; pending drain-only.

## Summary

- Requirements: **8**
- Implemented: **8**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (mutate order; test title)
- Test gaps: **5**

---

# Spec: `core:schema-format`

## Requirements Summary (change-relevant + rest)

Full spec is the YAML contract (kind, extends, artifacts, DAG, cleanup, `taskCompletionCheck`, templates, validations, metadata, scope, **Workflow**, external hooks, plugins, resolve, load validation, verify.md format).

**Change-critical Workflow (SF-W):** `workflow[]` attaches extras to existing states; MUST NOT define occupancy set or hops; omit MUST NOT delete protocol; unknown `step` MUST NOT occupy axis; `buildSchema` `SchemaValidationError`; `requiresTaskCompletion` invariant `hasTasks: true`; hooks pre/post.

## Implementation Status

| Area                                          | Status      | Evidence                                                                        |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| File/kind/extends/artifacts/DAG               | Implemented | Parser + `buildSchema` + registry tests.                                        |
| `taskCompletionCheck` / `hasTasks`            | Implemented | Artifact type + schema-format verify.                                           |
| Workflow extras vs protocol                   | Implemented | `buildSchema` valid-state check; `WorkflowStep` docs; engine omit-implementing. |
| Unknown step                                  | Implemented | `reviewing` test.                                                               |
| External hook YAML                            | Implemented | Parser + execution registry.                                                    |
| CompileContext MUST NOT evaluate availability | Implemented | No `stepAvailable`; separate GetStatus.                                         |

## Discrepancies

1. **Requires wording vs workflow-model / code (spec-wrong)**  
   “must be `complete`” omits `skipped`. Code: `complete` \| `skipped`.

2. **Post-hook verify scenarios (spec-wrong)**  
   “prompt user / do not roll back” conflicts with transition `hook.post` abort-before-persist (`core:hook-execution-model`). Archive post collect matches “not rolled back” only for archive.

3. **Pre-hook verify “agent offers to fix” (spec-wrong / CLI)**  
   Core throws `HookFailedError`; offer-to-fix is skill/CLI, not schema-format runtime.

4. **`SchemaRegistry.resolve()` vs `buildSchema` for unknown step**  
   Spec text uses both. Code rejects at `buildSchema` (called from resolve). **Aligned** if resolve always builds.

5. **Architecture**  
   YAML at infra (`schema-yaml-parser`); semantic workflow membership in domain `buildSchema`. Matches architecture (validate at boundary + domain invariants).

## Test Coverage

- Unknown step, hook ids, `requiresTaskCompletion`/`hasTasks`, omitted-step **engine** behavior.
- CompileContext no availability field.
- Broad schema-yaml-parser / schema-registry / build-schema suites for non-workflow requirements (not re-audited line-by-line here; no contradiction found with architecture).

## Missing Tests

- schema-format verify: omitted `implementing` still a ChangeState **at `buildSchema` return** (engine-only today).
- Axis: unknown name never appears in `buildAxis` (transition-checks tests cover `reviewing` on axis if it slipped through — should be unreachable).
- GetStatus blocked hop + CompileContext jointly (split across files).

## Spec Dependency Chain

- `core:workflow-model`, `core:transition-checks`, `core:build-schema`, `core:hook-execution-model`.
- **Inconsistency:** complete-only requires; post-hook UX verify vs effect bindings.

## Summary

- Requirements: **22** (spec.md `### Requirement` count before verify.md duplicate)
- Implemented: **22** (behavior); **2** workflow verify scenarios stale vs engine
- Partial: **0** implementation; **verify.md Workflow hook UX** stale
- Missing: **0** features
- Discrepancies: **3** (requires complete; post/pre hook UX; vs workflow-model)
- Test gaps: **3**

---

# Spec: `core:config`

## Requirements Summary (change-relevant)

**Approvals:** defaults `spec`/`signoff` false; when true, wait is **check** on `ready` / `done`, stay in those states; redesign `ready → designing` MUST NOT require spec gate; omitted `implementing` still `ready → verifying` needs spec consent; **no** happy-path pending hops; drain pending remains legal; `change transition` to pending is never next-action.

Other requirements (file location, privacy, env, workspaces, storage, plugins, context, logging, LLM, writer port, startup, legacy) are unchanged by this change’s intent.

## Implementation Status

| Area                       | Status      | Evidence                                                                       |
| -------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Approvals parse/default    | Implemented | `config-loader.ts`: `data.approvals?.spec ?? false`. Tests parse `spec: true`. |
| In-place checks            | Implemented | `approval.spec` / `approval.signoff` bindings; Approve\* stay in ready/done.   |
| Redesign without spec gate | Implemented | `approval.spec` `along: forward` only (`check-bindings.ts`).                   |
| Kernel wiring              | Implemented | `resolver.config.approvals` into Transition/GetStatus/Approve\*.               |
| Logging section            | Implemented | Defaults `info`; `Logger` used in TransitionChange.                            |

## Discrepancies

1. **Approvals verify “config MUST NOT be documented as requiring a pending hop”**  
   This is a **docs** constraint. Living docs are out of this batch’s files; not verified here. Code/config types do not mention pending as required.

2. **Missing default-false unit test**  
   Loader implements `?? false`. `config-loader.spec.ts` tests explicit true/false parse; **no** dedicated “section omitted → both false” case (verify scenarios exist).

3. **Architecture**  
   Config load infra → `SpecdConfig` application type → composition. Approvals consumed as ctor deps. Aligns with composition spec.

## Test Coverage

- Parse approvals booleans.
- Transition/get-status with gates on (in-place wait).
- Logging level present/absent in config-loader (other describes).

## Missing Tests

- Omit `approvals` key → `{ spec: false, signoff: false }`.
- `approvals.spec: true` + `ready → designing` does not fail `approval.spec` (may live in transition-checks/transition-change; flag if absent as named config scenario).
- Docs audit for pending-hop language (out of code).

## Spec Dependency Chain

- `core:transition-checks`, `core:approve-spec`, `core:approve-signoff`, `core:workflow-model` (omit implementing still gated on forward leave ready).
- **Consistent** with drain-only pending and checks-not-hops.

## Summary

- Requirements: **27** (spec.md unique names)
- Implemented: **27** (Approvals + rest assumed present; this batch did not re-verify every workspace/graph paragraph)
- Partial: **0** for Approvals behavior
- Missing: **0**
- Discrepancies: **1** (docs scenario not code-checked)
- Test gaps: **2** (default false; named redesign+gate)

---

# Cross-cutting: architecture / logging / testing / deps

| Topic                    | Finding                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture             | Application checks (`HookEffectCheck`, Approve*) use ports; domain owns bindings/`along`/`VALID_TRANSITIONS`; composition `resolve*Deps` + kernel. No IoC. **Compliant.** |
| Logging                  | TransitionChange `Logger.debug` for engine routing. Approve\* silent. Logging config in `core:config`. **Compliant** (no extra console).                                  |
| Testing                  | Vitest, `test/` mirrors, mocked ports. Approve tests use `vi.fn()` spies. **Compliant** with gaps listed.                                                                 |
| `transition-checks`      | Bindings match specs: approval from ready/done; hooks phase/onFailure; requires/taskCompletion except recovery.                                                           |
| `composition` / `kernel` | `createApproveSpec(resolveApproveSpecDeps(resolver))` and signoff analog; check registry wires `CountTasks` + `RunStepHooks`.                                             |
| `HookRunner`             | Shell-only port; effects do not call it directly — `RunStepHooks` does. **Matches HE-2/HE-5.**                                                                            |

---

# Batch totals (this partial)

| Spec                        |   Reqs |   Impl | Partial | Missing impl | Discrepancies | Test gaps |
| --------------------------- | -----: | -----: | ------: | -----------: | ------------: | --------: |
| `core:workflow-model`       |     10 |      8 |       1 |            0 |             3 |         4 |
| `core:hook-execution-model` |     12 |     12 |       0 |            0 |             2 |         2 |
| `core:approve-spec`         |      8 |      8 |       0 |            0 |             2 |         5 |
| `core:approve-signoff`      |      8 |      8 |       0 |            0 |             2 |         5 |
| `core:schema-format`        |     22 |     22 |       0 |            0 |             3 |         3 |
| `core:config`               |     27 |     27 |       0 |            0 |             1 |         2 |
| **Sum**                     | **87** | **85** |   **1** |        **0** |        **13** |    **21** |

**Focus verdict:** Pending parking is drain-only in Approve\* and config/transition bindings. Approval is predicate checks, not happy-path hops. Hooks run as effect `execute` via `RunStepHooks`. `workflow[]` is extras lookup; protocol membership stays `ChangeState`/`VALID_TRANSITIONS`. Remaining issues are spec wording collisions (`complete` vs `skipped`, `hasTasks` vs `taskCompletionCheck`, schema-format hook UX) and test holes (hash cleanup, schema throw, omitted-step at `buildSchema`, approvals default).
