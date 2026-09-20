# Specs compliance — change `workflow-transition-checks`

- **Mode:** `--change workflow-transition-checks`
- **Timestamp:** 20260826-183525
- **Graph:** indexed 2026-08-26T16:29:52Z (then used by auditors as fresh)
- **CLI:** `node packages/cli/dist/index.js`

Neither spec nor code is treated as automatically correct.

## Executive summary

Verification (GIVEN/WHEN/THEN vs code+tests) **passed**. Compliance found **alignment debt**: several deltas over-specified consumers, several older specs still describe the previous lifecycle, and a few code paths still walk `requires` or skip hooks by check id.

### Highest-signal findings

| Sev  | Item                                                                                                         | Likely owner                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| High | `LifecycleEngine` still independently re-walks `workflow.requires` for `isReady` / `transitionBlockers`      | code and/or engine spec                           |
| High | `core:workflow-model` availability, CompileContext, post-hook **after** persist vs checks (`before-persist`) | spec                                              |
| High | ValidateArtifacts / GetArtifactInstruction `evaluate({ checksByTarget: {} })` vs “same path as GetStatus”    | both (likely spec overreach)                      |
| High | Skill templates still teach pending parking as happy path (`specd-verify` → `pending-signoff`)               | deferred no-op this change; still real for agents |
| Med  | `skipHookPhases` filtering still keys off `hook.pre` / `hook.post` ids                                       | code vs hook spec                                 |
| Med  | `TransitionChange` defaults to domain stub bindings                                                          | code footgun                                      |
| Med  | `cli:change-transition` verify still describes pending rewrite / `hook-progress` stream                      | spec/verify                                       |
| Low  | `archive.publication` remains a `CheckId` but is not registered                                              | spec/union cleanup                                |
| Low  | CLI approve help hardcodes `ready`/`done` vs `boundFromStates`                                               | spec/docs                                         |

### Aggregated auditor counts (not de-duplicated across batches)

| Batch                | Reqs (approx) |                       Discrepancies | Missing tests |
| -------------------- | ------------: | ----------------------------------: | ------------: |
| engine               |            54 |                                  19 |            13 |
| use-cases            |            65 |                                  14 |            13 |
| archive-hooks-config |            73 |                                   8 |             8 |
| approvals            |            23 |                                   8 |           ~13 |
| cli                  |            40 |                                 ~10 |            ~7 |
| skills-globals       |            42 | 5 lifecycle + 3 pre-existing skills |      deferred |
| **Sum of batches**   |               |                **~64 raw findings** |               |

Many items overlap (empty `checksByTarget`, workflow-model vs transition-checks, pending templates). Unique product decisions are fewer than the raw sum.

### Blocking for archive?

No auditor reported a failing happy-path engine for stay-in-`ready`/`done` + drain pending. Remaining issues are **spec hygiene, deferred skills, and a few code footguns**. Proceed is reasonable if those are accepted; Update Specs is the highest-leverage next step if you want the contract to match code.

---

## Detailed findings (verbatim partials)

---

# Batch: engine

Audit of merged change `workflow-transition-checks` for `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, plus hexagonal consistency vs `default:_global/architecture`. Graph was current (`stale: false`). Specs read via `changes spec-preview`. Navigation via `graph search` / `graph impact` then targeted reads. Neither spec nor code is treated as automatically correct.

## Per spec

### core:lifecycle-engine

- **Requirements summary** (9): `LifecycleEngine` is the sole DAG-aware interpreter. It projects **predicates only** from caller-supplied `CheckResult`s (no `run:` effects, no snapshot bag, no `check.run` fallback). Effective artifact status is derived from persisted aggregates plus the schema DAG (`pending-parent-artifact-review` when complete-but-blocked). Canonical states only (ignore `complete-with-drift` / `hasDrift`). Structured blockers with a mandatory code list. `validTransitions` / `availableTransitions` / `nextAction` from one predicate evaluation; no approval rewrite of the requested target. Archiving recovery (`along = recovery`) skips requires/taskCompletion. Review/drift/overlap diagnostics. Consumers must use `evaluate`, not a second gate. Next artifact from `schema.artifactDag().topologicalOrder()`.

- **Implementation status**: Largely implemented in `packages/core/src/domain/services/lifecycle-engine.ts`. `evaluate` requires `checksByTarget` per protocol-legal target and treats `fail` as unavailable. `_resolveTarget` is identity. `projectArtifacts` is pure (Change + Schema). `_nextArtifact` uses DAG topological order (tested). Happy-path `nextAction` matrix matches the spec for designing/implementing/verifying/ready/done/signed-off/archivable; archiving with `archive-failed.commitStarted` recommends designing. `GetStatus` and `TransitionChange` call `evaluate` after predicate `execute`. Domain layer has no `fs`/`net` I/O.

- **Discrepancies**
  1. **High — code-wrong (also fights its own spec):** `isReady` / `availableSteps` blockers / `transitionBlockers` / `_requestedTargetBlockers` still **independently re-walk** `workflowStep.requires` via effective status and emit `MISSING_ARTIFACT` / `INCOMPLETE_ARTIFACT` / review codes. Spec: project `isReady` from `workflow.requires` CheckResults when present; MUST NOT re-walk to a different code for the same artifact. Fallback `requiresFailed ?? blockingArtifacts.length > 0` is a second algorithm. Evidence: `lifecycle-engine.ts` `evaluate` (~148–196) and `_requestedTargetBlockers` (~574–583).
  2. **Medium — both:** Verify/spec require `ValidateArtifacts` and `GetArtifactInstruction` to `evaluate` **after matching predicates `execute`**. Both call `evaluate(change, schema, { checksByTarget: {} })` (`validate-artifacts.ts` ~224, `get-artifact-instruction.ts` ~103). DAG answers work without predicates; the “after execute” clause is stronger than the use cases need. Either loosen the spec or run the matching predicates (even if unused).
  3. **Medium — both:** Verify scenario lists **CompileContext** as an `evaluate` consumer. `compile-context.ts` does not import or call `LifecycleEngine`. Either the consumer list is stale (spec-wrong) or CompileContext still needs DAG/step answers (code-wrong).
  4. **Low — spec-wrong vs architecture:** Architecture: stateless domain operations are **plain functions**, not classes. `LifecycleEngine` is a class with a debug callback. The change spec explicitly names the class. Architecture should carve an exception, or the engine should be functions + a thin facade.
  5. **Low — spec incomplete:** Mandatory blocker codes omit `IMPLEMENTATION_STATE`, `DEPS_INCONSISTENT`, `READ_ONLY_WORKSPACE`, which the same spec’s availability rules and `_blockersFromFailedChecks` use. Spec catalog vs code both need alignment.

- **Test coverage / missing tests**
  - Covered in `packages/core/test/domain/services/lifecycle-engine.spec.ts`: parent-review chain, canonical complete-with-drift, missing+hasDrift, next-artifact DAG vs declaration order, overlap bypass, impl skippable vs not, task gating hiding `verifying`, done skill hops without nextAction implement, archiving recovery vs requires, archive-failed → designing.
  - Missing: assert `isReady` / blocker codes come **only** from `workflow.requires` CheckResults (no independent walk); CompileContext/evaluate contract; ValidateArtifacts/GetArtifactInstruction with non-empty predicate rows; engine never calls `check.execute` (purity); `transitionBlockers` empty when checks pass but a naive walk would fail.

- **Counts:** reqs **9** / implemented **9** / discrepancies **5** / missing tests **5**

### core:transition-checks

- **Requirements summary** (13): Stable check ids + gerund labels; `Check` / `WorkflowCheck` / `create*` ABI; no snapshot bag; one file per check; `from`/`to`/`along` (or archive operation) on **bindings**; archive is not an edge; effect `phase`/`onFailure`; predicates vs effects; evaluation order (protocol fail-fast); registry bindings (impl only forward exit implementing; approval on delivery edges; no `archive.publication`); compact impl fail messages; generic progress bus; projections from the same evaluation.

- **Implementation status**: Domain matcher/types in `transition-checks.ts`; single binding table `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`; application `create*` + `WorkflowCheck` in `packages/core/src/application/checks/`; registry composes specs + factories. `archive.publication` is **not** in archive bindings. Impl checks bound `from: implementing`, `to: *`, `along: forward`. `approval.spec` exact edges `ready → implementing|verifying` forward. Recovery excludes requires/taskCompletion via `exceptAlong: ['recovery']`. `classifyAlong` treats `archiving → archivable` as `recovery`, `to === designing` as `redesign`. No `PredicateSnapshots` / `gatherPredicateSnapshots` in `packages/core/src`.

- **Discrepancies**
  1. **Medium — spec-wrong vs code (and vs architecture):** `CheckId` and `CHECK_LABELS` still include **`archive.publication`** (`transition-checks.ts` ~32, ~55) though the spec forbids that id as a registered check. Not bound, but the closed union treats it as a first-class check. Remove from the union or amend the spec.
  2. **Medium — both:** Spec: core checks **SHALL extend `WorkflowCheck`**. Application factories do. Domain `packages/core/src/domain/checks/*.ts` export **object literals** with stub `execute`. Dual implementations (pure `run` + domain stub + application class). Architecture wants domain pure functions (the `run` helpers fit); the SHALL-extend rule is application-layer. Spec should say domain `run` + application `WorkflowCheck`, not imply a single class in domain.
  3. **Medium — code-wrong:** `TransitionChange` defaults `transitionBindings = TRANSITION_BINDINGS` (domain stubs) (`transition-change.ts` ~137). Spec: use cases MUST compose `create*` onto the spec table. Kernel/registry path is correct; the default is a footgun (silent no-I/O checks if composition forgets the argument).
  4. **Low — both:** `CheckExecutionContext` includes **`approvals`** (`transition-checks.ts` ~340–341), not listed in the spec ABI (change, schema, attempt, skip flags, overlap/out-of-scope, `effectiveStatusByArtifact`, `onCheckProgress`). Host-level vs “no check-specific facts”: approval gates are config; listing them on ctx is reasonable. Spec ABI should mention `approvals` or checks should read them only from constructor deps (approval checks currently use ctx).
  5. **High — spec-vs-spec (dependency):** Hook timing contradicts `core:workflow-model` (see that spec). Code follows **this** spec: transition `hook.post` is `before-persist`.
  6. **Low — spec-vs-spec:** `hook.pre` here is `from/to/along = *` except recovery; workflow-model says pre matches `to = that step`, `along = any`. Code matches this spec’s wildcard + `exceptAlong`.

- **Test coverage / missing tests**
  - Strong: `transition-checks.spec.ts` (along, matches, bindings, compact impl message, deps details, no snapshot export, no archive.publication row); `workflow-check-factories.spec.ts`; `execute-check-with-progress.spec.ts`; use-case specs for TransitionChange/ArchiveChange/GetStatus (out of this file but relevant).
  - Missing: TransitionChange constructed **without** registry still failing I/O-backed checks (documents the default); plugin ABI not required this change; `hook.pre` along `*` vs `any` documented only by code.

- **Counts:** reqs **13** / implemented **13** / discrepancies **6** / missing tests **2**

### core:change

- **Requirements summary** (22 in spec.md): Identity, timestamps, workspaces/specIds, lifecycle + `VALID_TRANSITIONS` (no new hops into pending parking; skill hops from done/signed-off/archivable; archiving only to archivable|designing), skill-hop invalidation rules, impl/verify loop, implementation tracking, approvals stay in ready/done, artifacts + aggregate states, sync, history, archive-failed, schema version, draft/discard, **LifecycleEngine owns DAG interpretation**, policy invalidation, per-file drift.

- **Implementation status**: `VALID_TRANSITIONS` in `change-state.ts` matches the change spec (ready → implementing|designing only; done includes archivable, designing, implementing, verifying; archiving → archivable|designing; skill hops; drain pending states). Change remains persisted-facts owner; no `effectiveStatus` on the entity (graph search: none). Approvals as predicates, not parking transitions, are consistent with this spec and transition-checks.

- **Discrepancies**
  1. **High — spec-wrong (internal contradiction):** Artifacts requirement lists allowed persisted states **without** `pending-parent-artifact-review`, then dangling bullets (preview ~240–242) treat that value as file/aggregate persisted state. Engine spec says parent-review is **derived**. Code: `ArtifactStatus` includes it; `ChangeArtifact._recomputeStatus` will persist aggregate `pending-parent-artifact-review` if any **file** has that status (`change-artifact.ts` ~216–218). Entity methods do not normally set files to that state. Spec should state: derived-only on the engine verdict; not a persistable file state. Code should reject unknown persist of derived status if the spec is tightened.
  2. **Medium — spec-vs-dependency:** “Lifecycle interpretation authority” forbids the entity from answering step availability / approval routing. `core:workflow-model` still says availability is `change.effectiveStatus()` and CompileContext evaluates steps. Change spec + engine are aligned with code; workflow-model is not.
  3. **Low — both:** `implementing → verifying` is described as gated because verifying `requires` includes `tasks` with `taskCompletionCheck`. Runtime gating is **`workflow.taskCompletion`** (`requiresTaskCompletion`), not `requires` alone. Incomplete tasks can satisfy `requires` (complete artifact with open checkboxes). Spec mixing of requires vs taskCompletion is misleading; code is closer to transition-checks/workflow-model task section.

- **Test coverage / missing tests**
  - Lifecycle table covered in change-state / transition-change / lifecycle-engine tests. Skill hops and drain states covered in engine and change tests (not re-listed here).
  - Missing: persist/load round-trip **rejects** `pending-parent-artifact-review` on files if that becomes the rule; entity never answers DAG parent-block (already true; no negative test that Change has no `effectiveStatus`).

- **Counts:** reqs **22** / implemented **22** (artifacts parent-review persist path is latent) / discrepancies **3** / missing tests **2**

### core:workflow-model

- **Requirements summary** (10): Step names = Change states; designing/implementing/verifying/archiving semantics; `requires` as `workflow.requires` with `to = effective`; `requiresTaskCompletion` as `workflow.taskCompletion` via CountTasks; **step availability formula**; workflow[] as display order **and** along axis; step name is target state; `run:` as effects with matcher; two execution modes (auto effects unless skip); requires are artifact IDs.

- **Implementation status**: Axis + `classifyAlong` implemented. Requires/taskCompletion as checks. Step name is `TransitionChange` target. Archive is operation `archive`. Task completion uses `CountTasks` in application `createWorkflowTaskCompletion`. Engine does not read task files. `buildSchema` still owns DAG cycles (dependency spec).

- **Discrepancies**
  1. **High — spec-wrong vs code and vs `core:lifecycle-engine` / `core:change`:** Step availability is specified as `step.requires.every(id => artifact(id).state ∈ {complete, skipped})` on **persisted** state, and constraints say it is computed from **`change.effectiveStatus()`**. The entity has no `effectiveStatus`. Engine uses **effective** status and **predicate** results (taskCompletion, deps, impl, approval), not that formula. Empty-requires “always available regardless of change state” is false under `protocol.edge`.
  2. **High — spec-wrong vs `core:transition-checks` and code:** Verify: post-hooks execute **after** the state change. Transition-checks + `check-bindings.ts`: transition `hook.post` is **`before-persist`** (complete source step before `mutate`). Code follows transition-checks. Workflow-model verify scenarios are stale.
  3. **Medium — spec-wrong:** “CompileContext evaluates step availability during context assembly.” `compile-context.ts` has no workflow step availability / LifecycleEngine usage.
  4. **Medium — spec-vs-spec:** Pre-hook matching (`to = that step`, `along = any`) vs transition-checks wildcards + except recovery. Code: `from/to/along = *`, `exceptAlong: ['recovery']`.
  5. **Low — both:** “Application use cases MUST NOT duplicate file walks in LifecycleEngine” is satisfied. “Status and TransitionChange MUST share `workflow.requires`” is satisfied at check level, but engine still duplicates a requires walk for `isReady` (see lifecycle-engine).

- **Test coverage / missing tests**
  - Along/redesign/recovery: `transition-checks.spec.ts`. Task completion / CountTasks: application check and transition-change tests. Shared requires: GetStatus vs TransitionChange use-case tests (other batch).
  - Missing: CompileContext no longer exposes step availability (document or restore); post-hook **before** persist vs after (workflow-model scenarios would fail if run as written); availability using **effective** vs persisted parent-review; empty requires still blocked by protocol.

- **Counts:** reqs **10** / implemented **8** (availability + CompileContext + post-hook timing specs do not match code) / discrepancies **5** / missing tests **4**

## Architecture (`default:_global/architecture`) vs this batch

- **Domain purity:** `lifecycle-engine.ts`, `transition-checks.ts`, `domain/checks/*` `run` helpers, `change-state.ts` have no Node I/O. Matching. Application checks perform I/O via ports (`CountTasks`, `RunStepHooks`, ready facts). Matching.
- **Tension:** Architecture “pure functions not classes” vs `LifecycleEngine` class and `WorkflowCheck` abstract class (application — acceptable). Domain object-literal `Check` stubs blur the line.
- **Ports:** Use cases take `ChangeRepository` / `SchemaProvider`; they do not import Fs adapters. Matching.
- **I/O in evaluate:** Engine does not execute checks; GetStatus/TransitionChange execute then project. Matching the engine spec. Validate/GetArtifactInstruction skip execute (see above).

## Batch totals

| Spec                   |   Reqs | Implemented | Discrepancies | Missing tests |
| ---------------------- | -----: | ----------: | ------------: | ------------: |
| core:lifecycle-engine  |      9 |           9 |             5 |             5 |
| core:transition-checks |     13 |          13 |             6 |             2 |
| core:change            |     22 |          22 |             3 |             2 |
| core:workflow-model    |     10 |           8 |             5 |             4 |
| **Total**              | **54** |      **52** |        **19** |        **13** |

Highest-priority alignment work (not ranked as “spec always wins”):

1. Stop the engine’s independent `requires` walk **or** rewrite lifecycle-engine so `isReady`/blockers are allowed to use DAG projection as a documented second source.
2. Rewrite workflow-model availability, CompileContext, and post-hook timing to match transition-checks + code.
3. Untangle `pending-parent-artifact-review` persist vs derived-only.
4. Drop `archive.publication` from `CheckId` or register it (spec currently forbids registration).
5. Stop defaulting `TransitionChange` to domain `TRANSITION_BINDINGS`.

---

# Batch: use-cases

Audit of specd change `workflow-transition-checks` against implementation and tests. Specs read via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`. Navigation via `specd graph` (`stale: false`). Compared against `core:lifecycle-engine` and `core:transition-checks` (change deltas + new spec). No code or spec files were modified.

Shared contradiction used below (`core:lifecycle-engine` / `core:transition-checks`):

- Use cases that need DAG-aware answers MUST call matching predicate `execute`, then `LifecycleEngine.evaluate` with those `CheckResult`s.
- There MUST be no global snapshot bag (`gatherPredicateSnapshots` MUST NOT exist). Confirmed absent in domain (`packages/core/test/domain/services/transition-checks.spec.ts` asserts `'gatherPredicateSnapshots' in mod` is false).
- Engine MUST remain I/O-free and MUST NOT fall back to `check.run` when `checksByTarget` is missing. Empty `checksByTarget` currently skips availability projection (`continue` when injected results are undefined) but still computes `projectArtifacts` / `nextArtifact`.

---

## Per spec

### core:get-status

- Requirements summary

  `GetStatus` is a read-only status projection: resolve active change then draft (`get` / `getDraft`, never discarded), optional `ifModifiedSince` 304-style short-circuit, optional pre-read `RefreshImplementationTracking`, DAG-aware artifact statuses plus display/drift, task counts painted from `workflow.taskCompletion` (CountTasks inside that check, not a sibling constructor port), and lifecycle guidance (`availableTransitions`, `nextAction`, blockers, check rows) projected by `LifecycleEngine` from per-legal-target predicate `execute`. Schema resolution failure MUST degrade lifecycle fields without throwing. Drafts MUST be inspection-only (empty `availableTransitions`, no mutable `Change`).

- Implementation status

  **Mostly implemented and aligned with this change.**
  - `packages/core/src/application/use-cases/get-status.ts`: constructor is `ChangeRepository`, `SchemaProvider`, approvals, `RefreshImplementationTracking`, `LifecycleEngine`, `CheckBinding[]`. No `CountTasks` sibling.
  - Full path: `projectArtifacts` → `executeChecksByLegalTargets` (predicates only) → `lifecycle.evaluate(..., { checksByTarget })` → paint `taskCompletion` from `workflow.taskCompletion` details (`taskCompletionFromChecks`).
  - Short-circuit and draft paths skip refresh and skip full check evaluation as specified.
  - Blocker merge: `impl.filesResolved` does not advertise `--allow-out-of-scope`; `impl.linksInScope` does; failed checks carry `label` / `checkId`.
  - Factory: `resolveGetStatusDeps` pulls `transitionBindings` from `resolveWorkflowCheckRegistry` (`packages/core/src/composition/use-cases/get-status.ts`).

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **Medium — draft effective status is not DAG-projected (code-wrong, spec slightly loose).** Spec: drafted status MUST compute artifact/lifecycle projections for inspection and MAY use an internal `Change` for effective status. Code `_buildDraftedResult` copies persisted `artifact.status` as `effectiveStatus` and never calls `projectArtifacts` / predicate `execute`. Cascade (`pending-parent-artifact-review`) will not appear on drafts. Evidence: `get-status.ts` `_buildDraftedResult`; test `projects read-only views with empty transitions for drafted changes` does not assert cascade.

  2. **Low — factory bullet list vs deps shape (spec-wrong / incomplete).** Spec `resolveGetStatusDeps` lists composed `create*` checks in prose but does not name `transitionBindings`. Code’s `GetStatusDeps` requires `transitionBindings: readonly CheckBinding[]`. Behaviour matches Constraints; the factory requirement text lagged the ABI.

  3. **Low — leftover “gather” language in tests (tests-wrong, not product).** `get-status.spec.ts` still has `it('gathers CountTasks before LifecycleEngine.evaluate')`. Implementation order is check `execute` then `evaluate` (compliant). Spec forbids a global snapshot bag; the test name contradicts the spec wording while asserting the correct call order.

  No contradiction found between GetStatus **active** path and `core:lifecycle-engine` / `core:transition-checks` (predicates then project; no snapshot bag; engine I/O-free).

- Test coverage / missing tests

  Covered: not found; refresh default/skip/draft; `ifModifiedSince`; schema-provider failure; task painting via CountTasks inside checks; incomplete tasks omit `verifying` + `INCOMPLETE_TASKS`; impl bypass split; deps gerund label; cascade effectiveStatus (active); displayStatus; review blockers; factory `createGetStatus`.

  Missing or weak:
  - Verify scenario **Enter-ready deps check omits ready when extract mismatches**: tests inject a failing `deps.consistent` for blocker shape only; they do not assert `ready` absent from `availableTransitions` after a real extract/persist mismatch.
  - Draft DAG cascade / `pending-parent-artifact-review`.
  - Explicit assertion that `effect` rows are absent from status `allowed` (predicates-only `executeChecksByLegalTargets` implies this; no test names it).
  - `taskCompletion` omitted for missing/empty artifact files (spec MUST omit; painting trusts check details).

- Counts
  - Requirements reviewed: 16
  - Implemented as specified: 14
  - Discrepancies: 3 (1 medium, 2 low)
  - Missing/weak tests: 4
  - Spec-wrong: 1 (factory wording) + test naming
  - Code-wrong: 1 (draft effective status)
  - Both: 0

---

### core:transition-change

- Requirements summary

  `TransitionChange` persists the **requested** target (no rewrite to pending-approval states). Approval is `approval.spec` / `approval.signoff`. Matching **predicates** `execute` for the classified attempt; map the first fail to existing typed errors; do not re-walk requires/tasks after a green execute. Then matching **effects** (`before-persist`: source.post only when `along=forward`, then target.pre) via check `execute` (RunStepHooks inside hook checks, not a use-case port). Redesign invalidates; skill-aligned backward hops clear signoff only and skip source.post. Recovery `archiving → archivable` skips archivable requires/hooks. Optional refresh before evaluation. `skipHookPhases` skips effects only. Schema/missing workflow step: skip requires/hooks. Persistence via `ChangeRepository.mutate`.

- Implementation status

  **Core transition/check path implemented; factory/docs and schema-failure behaviour diverge.**
  - `packages/core/src/application/use-cases/transition-change.ts`: `executeMatchingPredicates` + `lifecycle.evaluate` with `{ [requestedTarget]: evaluation.checks }`; fail mapping for protocol/requires/tasks/approval/deps/readOnly/impl; effects via `matchingEffects` + `executeCheckWithProgress`; redesign `invalidate`; skill hop `invalidateSignoff`; drain/gate assertions; `allowOutOfScope` on input.
  - Constructor: repository, actor, schema, refresh, approvals, engine, `transitionBindings` (default `TRANSITION_BINDINGS`). No `RunStepHooks`.
  - Factory: `resolveTransitionChangeDeps` matches Constraints (`transitionBindings` from registry), not the stale factory requirement that still lists `runStepHooks`.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — factory / verify still require `RunStepHooks` on the use case (spec-wrong).** Spec Constraints and `core:transition-checks` say `RunStepHooks` is composed into `createHookPre` / `createHookPost`; use-case constructor MUST inject bindings. Previewed **Config-based factory** requirement and verify scenario **TransitionChange depends on LifecycleEngine and RunStepHooks** still list `runStepHooks: RunStepHooks` on `resolveTransitionChangeDeps`. Code + composition tests use `transitionBindings` only (`packages/core/src/composition/use-cases/transition-change.ts`, `test/composition/use-cases/transition-change.spec.ts`). **Align factory/verify with Constraints.**

  2. **Medium — schema resolution failure (code-wrong vs spec; tests lock the code).** Spec: if schema cannot be resolved, requires and hooks are skipped. Code: `await this._schemaProvider.get()` with no catch — throws. Test `throws when schema cannot be resolved` documents throw. `GetStatus` degrades; `TransitionChange` does not. **both** if the intended product is fail-fast (then spec is wrong); as written, spec wants skip and code throws.

  3. **Low — `allowOutOfScope` (spec-wrong / incomplete Input contract).** Constraints: input MAY include `allowOutOfScope` for `impl.linksInScope`. Requirement **Input contract** lists name/to/skipHookPhases/refresh only. Code has `allowOutOfScope?: boolean` on `TransitionChangeInput`.

  4. **Low — Purpose text still says the use case “owns hook execution”** while hooks run only through matching effect `execute`. Constraints are the binding source of truth. Stale purpose vs code (**spec-wrong**).

  Alignment with `core:lifecycle-engine`: no pending-target rewrite; requested target is persist target; predicates then map errors without a second requires algorithm. `evaluate` is used for artifact verdicts / logging; gate is `evaluation.allowed` from predicate execute — compliant.

- Test coverage / missing tests

  Strong: approval-required stays in ready/done; drain pending hops; task gating / missing-task-capability / progress events; requires + skipped optional; skipHookPhases; hook order post→pre→transitioned; redesign vs drafting/designing; archiving→archivable without archive hooks; CountTasks not called twice after green evaluate; skipHookPhases does not skip predicates; redesign skips source.post; done→implementing clears signoff without downgrading artifacts.

  Missing:
  - Verify **source.post skipped on backward hop** (`done`/`signed-off`/`archivable` → `implementing`/`verifying`): no assertion that `hook.post` / `RunStepHooks` is not called (only redesign skip is tested).
  - Factory verify still expects `runStepHooks` on deps (would fail if updated to match Constraints; current composition tests match code).
  - Graceful schema-miss skip (spec scenario vs throw test).

- Counts
  - Requirements reviewed: 18
  - Implemented as specified (Constraints + check model): 15
  - Discrepancies: 4 (1 high, 1 medium, 2 low)
  - Missing/weak tests: 3
  - Spec-wrong: 3 (factory/verify RunStepHooks, Input omit allowOutOfScope, purpose)
  - Code-wrong: 1 (schema get throw) — optionally **both** if fail-fast is intended
  - Both: 1 (schema failure, if counting dual lock-in)

---

### core:validate-artifacts

- Requirements summary

  Single chokepoint to mark artifacts complete: schema name guard, required-artifact set (skipped when `artifactId` set), DAG dependency order via `LifecycleEngine`, topological traversal, complete/skipped bypass, approval/signoff drift invalidation, expected paths, delta/no-op, structural and cross-artifact rules, metadata extraction, persist completions. **This change adds:** when DAG-aware status is needed, call matching workflow predicate `execute` then `evaluate` with those results; MUST NOT gather a snapshot bag. Also: recompute lifecycle interpretation after each persisted completion in a multi-artifact `execute`.

- Implementation status

  **Validation engine implemented; new transition-check wiring is not.**
  - `packages/core/src/application/use-cases/validate-artifacts.ts`: `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })` then local `artifactVerdicts` / `markVerdictComplete`. No `executeMatchingPredicates` / `executeChecksByLegalTargets`. No `CheckBinding` constructor port.
  - Constructor uses `ListWorkspaces` (not `ReadonlyMap<string, SpecRepository>` as in spec snippet), plus hasher, extractor transforms, workspace routes, engine.
  - Completions and invalidation persist in **one** `mutate` at the end; in-pass dependents see `markVerdictComplete`, not a re-`evaluate` after persist.
  - `gatherPredicateSnapshots` is not called (compliant with the negative). The **positive** “matching predicates execute” is missing.
  - Factory `resolveValidateArtifactsDeps` does not inject transition bindings.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — no predicate `execute` before `evaluate` (code-wrong vs this change and `core:lifecycle-engine` “Shared lifecycle interpretation”).** Spec: MUST call matching workflow predicates’ `execute` then `evaluate` with those `CheckResult`s. Code always passes `{}`. Engine then skips availability for every target (`injected === undefined`). DAG `projectArtifacts` still runs, so dependency-blocked validation mostly still works **without** checks. That satisfies older “interpret through LifecycleEngine” but **not** the change’s “same path as GetStatus”.

     **both (design overreach):** ValidateArtifacts has no transition `attempt`. The change spec does not say which targets to execute (all legal hops vs none). Running full `executeChecksByLegalTargets` would add CountTasks/deps/impl I/O on every validate. Spec may be over-applying the GetStatus pipeline; code under-implements the letter of the new requirement.

  2. **Medium — constructor ports (spec-wrong vs long-standing code).** Spec constructor: `specs: ReadonlyMap<string, SpecRepository>`. Code: `ListWorkspaces` then `listWorkspaces.execute()` for repos. Tests construct with `makeListWorkspaces`. Not introduced solely by this change, but still a spec/code split.

  3. **Medium — “recompute after each persisted completion” (code-wrong if literal; both if in-memory mark is accepted).** Spec MUST recompute lifecycle after each persist so later artifacts in the same `execute` see parents completed. Code mutates an in-memory verdict map and persists once. Topological order + `markVerdictComplete` can satisfy same-pass dependents without re-`evaluate`. It does **not** re-run predicate execute or persist between artifacts.

  4. **Contradiction with `core:transition-checks`:** “GetStatus, TransitionChange, ArchiveChange, ValidateArtifacts, and GetArtifactInstruction MUST NOT gather a global snapshot” — ValidateArtifacts complies (no gather). The same family of specs also require predicate execute; only the gather half is met.

- Test coverage / missing tests

  Large existing suite for rules, deltas, drift, missing files, cross-artifact, etc. **Zero** tests for:
  - Verify **ValidateArtifacts does not gather PredicateSnapshots** / matching predicates execute (no `checksByTarget`, no spy on check `execute`).
  - Re-evaluate after mid-pass persist.
  - Composition `createValidateArtifacts` / `resolveValidateArtifactsDeps` in `packages/core/test/composition` (not found).

- Counts
  - Requirements reviewed: 20+ (full validate spec; this change adds 1)
  - New check-pipeline requirement: not implemented
  - Pre-existing validation behaviour: largely implemented
  - Discrepancies: 3 (1 high, 2 medium)
  - Missing tests (this change): 3
  - Spec-wrong: 1 (constructor Map vs ListWorkspaces) + possible overreach on predicate execute
  - Code-wrong: 2 (no predicate execute; persist/recompute wording)
  - Both: 1 (whether validate should run transition predicates at all)

---

### core:get-artifact-instruction

- Requirements summary

  Read-only instruction payload: change lookup, schema name guard, artifact resolution, template expansion with `change.name` / `change.path` only, rules pre/instruction/template/delta outlines/rules post. Omitted `artifactId` uses `LifecycleEngine.nextArtifact` (first DAG node whose deps are complete/skipped and which is not itself complete/skipped). **This change:** MUST use engine **after matching predicates `execute` (same path as GetStatus)**; MUST NOT gather a snapshot bag. Factory via `resolveGetArtifactInstructionDeps`.

- Implementation status

  **Instruction resolution implemented; new check pipeline is not.**
  - `packages/core/src/application/use-cases/get-artifact-instruction.ts`: `evaluate(change, schema, { checksByTarget: {} })` then `input.artifactId ?? lifecycle.nextArtifact`. No bindings, no predicate execute.
  - `nextArtifact` still works because `_nextArtifact` uses `projectArtifacts` inside `evaluate`, independent of checks.
  - Constructor default `new LifecycleEngine(...)` if omitted.
  - Factory deps field is `templateExpander` (spec says `templates`).
  - No `packages/core/test/composition` coverage for this factory.

- Discrepancies (severity, evidence, spec-wrong vs code-wrong vs both)
  1. **High — empty `checksByTarget`, no matching predicate `execute` (code-wrong vs new requirement and `core:lifecycle-engine` shared consumers).** Same pattern as ValidateArtifacts. Auto-select still DAG-correct today because `nextArtifact` does not need transition checks. Spec explicitly demands GetStatus’s path.

  2. **Medium — internal spec contradiction (spec-wrong).** Constraints: “The use case does not evaluate step availability or artifact status.” New requirement: MUST use engine after predicate execute for next/readiness. Constraints were not updated when the delta was added.

  3. **Low — factory naming (spec-wrong).** Spec: `templates: TemplateExpander`. Code: `templateExpander` on `GetArtifactInstructionDeps`. Wiring is otherwise correct.

  4. **both (same design question as ValidateArtifacts):** omitted-`artifactId` only needs DAG effective status (`projectArtifacts`). Forcing full legal-target predicate I/O is not required for instruction text. Spec and lifecycle-engine over-couple this use case to transition evaluation.

- Test coverage / missing tests

  Covered: not found, schema mismatch, unknown artifact, rules/instruction/delta, outlines skip missing, template vars without workspace, auto-select first incomplete in topo order, all-complete throws `ArtifactNotFoundError`.

  Missing (verify scenarios):
  - **Omitted artifactId ignores persisted complete when engine reports `pending-parent-artifact-review`** — no test.
  - **GetArtifactInstruction does not gather PredicateSnapshots** / uses matching predicate execute — no test (and code would fail a strict execute assertion).
  - `createGetArtifactInstruction` / `resolveGetArtifactInstructionDeps` composition tests.

- Counts
  - Requirements reviewed: 10
  - Implemented as specified (pre-change instruction behaviour): 8
  - New check-pipeline requirement: not implemented
  - Discrepancies: 4 (1 high, 1 medium, 1 low, 1 both/design)
  - Missing tests: 3
  - Spec-wrong: 2 (constraints vs new req; `templates` vs `templateExpander`)
  - Code-wrong: 1 (no predicate execute)
  - Both: 1 (whether instruction needs transition predicates)

---

## Batch totals

| Spec                          | Reqs reviewed | Discrepancies |  High | Medium |   Low | Missing tests |
| ----------------------------- | ------------: | ------------: | ----: | -----: | ----: | ------------: |
| core:get-status               |            16 |             3 |     0 |      1 |     2 |             4 |
| core:transition-change        |            18 |             4 |     1 |      1 |     2 |             3 |
| core:validate-artifacts       |            21 |             3 |     1 |      2 |     0 |             3 |
| core:get-artifact-instruction |            10 |             4 |     1 |      1 |     1 |             3 |
| **Batch**                     |        **65** |        **14** | **3** |  **5** | **5** |        **13** |

(Plus one **both/design** on validate + instruction sharing the “must execute transition predicates without a defined attempt” overreach.)

### Cross-cutting vs core:lifecycle-engine / core:transition-checks

| Consumer                      | Predicate `execute` then `evaluate` | Snapshot bag | Notes                                                         |
| ----------------------------- | ----------------------------------- | ------------ | ------------------------------------------------------------- |
| GetStatus (active)            | Yes (`executeChecksByLegalTargets`) | No           | Compliant                                                     |
| GetStatus (draft / unchanged) | No                                  | No           | Allowed by those paths’ own requirements                      |
| TransitionChange              | Yes (`executeMatchingPredicates`)   | No           | Compliant; factory/verify stale on RunStepHooks               |
| ValidateArtifacts             | No (`checksByTarget: {}`)           | No           | Violates shared-consumer MUST                                 |
| GetArtifactInstruction        | No (`checksByTarget: {}`)           | No           | Violates shared-consumer MUST; `nextArtifact` still DAG-based |

`gatherPredicateSnapshots` does not exist. The remaining gap is **empty `checksByTarget` on validate and instruction**, not a resurrected snapshot type.

### Suggested fix direction (audit only; not applied)

- Treat GetStatus as the reference application path for status/transition UX.
- Either implement a documented, minimal predicate execute for ValidateArtifacts / GetArtifactInstruction (and inject bindings via composition), **or** narrow `core:lifecycle-engine` / those two specs so DAG `projectArtifacts` / `nextArtifact` is enough without legal-target check I/O.
- Update TransitionChange factory + verify to `transitionBindings` / hook checks; decide schema-miss: throw vs skip; add `allowOutOfScope` to the Input contract.
- Add the listed missing tests, especially deps.consistent omitting `ready`, backward-hop skipped source.post, and parent-review auto-select.

---

# Batch: archive-hooks-config

Change: `workflow-transition-checks`
Mode: spec-preview vs code+tests (graph-first)
Graph: stale=false, lastIndexedAt=2026-08-26T16:29:52.129Z
CLI: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`

Assigned specs:

- `core:archive-change`
- `core:hook-execution-model`
- `core:config`

Design notes confirmed in this batch:

- `archive.publication` is **not** a registry check. `ARCHIVE_BINDING_SPECS` omits it. Failures are labeled via `runArchivePublication` inside `ArchiveChange` preflight. Test: `packages/core/test/domain/services/transition-checks.spec.ts` (`archive.publication is absent`).
- Effects are selected with `matchingEffects(..., phase)` (`before-persist` / `after-persist`), not by iterating `check.id`.
- `skipHookPhases` skip **mapping** still keys off check id / factory phase in `HookEffectCheck.execute` (see discrepancies).

---

## Per spec

### `core:archive-change`

**Requirements summary (33 in spec.md):** ports/constructor; input (`skipHookPhases` `pre`/`post`/`all`, `allowOverlap`); schema name guard; ArchivedChange construction; archivable guard; deferred `archiving` transition; readOnly guard; overlap guard; pre-archive hooks (binding `phase`, not `check.id`); tracked artifacts; full-batch preflight; staged commit; batch snapshot/restore; orphan backups; lifecycle rollback; debug logging; delta merge; archive repository + actor; index metadata; post-archive hooks (`after-persist` / `collect`); spec metadata; spec-lock; result shape; typed errors; archive checks share runners and **must not register `archive.publication`**; impl files/links; out-of-scope; factory via `resolveArchiveChangeDeps`.

**Implementation (symbols):**

- `ArchiveChange` — `packages/core/src/application/use-cases/archive-change.ts:276`
- `defaultArchiveBindings` / `_archiveBindings` — same file; composition `createWorkflowCheckRegistry` → `archiveBindings`
- `ARCHIVE_BINDING_SPECS` — `packages/core/src/domain/services/check-bindings.ts:87` (schema.nameMatch → archive.archivable → spec.overlap → workspace.readOnly → deps.consistent → impl.filesResolved → impl.linksInScope → hook.pre before-persist/abort → hook.post after-persist/collect). No `archive.publication`.
- `matchingEffects` — `packages/core/src/application/services/execute-hook-effect.ts:28`
- `archivePublication` / `runArchivePublication` — `packages/core/src/domain/checks/archive-publication.ts` (labeling only; `execute` is skip)
- Predicates via `executeMatchingPredicates` then effects via `matchingEffects` + `executeCheckWithProgress` (no `RunStepHooks` launch by id in the use case)

**`archive.publication` (by design, not a registry check):**

- Compliant. `CheckId` still includes `'archive.publication'` for labels/logs. `ARCHIVE_BINDINGS` / `createWorkflowCheckRegistry` do not bind it. Preflight I/O stays in `ArchiveChange._prepareArchivePlan` / `_prepareArchivePreflight`; catch blocks log `runArchivePublication('ARCHIVE_PREFLIGHT', ...)`.
- Spec: “MUST NOT register `archive.publication` on the binding table.” Code matches. Remaining merge/publish preflight is inside the use case after predicates 1–7.

**Effects / `skipHookPhases`:**

- Compliant selection: `matchingEffects(this._archiveBindings, archiveAttempt, 'before-persist'| 'after-persist')` (comments: “binding phase; not check id”).
- Skip values `'pre'|'post'|'all'` accepted on `ArchiveChangeInput`. Passed through `CheckExecutionContext.skipHookPhases`. `--skip-hooks` CLI (`packages/cli/src/commands/change/archive.ts`) maps to that set; tests in `packages/cli/test/commands/change-archive.spec.ts`.
- Predicates still run when skip is `all` (tests in `archive-change.spec.ts`: skip all still archives / still generates metadata).
- Skip **decision** is not on the use-case loop; it is inside `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts:133`): archive branch uses factory `_phase` (`pre`/`post`) plus `skip.has('pre'|'post'|'all')`, not `binding.phase` (`before-persist`/`after-persist`). For default bindings this coincides with check ids `hook.pre`/`hook.post`. If a future binding reused those ids with swapped phases, skip selectors would follow factory phase/id, not the binding table.

**Constructor / input / result vs spec:**

- Spec constructor: `ChangeRepository`, `Map<string, SpecRepository>`, `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, `ArtifactParserRegistry`, `ExtractorTransformRegistry`, `SchemaProvider`, `RegenerateSpecMetadata`, `SpecWorkspaceRoute[]`.
- Code constructor: `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, `ArtifactParserRegistry`, `SchemaProvider`, `MaterializeSpecMetadata`, optional transforms/routes/`projectRoot`/`batchSnapshot`/`archiveBindings`. Specs are reached via `ListWorkspaces`, not a constructor `specs` map. Metadata port is `MaterializeSpecMetadata`, not `RegenerateSpecMetadata`.
- Evidence: likely **spec drift** (composition already uses `ListWorkspaces` + batch snapshot + materialize). Extra `archiveBindings` injection is this change’s registry wiring — reasonable, undocumented on the spec constructor.
- `_runStepHooks` is stored and never read after construction (only passed into `defaultArchiveBindings` if bindings are omitted). Spec says `RunStepHooks` is a constructor dep of hook **checks**, not launched by the use case — the unused field is leftover, not a second launch path.
- Extra input `allowOutOfScope` (not in the spec’s input list). Extra result `archiveDirPath` (used by CLI/tests). Spec vs extra fields: **spec incomplete** more than a bug.

**Other archive-check requirements (this change):**

- `approval.signoff` is not in `ARCHIVE_BINDING_SPECS`. Archive is not a lifecycle edge. Compliant.
- Shared runners: `deps.consistent` / `workspace.readOnly` / impl checks reuse the same `Check` instance across transition and archive tables (`transition-checks.spec.ts` “check object is reused”).
- `throwMappedArchiveFailure` maps failed **predicate** ids to typed errors (allowed). Effects fail via `throwHookFailed` / collect `postHookFailures`.

**Tests:**

- `packages/core/test/application/use-cases/archive-change.spec.ts` — skip all / pre / post; instruction entries skipped by `RunStepHooks`; pre fail-fast; post collect.
- `packages/core/test/application/services/matching-effects.spec.ts` — archive before-persist abort, after-persist collect, no id filter for the slot.
- `packages/core/test/domain/services/transition-checks.spec.ts` — archive.publication absent; archive hook phases/onFailure.
- Batch restore / overlap / readOnly covered in existing archive-change / batch-restore specs (broader than this change).

**Discrepancies:**

1. **Skip mapping not by binding `phase`.** Spec: selection and skip must not branch on `hook.pre`/`hook.post` ids; skip by binding `phase` and archive `pre`/`post` selectors. Use case selects by phase (compliant). `HookEffectCheck` skip uses factory `_phase` / check id. **Code incomplete relative to spec** (or spec stricter than default-binding reality).
2. **Constructor/port list stale.** Spec `specs` map + `RegenerateSpecMetadata` vs code `ListWorkspaces` + `MaterializeSpecMetadata` + snapshot/bindings. **Spec drift** (pre-existing) plus undocumented extras.
3. **Debug log `skipped: false` hardcoded** on before-persist start (`archive-change.ts` ~423–427) even when skip selectors are set (effects still “start” then skip inside execute). Weak vs “pre-archive hooks — start and completion (… skipped phases)”.
4. **Input/result extras** (`allowOutOfScope`, `archiveDirPath`) not listed in spec.

**Coverage gaps:**

- No test that skip `'pre'` is decided from `binding.phase === 'before-persist'` independently of `check.id`.
- No test that a hypothetical extra before-persist effect (non-`hook.pre` id) would still run/skip with archive `'pre'`.
- Constructor contract tests still build `new ArchiveChange(...)` with `ListWorkspaces`, not the spec’s TypeScript snippet.

**Counts:** requirements 33; discrepancies 4; covered well (hooks/skip/registry/publication-not-bound) ~22; partial (constructor, skip mapping, logging) ~6; missing tests ~3.

---

### `core:hook-execution-model`

**Requirements summary (12 in spec.md):** two hook types; explicit external hooks; external phase semantics; instruction hooks passive (`GetHookInstructions`, skip in Transition/Archive/`RunStepHooks`); default auto-execute of matching `run:` **effects** after predicates (`phase`/`onFailure` from bindings, not check id; `skipHookPhases` by phase); two execution modes; **“change transition does not execute hooks”** (contradicts default auto-execute); manual `skipHookPhases`; pre fail-fast; post `onFailure`; schema-then-project ordering; template variables (no `{{change.workspace}}`).

**Implementation:**

- `RunStepHooks._collectHooks` keeps only `type === 'run' | 'external'` (`run-step-hooks.ts:209–214`). Instruction entries never execute.
- `createHookPre` / `createHookPost` inject `RunStepHooks`; `kind: 'effect'`. Domain `hookPre`/`hookPost` `execute` is skip (status never waits on effects).
- `TransitionChange` iterates `matchingEffects(..., 'before-persist', along)` then `_executeEffect` → `check.execute` (no id switch to launch hooks). `along` filter drops `hook.post` on redesign (`matching-effects.spec.ts`).
- Archive: before-persist then persist then after-persist, `onFailure` via `hookFailureMode(binding.onFailure)`.
- CLI: transition `--skip-hooks` accepts `source.pre|source.post|target.pre|target.post|all`; archive `pre|post|all`.

**Internal spec contradiction:**

- Requirement “Default hook execution…” + verify “TransitionChange executes pre-hooks…” vs requirement “change transition does not execute hooks” + verify “THEN no hooks are executed”.
- Code implements **auto-execute** (this change). The “does not execute hooks” requirement looks like leftover agent-driven-mode text. **Spec inconsistency**; code follows the newer default-execution requirement.

**`skipHookPhases` by phase, not `check.id`:**

- `HookEffectCheck.execute` (transitions): `this._id === 'hook.pre' && skip.has('target.pre')` / `this._id === 'hook.post' && skip.has('source.post')`. Explicit id branch. Does **not** honor `source.pre` or `target.post` even though `HookPhaseSelector` includes them.
- `shouldExecuteHookEffect` (`execute-hook-effect.ts:110`) also branches on `binding.check.id === 'hook.pre'|'hook.post'`. **No remaining callers** in packages (dead helper). Still documents the forbidden mapping.
- `executeHookEffect` still maps `checkId → RunStepHooks phase` (`hook.pre`→`pre`). Unused by Archive/Transition execute path.

**Instruction hooks as predicates/effects:**

- Compliant: instruction never becomes a check. `RunStepHooks` filters them. `GetHookInstructions` tests exist. Archive instruction+run mix: `archive-change.spec.ts` “instruction-type pre hook”.

**Ordering / templates / external:**

- Schema-before-project is merge-engine / `ResolveSchema` behavior (`resolve-schema.spec.ts` override append). No dedicated `RunStepHooks` test named “schema hooks then project hooks”.
- `{{change.workspace}}` rejected: `get-hook-instructions.spec.ts`, run-hooks tests.
- External hooks: `RunStepHooks` dispatches `external` type; fail-fast/soft follows phase passed to `_executeHooks` (`pre` vs `post`), not archive binding `onFailure` when invoked standalone.

**Tests:**

- Transition skip all / `target.pre` / `source.post`; skip all still fails incomplete tasks (`transition-change.spec.ts`).
- No tests for `source.pre` or `target.post` skip (CLI can pass them; core ignores).
- CLI comma-separated skip (`change-transition.spec.ts`).

**Discrepancies:**

1. **Skip mapping by check id** in `HookEffectCheck` (and dead `shouldExecuteHookEffect`). Spec forbids id branches for skip. **Implementation gap.**
2. **`source.pre` / `target.post` are no-ops.** Type and CLI accept them; execute only maps `target.pre`/`source.post`/`all`. **Implementation gap** or **spec over-specified** unused selectors (both transition hook effects are `before-persist` today, so `target.post` has no binding).
3. **Verify leftover:** “transition does not execute hooks” vs auto-execute. **Spec should drop the old requirement.**
4. Dead `executeHookEffect` / `shouldExecuteHookEffect` still encode id→phase. Harmless if unused; they contradict the spec if treated as the model.

**Coverage gaps:**

- No test that skip uses `binding.phase` without reading `check.id`.
- No test `source.pre` / `target.post`.
- Weak RunStepHooks-level schema-vs-project hook order test.

**Counts:** requirements 12; discrepancies 4; well covered (instruction skip, along filter, archive skip pre/post/all, fail-fast/collect, templates, CLI mapping) ~8; contradictory/legacy ~1; skip-by-phase incomplete ~2.

---

### `core:config`

**Change delta (this change):** Approvals are in-place checks, not pending hops. Depends on `core:transition-checks`. Verify scenario: spec gate on → wait is `approval.spec`; config MUST NOT document a pending hop.

**Scope note:** Full `core:config` has 28 spec.md requirements (discovery, privacy, workspaces, schemaOverrides, graph, etc.). This batch treats non-delta requirements as background. Hook-related dependency: `schemaOverrides` for project workflow hooks (`hook-execution-model` spec dependencies).

**Approvals (delta):**

- Loader: `approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }` (`config-loader.ts:616`). Zod optional booleans (`config-schema.ts:258–263`).
- Runtime: `TransitionChange` with `approvals.spec: true` stays in `ready` and throws approval-required; does not go to `pending-spec-approval` (`transition-change.spec.ts:260–275`). Same pattern for signoff/`done`.
- `approval.spec` / `approval.signoff` are transition bindings only (`TRANSITION_BINDING_SPECS`); not archive. Matches “archive is not a lifecycle edge” / signoff not bound to archive.

**schemaOverrides (hooks):**

- Still parsed and merged (`config-loader.spec.ts` parses overrides; `resolve-schema.spec.ts` append/remove workflow hooks, YAML instruction normalization). No new `specd.yaml` keys for skip-hooks (design: existing CLI flags only). Compliant with “no new config keys” for this change.

**Discrepancies:**

1. **Config-loader tests do not assert default `approvals.spec/signoff === false` when the section is omitted.** Verify scenarios exist; implementation defaults in loader. Coverage gap, not a logic bug.
2. **New verify scenario** (“Spec gate on does not require pending-spec-approval”) is tested in `transition-change.spec.ts`, not under config-loader. Acceptable (behavior is lifecycle), but config verify is not mirrored next to other approvals loader tests.
3. Rest of `core:config` (VCS walk, cascade `remove`, graph excludePaths, etc.) not re-audited as regressions of this change; no delta conflict found with hook/archive work.

**Counts:** requirements 28 (full spec); change-relevant ~2 (Approvals + schemaOverrides-as-hook-layer); discrepancies 0 functional / 2 coverage; remainder assumed prior-compliant.

---

## Spec dependency chain

- `core:hook-execution-model` → `core:config` (`schemaOverrides` project hooks), `cli:change-transition` / `cli:change-archive` (`--skip-hooks`), `core:template-variables`, `core:change`.
- `core:archive-change` → transition-checks / hook-execution-model (archive bindings, effects by phase, `archive.publication` not registered).
- `core:config` (this change) → `core:transition-checks` (in-place `approvals.spec` / `approvals.signoff`).

No contradiction between config approvals (stay in `ready`/`done`) and archive (signoff not an archive predicate).

---

## Batch totals

| Spec                        | Requirements |                           Discrepancies | Coverage gaps | Notes                                                                                          |
| --------------------------- | -----------: | --------------------------------------: | ------------: | ---------------------------------------------------------------------------------------------- |
| `core:archive-change`       |           33 |                                       4 |             3 | publication **not** in registry (pass); skip select-by-phase (pass); skip **map**-by-id (fail) |
| `core:hook-execution-model` |           12 |                                       4 |             3 | auto-execute vs leftover “no hooks” verify; `source.pre`/`target.post` no-ops                  |
| `core:config`               |           28 |              0 functional (2 test gaps) |             2 | approvals in-place; no new yaml keys                                                           |
| **Batch**                   |       **73** | **8** (6 code/spec + 2 config coverage) |         **8** |                                                                                                |

**Highest-signal findings:**

1. `archive.publication` is correctly **not** a binding-table check; labeling helper only.
2. Effect **selection** uses binding `phase`; `skipHookPhases` **filtering** still uses `hook.pre`/`hook.post` ids (and archive factory `pre`/`post`), not `binding.phase`.
3. `core:hook-execution-model` still contains a requirement/scenario that transitions execute **no** hooks; implementation auto-runs matching effects.
4. `core:config` approvals delta matches code (`ready` stays `ready`); loader default-false and pending-hop wording lack config-package tests.

---

# Batch: approvals

Audit mode: change `workflow-transition-checks` (verifying). Graph: `stale: false` at ref `2948f1a2`. Spec content from `changes spec-preview` (merged deltas). Implementation via graph search/impact then file reads. No code or spec files were modified.

Focus asked: `boundFromStates` vs hardcoded `ready`/`done`; drain `pending-*` still allowed.

---

## Per spec

### `core:approve-spec`

**Spec dependencies (depth 1):** `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks` (`from` states for `approval.spec` come from engine bindings).

**Implementation map**

| Area          | Location                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Use case      | `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec`, lines 70–101)                                          |
| Bindings      | `boundFromStates('approval.spec')` from `packages/core/src/domain/services/check-bindings.ts:170`                                |
| Engine `from` | `TRANSITION_BINDING_SPECS` `approval.spec`: `ready → implementing` and `ready → verifying` (`check-bindings.ts:57–63`)           |
| Factory       | `packages/core/src/composition/use-cases/approve-spec.ts` (`resolveApproveSpecDeps`, `createApproveSpec`)                        |
| Kernel        | `packages/core/src/composition/kernel.ts` `changes.approveSpec`                                                                  |
| Tests         | `packages/core/test/application/use-cases/approve-spec.spec.ts`, `packages/core/test/composition/use-cases/approve-spec.spec.ts` |

**Requirements summary (spec.md)**

1. Gate guard — disabled throws `ApprovalGateDisabledError` `'spec'` with no I/O; then load change, actor, schema, mismatch.
2. Change lookup — `ChangeNotFoundError` if missing.
3. Artifact hash computation — skip missing/skipped; load via `ChangeRepository.artifact`; skip null; cleanup + hash; keys `type:key`.
4. Approval recording and state transition — `recordSpecApproval`; no transition when state is bound `from` for `approval.spec`; drain `pending-spec-approval` → `spec-approved` allowed.
5. Persistence — `mutate`; no bound-`from` transition; drain allowed; return mutated `Change`.
6. Input contract — `name` + `reason` only; no gate flags.
7. Gate baked at construction — `approvals: ApprovalGates`.
8. Config factory via `resolveApproveSpecDeps`.

**Implementation status**

- **Conforms (bound `from` vs hardcoded allow-list):** `execute` uses `consentFrom = boundFromStates('approval.spec')` and allows `pending-spec-approval` as drain only (`approve-spec.ts:86–98`). Happy path does **not** call `transition('spec-approved')` or `transition('pending-spec-approval')`. Drain still calls `transition('spec-approved')` when `freshChange.state === 'pending-spec-approval'`.
- **Residual hardcode (error message only):** `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')`. Allow-list is binding-driven; `'ready'` is only the empty-binding fallback for the expected-state argument. Today bindings yield `['ready']`, so behaviour matches verify scenarios that name `ready`.
- **Gate / lookup / mutate / input / kernel wiring:** Match requirements. Kernel constructs via `createApproveSpec(resolveApproveSpecDeps(resolver))` and exposes `kernel.changes.approveSpec`.
- **Hashes:** Computed inside `mutate` on the fresh change (compatible with “before recording” and “record on fresh instance”). Uses `SchemaProvider.get()` + `buildCleanupMap`, not a per-file `SchemaRegistry` as the unchanged hash requirement still describes.
- **Deps field name:** Spec/`verify` list `hasher: ContentHasher`; composition interface is `contentHasher` (`ApproveSpecDeps`). Constructor param is still `hasher`. Wiring is correct; the published deps name does not match the spec bullet.

**Discrepancies**

1. **Artifact hash requirement vs code (spec drift, pre-existing wording).** Spec steps 4–5 still say resolve schema from `SchemaRegistry` per file, empty cleanup map if unresolved. Code uses `SchemaProvider` once in `_computeArtifactHashes` (and already in the gate). **Likely spec should say SchemaProvider**; code matches the gate-guard requirement and `core:composition-resolver`.
2. **`resolveApproveSpecDeps` lists `hasher`; code exports `contentHasher`.** Spec vs composition naming. **Likely spec/verify should say `contentHasher`** to match `ApproveSpecDeps` and sibling factories.
3. **Purpose still says stay in `ready`**, while recording requirement says “state bound as `from` (currently `ready`)”. Not a code bug today; CLI and purpose are more hardcoded than the recording requirement.
4. **Indexed/archived spec blurb** (graph search hit) still describes transitioning into `spec-approved` as the happy path. That is the **workspace spec before this change’s deltas**. Preview is the source of truth for this audit; archive will need to replace that description.

**Neither-side notes:** If engine bindings later add another `approval.spec` `from` state, use case and `boundFromStates` stay aligned; CLI spec/help (batch `cli:change-approve`) would not, unless updated.

**Test coverage**

| Verify scenario                            | Status                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Gate disabled, no repo access              | Covered (`get`/`mutate` spies)                                                                                                  |
| Change does not exist                      | Covered                                                                                                                         |
| Cleanup rules spec vs verify               | **Missing** in this use-case suite (shared `computeArtifactHash` exists; no approve-spec test with two types)                   |
| Artifact load null skipped                 | Indirect (several tests mock `artifact` → `null`); no assertion that key is absent from the map                                 |
| SchemaProvider.get throws before hash      | **Missing**                                                                                                                     |
| Ready: `spec-approved` event, stay `ready` | Partial: asserts `state === 'ready'` and `activeSpecApproval.reason`; does **not** assert history event shape, hashes, or actor |
| Drain pending → `spec-approved`            | Covered                                                                                                                         |
| Drafting → `InvalidStateTransitionError`   | Covered (describe title still says “not in pending-spec-approval”)                                                              |
| Persist via `mutate`, return `ready`       | Ready path returns `ready`; **`mutate` spy is only on drain path**, not on ready                                                |
| Input name/reason only                     | Type-level; no negative test for extra gate fields                                                                              |
| Factory passes `config.approvals`          | Composition tests only `instanceof`; do not assert baked gates or `resolveApproveSpecDeps` field list                           |
| Enabled gate drain to `spec-approved`      | Covered                                                                                                                         |
| Schema mismatch before mutate              | Covered                                                                                                                         |

**Missing tests**

- Ready path: `mutate` called; history `type: 'spec-approved'` with reason, hashes, actor; no `transitioned` to pending/spec-approved.
- Hash key format `type:key`; cleanup applied vs not; skip `missing`/`skipped`.
- `SchemaProvider.get()` rejection in gate.
- Factory: `resolveApproveSpecDeps` returns `contentHasher` + `approvals` from `config.approvals`.
- Explicit test that allow-list is `boundFromStates` (e.g. documenting current `['ready']`) rather than only drafting rejection.

**Counts (`core:approve-spec`)**

- Spec requirements: 8
- Verify scenarios: 15
- Implemented as specified (behaviour): 8/8 with 2 wording/deps-name mismatches
- Discrepancies: 3 (2 spec-vs-code naming/hash source; 1 purpose/index stale vs bindings language)
- Requirements with adequate tests: ~10/15 scenarios
- Missing/weak tests: 5+ (cleanup, schema throw, ready mutate/event, factory fields, hash keys)

---

### `core:approve-signoff`

**Spec dependencies (depth 1):** `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

**Implementation map**

| Area             | Location                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Use case         | `packages/core/src/application/use-cases/approve-signoff.ts` (`ApproveSignoff`)                              |
| Bindings         | `boundFromStates('approval.signoff')`; engine `from: 'done'`, `to: 'archivable'` (`check-bindings.ts:64–68`) |
| Factory / kernel | `packages/core/src/composition/use-cases/approve-signoff.ts`; `kernel.changes.approveSignoff`                |
| Tests            | `packages/core/test/application/use-cases/approve-signoff.spec.ts`, composition factory spec                 |

**Requirements summary:** Mirror of approve-spec: gate `'signoff'`, `recordSignoff`, stay in bound `from` (currently `done`), drain `pending-signoff` → `signed-off`.

**Implementation status**

- **Conforms:** `consentFrom = boundFromStates('approval.signoff')`; drain `pending-signoff` still transitions to `signed-off`; happy path does not enter `pending-signoff` or `signed-off`.
- **Residual hardcode:** `consentFrom[0] ?? 'done'` on `InvalidStateTransitionError` only.
- Same SchemaProvider vs SchemaRegistry hash wording; same `contentHasher` vs spec `hasher`.
- Gate, lookup, mismatch, mutate, input, factory/kernel: match.

**Discrepancies**

1. Hash requirement still describes `SchemaRegistry` per file vs `SchemaProvider` (same as spec sibling).
2. `resolveApproveSignoffDeps` spec lists `hasher`; code uses `contentHasher`.
3. Purpose names `done` while recording requirement uses bound `from` (currently `done`). Aligned today with engine bindings.

**Test coverage**

Symmetric to approve-spec: done stay + drain `signed-off` covered; drafting rejection covered; gate/not-found/mismatch covered; cleanup/schema-throw/hash-key/`mutate` on **done** path/factory field list weak or missing. Describe title still “not in pending-signoff” for drafting.

**Missing tests:** Same class as approve-spec, for signoff/`done`/`signed-off`.

**Counts (`core:approve-signoff`)**

- Spec requirements: 8
- Verify scenarios: 15
- Implemented as specified (behaviour): 8/8 with 2 wording/deps-name mismatches
- Discrepancies: 3 (same pattern as approve-spec)
- Adequate scenario tests: ~10/15
- Missing/weak tests: 5+

---

### `cli:change-approve`

**Spec dependencies (depth 1):** `cli:entrypoint`, `core:change`, `core:transition-checks`.

**Implementation map**

| Area    | Location                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Command | `packages/cli/src/commands/change/approve.ts` (`registerChangeApprove`)                                         |
| Tests   | `packages/cli/test/commands/change-approve.spec.ts`, `packages/cli/test/commands/change/change-approve.spec.ts` |

**Requirements summary**

1. Command signatures (`spec`/`signoff`, `--reason`, `--format`).
2. CLI does not pass gate flags; `kernel.changes.approveSpec` / `approveSignoff` only (`name`, `reason`).
3. CLI does not compute hashes.
4. Approve spec: valid in `ready` or drain `pending-spec-approval`; stay `ready`; do not print pending hop.
5. Approve signoff: valid in `done` or drain `pending-signoff`; stay `done`.
6. Output text/json/toon.
7. Errors: missing reason, wrong state, not found → exit 1 / `error:`.

**Implementation status**

- Signatures, required `--reason`, `kernel.changes.*` with `{ name, reason }` only: **conform**.
- No hash computation in CLI: **conform**.
- Success text `approved spec for ${name}` / `approved signoff for ${name}`; JSON `{ result, gate, name }`: **conform**.
- Help strings hardcode `ready` / `done` and mention drain pending states: matches **this CLI spec**, not `boundFromStates`.
- Drain: CLI does not branch on state; use case owns drain. Invoking execute from pending still allowed. Tests mock drain returns.

**Discrepancies**

1. **Hardcoded `ready`/`done` vs `core:transition-checks` / `boundFromStates` (spec–spec).** Change delta for “Approve spec/signoff behaviour” names concrete states only. Dependency on `core:transition-checks` is stated, but the behaviour text does not say “states bound as `from` for `approval.spec` / `approval.signoff`”. Core use cases already use bindings. **If bindings change, CLI spec/help would be wrong while core stays right.** Prefer aligning CLI requirements with bound-`from` + drain, with `ready`/`done` as current examples.
2. **Preview “Output on success” is incomplete** (text/json bullets trail off: “prints to stdout:” with no string). Implementation and verify scenarios still specify `approved spec for …` and JSON fields. **Spec body gap**; behaviour is in verify + code.
3. **Wrong-state verify vs test:** Scenario “change in `designing` → exit 1 / `error:`”. Test `exits 1 when change is in wrong state for spec approval` rejects with `ApprovalGateDisabledError('spec')`, not `InvalidStateTransitionError`. Exit/`error:` still pass, but the scenario is **not actually testing wrong lifecycle state**.

**Test coverage**

| Verify scenario                                               | Status                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Missing `--reason`                                            | Covered (Commander throw)                                                                                        |
| Unknown sub-verb                                              | Covered                                                                                                          |
| Execute `{ name, reason }` only; `kernel.changes.approveSpec` | Covered; does **not** assert `kernel.specs.approveSpec` unused                                                   |
| Signoff call shape / `kernel.changes.approveSignoff`          | Covered; same gap for `kernel.specs.approveSignoff`                                                              |
| Hashes from disk, CLI did not pass hashes                     | **Not covered at CLI** (kernel mocked). Core tests also do not assert key format. Input shape implies no hashes. |
| Success from ready, stdout, exit 0                            | Covered (unit; process exit not always asserted on success)                                                      |
| Wrong state designing                                         | **Mis-stubbed** (gate disabled)                                                                                  |
| Success from done                                             | Covered                                                                                                          |
| Change not found                                              | Covered                                                                                                          |
| JSON output                                                   | Covered; given `pending-spec-approval` in verify is not required for CLI JSON                                    |

Extra tests (beyond verify): drain still invoked; stdout does not contain `pending-spec-approval` / `moved`.

**Missing tests**

- `kernel.specs.approveSpec` / `approveSignoff` not called.
- Wrong state via `InvalidStateTransitionError` (designing/drafting).
- TOON format (spec allows it; only JSON tested).
- Signoff missing `--reason` (spec error cases are generic; only spec sub-verb tested).

**Counts (`cli:change-approve`)**

- Spec requirements: 7
- Verify scenarios: 11
- Implemented as specified: 7/7 for current schema-std bindings
- Discrepancies: 3 (CLI hardcodes states vs bindings; incomplete output section; wrong-state test uses wrong error)
- Adequate scenario tests: ~8/11
- Missing/weak tests: 3+

---

## Batch totals

| Metric                                                        | Value                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs in batch                                                | 3                                                                                                                                                              |
| Spec requirements                                             | 8 + 8 + 7 = **23**                                                                                                                                             |
| Verify scenarios                                              | 15 + 15 + 11 = **41**                                                                                                                                          |
| Behaviour vs merged preview                                   | Happy path stay in bound `from`; **drain `pending-*` still allowed** in core and CLI                                                                           |
| `boundFromStates` in core use cases                           | **Yes** (`approval.spec` / `approval.signoff`)                                                                                                                 |
| Hardcoded `ready`/`done` as allow-list in core execute        | **No** (only `?? 'ready'` / `?? 'done'` on empty bindings for `InvalidStateTransitionError`)                                                                   |
| Hardcoded `ready`/`done` in CLI spec, help, and verify GIVENs | **Yes** (current bindings; not engine-driven)                                                                                                                  |
| Spec-vs-code discrepancies                                    | **8** across three specs (hash SchemaRegistry wording ×2, `hasher` vs `contentHasher` ×2, purpose/index stale, CLI vs bindings, incomplete CLI output section) |
| Spec-vs-spec (CLI vs core/transition-checks)                  | **1** material: CLI behaviour requirements name `ready`/`done` instead of bound `from`                                                                         |
| Blocking implementation bugs for this change’s intent         | **None found** for stay-in-`ready`/`done` + drain pending                                                                                                      |
| Test gaps (batch)                                             | Cleanup/schema-throw/hash keys/ready-or-done `mutate`+event; CLI wrong-state stub; `kernel.specs.*` unused                                                     |

**Verdict:** Core approve use cases match the change’s binding-driven consent model and still drain `pending-spec-approval` / `pending-signoff`. Residual `ready`/`done` strings are error fallbacks and CLI/docs, not the core allow-list. Highest-value follow-ups: align CLI (and purpose lines) with `boundFromStates`; fix leftover SchemaRegistry/`hasher` wording; tighten tests so ready/done persist and wrong-state are asserted, not implied.

---

# Batch: cli

Audit of change `workflow-transition-checks` against spec-preview for `cli:change-status`, `cli:change-transition`, and `cli:change-archive`. Graph was current (`stale: false`). Navigation used `specd graph search` / `specd graph impact` then targeted reads. No code or spec files were modified.

Focus: CLI must **present** engine check progress, blockers, and repair data from GetStatus / TransitionChange / ArchiveChange predicates. It must not re-filter the protocol graph (`VALID_TRANSITIONS`) or invent a second rule engine.

---

## Per spec: `cli:change-status`

### Requirements summary

| ID  | Requirement                                                                    | Implementation                                                                                                                                 | Tests                                      |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| S1  | Command signature `status <name> [--format]`                                   | Implemented in `registerChangeStatus`                                                                                                          | Covered                                    |
| S2  | Drafted status is read-only                                                    | Implemented (`draftView` path, `isDrafted`, no transition list)                                                                                | **Missing** CLI tests                      |
| S3  | JSON/toon `artifactDag` has `hasTasks`; `state` is display projection          | Implemented                                                                                                                                    | Covered                                    |
| S4  | DAG `[hasTasks - N/M done]` / fallback `[hasTasks]`                            | Implemented in `renderDag`                                                                                                                     | Partial (tree tests; counts less explicit) |
| S5  | Display-state rendering (text prefers display; JSON both)                      | Implemented                                                                                                                                    | Covered                                    |
| S6  | Lifecycle projections from GetStatus only (no local `VALID_TRANSITIONS` union) | Implemented; text prints `lifecycle.availableTransitions`; JSON copies `validTransitions` / `availableTransitions` / `nextAction` / `blockers` | Covered                                    |
| S7  | Text omits duplicated `review:` file lists; overlap peers still print          | Implemented                                                                                                                                    | Covered                                    |
| S8  | Text blockers include gerund `label` (`! CODE — label: message`)               | Implemented                                                                                                                                    | Covered                                    |
| S9  | Schema version warning from `lifecycle.schemaInfo` only                        | Implemented                                                                                                                                    | Covered                                    |
| S10 | Change not found → exit 1, `error:`                                            | Delegated to `handleError`                                                                                                                     | Covered                                    |
| S11 | Schema-derived `schema.artifactDag` via `artifactDag()` / `childrenOf`         | Implemented via `resolveStatusSchemaDag`                                                                                                       | Covered                                    |
| S12 | Delegates refresh to GetStatus (no direct refresh/detector)                    | `kernel.changes.status.execute({ name })` only                                                                                                 | Covered                                    |
| S13 | `--implementation` uses SDK `buildImplementationReview`                        | `enrichImplementationTracking`                                                                                                                 | Covered                                    |
| S14 | Details `tasks: N/M`                                                           | Implemented                                                                                                                                    | Covered                                    |
| S15 | Basic info: name/state, no standalone `specs:`                                 | Implemented                                                                                                                                    | Covered                                    |
| S16 | Specs and dependencies section + JSON `specDependsOn`                          | Implemented                                                                                                                                    | Covered                                    |

**Requirements: 16. Implemented: 16. Partial: 0. Missing: 0.**

### Implementation status

- **No second rule engine.** `packages/cli/src/commands/change/status.ts` does not import `VALID_TRANSITIONS`. Text `transitions:` is `lifecycle.availableTransitions.join`. JSON serializes GetStatus fields as-is, including optional `checks` / `checksByTarget` via `optionalCheckFields`.
- **Repair-oriented blockers** are printed from `statusResult.blockers` (code, optional label/checkId, message). No local rewrite of nextAction.
- Schema DAG uses `getActiveSchema` + `schema.artifactDag()` when the instance is real; fallback `ArtifactDag.from(schemaInfo.artifacts)` when `raw` is set. This is presentation, not lifecycle recompute. Constraint “MUST NOT call another use case to recompute **lifecycle** data” is met; schema lookup is required by S11.
- Drafted path: `transitions: (none — change is drafted)`, JSON `isDrafted: true`, still prints `nextAction` from GetStatus (verify says do not suggest `specd change transition`; code does not invent that command).

### Discrepancies

1. **Spec-internal: Examples vs Basic info (S15)**
   - **Spec:** Examples still show a top-level `specs:` line. Requirement and verify say text MUST NOT include a standalone `specs:` list.
   - **Code:** Omits `specs:`; uses `specs and dependencies:`.
   - **Verdict:** Spec drift in the Examples block. Code matches the requirement. Prefer fixing the example, not the CLI.

2. **Undeclared dependency on check payloads**
   - **Spec dependencies (preview):** `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`. No `core:transition-checks`.
   - **Code:** Passes through `lifecycle.checks` / `checksByTarget` when present.
   - **Verdict:** Extra serialization is consistent with “present engine checks.” Spec should declare `core:transition-checks` (or GetStatus check fields) so CLI is not an implicit consumer. Not an implementation bug.

3. **Convergent DAG nodes**
   - **Spec:** Render each artifact id at most once; MAY omit or annotate `see <id> above`.
   - **Code:** `visited.has(id)` returns without a reference line.
   - **Verdict:** Allowed by MAY omit. Weaker UX, still compliant.

### Test coverage

Covered well: signature, not-found, schema warning, DAG childrenOf, display/drift, availableTransitions vs protocol edges, nextAction verify vs implement, blocker labels, review/overlap text, implementation section, specDependsOn, refresh not called.

**Missing tests (verify scenarios with no CLI test):**

- Drafted change does not list transition commands / JSON `isDrafted` / discarded name via status (S2, four verify scenarios). Implementation exists; `change-status.spec.ts` and `change/change-status.spec.ts` have **zero** `draftView` cases.
- DAG `[hasTasks - 3/10 done]` vs fallback `[hasTasks]` not asserted as clearly as verify.md (tree tests exist).

### Spec dependency chain

- Aligns with `core:get-status` (serialize projections).
- Gap: no explicit dependsOn for `core:transition-checks` despite check rows in JSON.
- Global: CLI remains a presenter; invariants stay in core.

### Summary counts (`cli:change-status`)

| Metric                     | Count                             |
| -------------------------- | --------------------------------- |
| Requirements               | 16                                |
| Implemented                | 16                                |
| Partial                    | 0                                 |
| Missing implementation     | 0                                 |
| Discrepancies (actionable) | 2 spec-side, 0 code-side blockers |
| Verify scenarios (approx.) | 35                                |
| Scenarios with CLI tests   | ~31                               |
| Missing/weak tests         | 4 drafted + 2 DAG hasTasks tags   |

---

## Per spec: `cli:change-transition`

### Requirements summary

| ID  | Requirement                                                                                       | Implementation                                          | Tests                                                         |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| T1  | Signature: `<name> [step]`, `--next`, `--skip-hooks`, `--format`                                  | Implemented                                             | Covered                                                       |
| T2  | `--next` mapping + refuse pending/archivable                                                      | Implemented; extra `signed-off → archivable`            | Covered for listed refusals                                   |
| T3  | Refresh: pre-status and repair GetStatus with `refreshImplementationTracking: false`; no detector | Implemented                                             | Covered                                                       |
| T4  | No approval flags / no rewrite to pending parking states                                          | `execute({ name, to, skipHookPhases })` only            | Covered (code + tests **match spec.md**, not leftover verify) |
| T5  | `--skip-hooks` → `skipHookPhases`                                                                 | Implemented                                             | Covered                                                       |
| T6  | Progress via `onProgress`                                                                         | Implemented                                             | Covered                                                       |
| T7  | Hook observability during failure                                                                 | Check bus before `HookFailedError`                      | Covered                                                       |
| T8  | Shared hook presentation with `run-hooks`                                                         | **Partial / conflict**                                  | Tests cover check-bus only                                    |
| T9  | Success text stdout; JSON/TOON terminal `stream: change-transition` `complete`                    | Implemented                                             | Covered                                                       |
| T10 | Hook failure exit 2, not post-transition warning                                                  | `handleError` / not repair-guide                        | Covered                                                       |
| T11 | Invalid transition + Repair Guide from GetStatus                                                  | `writeTextRepairGuide` from blockers + `nextAction`     | Covered                                                       |
| T12 | Incomplete tasks error names artifact; status already omitted `verifying`                         | CLI surfaces engine error; status omission is GetStatus | Covered at CLI for error                                      |
| T13 | Check progress: gerund `<label> (<id>)`, `✓`/`✗`, no `Executing:`; hooks on same bus              | `createCheckProgressPresenter`                          | Covered                                                       |
| T14 | Unsatisfied requires → exit 1; repair from core                                                   | Via engine + repair guide                               | Covered                                                       |

**Requirements: 14. Implemented: 13. Partial: 1 (T8). Missing: 0.**

### Implementation status

- **Not a second rule engine.** Target validation is “is this a `ChangeState` name?” (`CHANGE_STATES`). Availability is not computed in CLI. `--next` is a **fixed human shortcut table**, then `TransitionChange.execute`. Repair guide copies `status.blockers` and `status.nextAction` after a failed execute; no local `VALID_TRANSITIONS` filter.
- **Check progress is the public bus.** `makeProgressRenderer` routes `check-start` / `check-progress` / `check-done` through `createCheckProgressPresenter` (`streamName: 'change-transition'`). Legacy events `requires-check`, `task-completion-failed`, `transitioned` still render on the same stream (text: stderr).
- **Repair guide** (text): stderr `error:` + `! CODE — label: message` + `repair guide:` from GetStatus. JSON failure: stdout complete record with `blockers` and `nextAction`.
- Graph: `registerChangeTransition` → presenter + GetStatus; impact shows no local protocol filter.

### Discrepancies

1. **Spec vs verify vs code: approval-gate routing (T4)**
   - **spec.md:** CLI MUST NOT rewrite `implementing` → `pending-spec-approval` or `archivable` → `pending-signoff`. User names the delivery target.
   - **verify.md (preview):** still says `transition implementing` **THEN** state becomes `pending-spec-approval` and stdout shows that rewrite; same for signoff. `--next` from ready “honors approval routing” to pending-spec-approval.
   - **Code/tests:** `to: 'implementing'` / `to: 'archivable'`; stdout `ready → implementing`, not parking states.
   - **Verdict:** Implementation matches **spec.md** and the change intent. **verify.md is stale.** Fix verify (and any core scenarios that still describe CLI rewrite). Possible readings: spec correct / verify wrong (preferred); or product still wants parking rewrite in core (CLI would still not rewrite).

2. **Spec vs code: structured hook stream (T6 vs T13)**
   - **Progress output + verify “Structured formats emit progress”:** hook lifecycle events MUST use `stream: "hook-progress"`; transition events use `change-transition`.
   - **Check progress rendering:** hooks MUST ride the **same** bus (`Running pre/post hooks`), not a separate public contract.
   - **Code/tests:** hook `check-*` records use `stream: "change-transition"`. No `hook-progress` on this command.
   - **Verdict:** Internal spec contradiction. Code follows the **new check-progress** requirement (correct for this change). Progress-output / that verify scenario are spec drift. Prefer deleting `hook-progress` from `cli:change-transition` JSON contract.

3. **Shared helper with `run-hooks` (T8)**
   - **Spec:** MUST centralize presentation in a shared helper (`run-hooks` and `transition`) so labels/tail/liveness/failed output do not drift.
   - **Code:** `run-hooks` still uses `createHookProgressPresenter` (`_hook-progress-presenter.ts`, comment still says it is used by transition). Transition uses `_check-progress-presenter.ts`. Duplicate ANSI stripping, different event shapes, different JSON `stream` names.
   - **Verdict:** Implementation gap vs T8 **or** T8 is obsolete after the check bus. Recommended: update T8 to “transition/archive share `createCheckProgressPresenter`; `run-hooks` may keep hook-progress until it is remapped,” **or** adapt `run-hooks` onto the check bus. Do not keep both as the same public contract.

4. **Repair guide destination (T11 verify)**
   - **verify.md:** `repair guide:` section **to stdout**.
   - **spec.md example** does not name the stream; constraints say text progress on stderr, confirmation on stdout.
   - **Code/tests:** entire guide on **stderr**.
   - **Verdict:** Verify scenario wrong (or underspecified). Code is consistent with “progress/diagnostics on stderr.” Update verify to stderr.

5. **HookFailedError vs Repair Guide (T10 vs T11)**
   - **T11 spec.md:** “When the transition fails (e.g. `InvalidStateTransitionError`, `HookFailedError`), MUST render a Repair Guide.”
   - **T10:** hook failure exit **2**, no separate post-hook warning.
   - **Code:** `isRepairGuideError` does **not** include `HookFailedError`; hooks get check-bus `✗` then exit 2.
   - **Verdict:** Spec contradiction. Code matches T10 + T13 (preferred). Remove HookFailedError from the Repair Guide bullet.

6. **`--next` extra edge**
   - **Spec table** omits `signed-off → archivable`.
   - **Code:** maps `signed-off` to `archivable`.
   - **Verdict:** Spec incomplete (likely desirable). Document it; not a second engine.

### Test coverage

Strong: signature, `--next` refusals, skip-hooks, check-bus gerunds, no `Executing:`, JSON NDJSON complete records, repair guide from GetStatus (including verify skill, DEPS/read-only/impl errors), incomplete tasks, hook fail exit 2 with prior check output, no CLI approval rewrite.

**Missing/weak:**

- No test that JSON hook events are **not** `stream: hook-progress` against the old verify line (tests encode the new contract).
- No test that `run-hooks` and `transition` share one presenter (they do not).
- `signed-off --next` untested.
- Repair guide on stdout vs stderr: tests lock stderr (good vs code, bad vs verify.md).

### Spec dependency chain

Preview dependsOn: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.  
**Missing `core:transition-checks`** even though T13 is entirely that bus. Archive spec already lists it. Status/transition CLI specs should too.

Conflicts with leftover `cli:change-transition` progress/`hook-progress` text and with `cli:change-run-hooks` presenter comment.

### Summary counts (`cli:change-transition`)

| Metric                     | Count                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Requirements               | 14                                                         |
| Implemented                | 13                                                         |
| Partial                    | 1 (shared hook presenter)                                  |
| Missing implementation     | 0                                                          |
| Discrepancies              | 6 (mostly spec/verify drift; 1 dual-presenter)             |
| Verify scenarios (approx.) | 39                                                         |
| Scenarios matching code    | ~32                                                        |
| Stale verify scenarios     | ~5 (approval rewrite, hook-progress stream, repair stdout) |

---

## Per spec: `cli:change-archive`

### Requirements summary

| ID  | Requirement                                                                                                        | Implementation                                                        | Tests                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| A1  | Signature: `changes archive` canonical, `change archive` alias; skip-hooks pre/post/all; `--allow-overlap`; format | Registered on `changes` with `change` alias at group; options present | Missing name / skip-hooks covered; alias via group |
| A2  | Must be `archivable`; else exit 1 naming state                                                                     | Delegated to `ArchiveChange`                                          | Covered                                            |
| A3  | Delegates merge/move/history to use case                                                                           | `kernel.changes.archive.execute`                                      | Covered (unit, mocked)                             |
| A4  | `--skip-hooks` → archive phase set                                                                                 | Implemented                                                           | Covered (all, pre+post, default empty)             |
| A5  | Check progress: gerund bus, no `Executing:`; hooks on same bus                                                     | `createCheckProgressPresenter` (`streamName: 'change-archive'`)       | Covered (text)                                     |
| A6  | Post-archive hook failures → exit 2                                                                                | `cliError(..., 2)`                                                    | Covered                                            |
| A7  | Success text: path; omit invalidated section if empty                                                              | Implemented                                                           | Covered                                            |
| A8  | Extended: invalidated N overlapping changes                                                                        | Implemented                                                           | Covered                                            |
| A9  | JSON success: `result`, `name`, `archivePath`                                                                      | Terminal object on stdout                                             | Covered **without** concurrent progress            |
| A10 | Errors: not found / not archivable / merge fail → exit 1                                                           | `handleError` / overlap special-case                                  | Covered not-found and not-archivable               |

**Requirements: 10. Implemented: 10. Partial: 0 (JSON+progress coexistence underspecified). Missing: 0.**

### Implementation status

- Archive CLI is a thin presenter: maps flags, passes `onProgress` into `ArchiveChange`, prints result. No local archivable-state machine beyond forwarding.
- Check progress uses the **same presenter module** as transition (good: one CLI check renderer, not a second engine).
- Extra undocumented flag: `--allow-out-of-scope` forwarded when set. Not in spec-preview. Additive; should be specced or dropped from public help.

### Discrepancies

1. **JSON success vs check-progress stream (A5 + A9)**
   - **A9 / verify:** stdout is **valid JSON** with `result`, `name`, `archivePath`.
   - **A5 + help text:** JSON also emits `{ stream: "change-archive", event }` lines, then a **non-stream** terminal object `{ result, name, archivePath, invalidatedChanges }`.
   - **Code:** json check events go to **stdout**; then `writeStructuredRecord` of the terminal payload. Combined stdout is **NDJSON**, not one JSON document. Text mode is fine (progress on stderr).
   - **Verdict:** Dual-use of stdout. Either: (a) progress JSON on stderr / omit progress in json, or (b) wrap the terminal result as a stream `complete` record like transition, and update A9. Tests only cover JSON **without** emitting progress. Spec and code both incomplete relative to each other.

2. **`--allow-out-of-scope`**
   - Present in CLI, absent from spec-preview. Spec drift (undocumented surface).

3. **Singular alias verify**
   - Spec: `specd change archive` is alias of `specd changes archive`.
   - Code: parent is `changes` with `.alias('change')`. Compliant. No dedicated archive test for the alias (group-level tests may exist elsewhere).

### Test coverage

Covered: success text/JSON, invalidated lists, not found, missing name, not archivable, skip-hooks all / pre+post / default, post-hook exit 2, text check progress (workspace.readOnly + Running pre hooks, no `Executing:`).

**Missing:** isolated skip `pre` only and `post` only; JSON archive **with** check-progress events; `--allow-out-of-scope`; alias invocation.

No `_check-progress-presenter.spec.ts`; coverage is command-level only.

### Spec dependency chain

Preview correctly includes `core:transition-checks` plus `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`. Aligns with A5. JSON wrapping should stay consistent with `cli:change-transition` once that stream story is unified.

### Summary counts (`cli:change-archive`)

| Metric                 | Count                                               |
| ---------------------- | --------------------------------------------------- |
| Requirements           | 10                                                  |
| Implemented            | 10                                                  |
| Partial                | 0                                                   |
| Missing implementation | 0                                                   |
| Discrepancies          | 2 (JSON+progress; extra flag)                       |
| Verify scenarios       | 16                                                  |
| Scenarios with tests   | ~12                                                 |
| Missing tests          | skip-pre-only, skip-post-only, JSON+progress, alias |

---

## Batch totals

| Metric                                        | `change-status` | `change-transition` | `change-archive`              | Batch  |
| --------------------------------------------- | --------------- | ------------------- | ----------------------------- | ------ |
| Requirements                                  | 16              | 14                  | 10                            | **40** |
| Implemented                                   | 16              | 13                  | 10                            | **39** |
| Partial                                       | 0               | 1                   | 0                             | **1**  |
| Missing implementation                        | 0               | 0                   | 0                             | **0**  |
| Code-side blockers (CLI re-implements engine) | 0               | 0                   | 0                             | **0**  |
| Spec/verify drift findings                    | 2               | 5                   | 2                             | **9**  |
| Dual-presenter / contract conflict            | 0               | 1                   | (shares transition presenter) | **1**  |
| Missing/weak test clusters                    | 2               | 2                   | 3                             | **7**  |

### Batch conclusion

CLI status, transition, and archive **do present engine check/repair data** and **do not** apply a second `VALID_TRANSITIONS` filter. Status copies GetStatus `availableTransitions`, `nextAction`, labeled blockers, and optional `checks` / `checksByTarget`. Transition and archive render `check-start` / `check-progress` / `check-done` with gerund labels and no `Executing:` prefix; repair guides copy GetStatus.

The remaining work is **spec hygiene and one presenter-unification decision**, not a hidden CLI rule engine:

1. Rewrite `cli:change-transition` verify (and leftover Progress JSON) so approval parking is **not** a CLI rewrite, hooks use the **check** bus (`change-transition` / `change-archive` streams), repair guide is **stderr**, and `HookFailedError` is **exit 2** not a repair guide.
2. Resolve **T8**: either document two presenters (`run-hooks` vs check bus) or migrate `run-hooks` onto `_check-progress-presenter.ts`.
3. Add **drafted status** CLI tests; clarify **archive JSON** when checks emit; spec `--allow-out-of-scope` or hide it.
4. Add `core:transition-checks` to `cli:change-status` and `cli:change-transition` dependsOn (archive already has it).

---

# Batch: skills-globals

**Mode:** change `workflow-transition-checks` (read-only compliance)
**Assigned:** `skills:skill-templates-source` (spec-preview), `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing` (`specs show`)
**CLI:** `node packages/cli/dist/index.js`
**Graph:** `stale: false` (indexed `2026-08-26T16:29:52.129Z`, `currentRef` `2948f1a2`)
**Neither spec nor code is assumed correct.** Findings present spec-drift vs implementation-bug vs both.

---

## Per spec

### `skills:skill-templates-source`

**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; deltas `spec.md.delta.yaml` / `verify.md.delta.yaml` (both explicit **no-op**); templates under `packages/skills/templates/`; contract tests `packages/skills/test/template-workflow.spec.ts`.

**Delta contract:** _“Skill template entry states are out of this change; implement/verify templates later.”_ Proposal/tasks/design agree: skill template entry-state rewrites are **out of this change**. Own spec body is unchanged (14 requirements: template location, migration, metadata contract, Handlebars rendering, graph impact/search wording, frontmatter, implementation tracking, metadata self-healing, optimizer gating, command roles).

#### Requirements vs own spec (preview)

| Requirement                                                                        | Status vs templates/code                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Template source location / `.md.tpl` / meta files                                  | Implemented (`templates/skills/*`, `templates/agents/*`, `skill.meta.json` / `specd-agent.meta.json`) |
| No `specd-metadata/` skill; shared consumer index not SOT                          | Implemented (no `templates/skills/specd-metadata/`)                                                   |
| Capability-aware Handlebars; `@{{sharedFolder}}/shared.md`                         | Implemented in skill templates                                                                        |
| Graph impact dependents/dependencies; no `--changes`                               | Not re-audited line-by-line this batch; prior contract tests do not cover this                        |
| Graph search `--snippet` opt-in                                                    | Same                                                                                                  |
| Frontmatter injection / runtime matrix                                             | Plugin + renderer path; unchanged by this change                                                      |
| Implementation tracking / metadata self-healing / optimizer gating / command roles | Covered by `template-workflow.spec.ts` string contracts                                               |

Own-spec requirements are **not contradicted** by the no-op delta. The gap is **cross-spec**: installed workflow templates still describe the **old** approval routing, which **does** contradict sibling change specs (`core:transition-checks`, `core:lifecycle-engine`, `core:approve-spec`, `core:change`).

#### Lifecycle vs templates (assigned check)

Happy-path in this change: gates are predicates on `ready → implementing` / `done → archivable`. `TransitionChange` MUST NOT rewrite into `pending-spec-approval` / `pending-signoff`. Pending states are **drain-only**. `nextAction` on failed `approval.spec` recommends `specd changes approve spec`, not a hop to pending.

**Templates still treat pending states as the normal wait:**

1. **`specd-verify` happy-path signoff (high)**  
   `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` (and installed `.claude/skills/specd-verify/SKILL.md`): after `transition … done`, **“If signoff=on: transition routes to `pending-signoff`.”**
   - Spec-correct (new lifecycle): stay in `done`; human `approve signoff`; then `done → archivable`.
   - Code/engine: requesting `pending-signoff` from `done` is not a legal happy-path edge.
   - **Both:** template is stale relative to engine; change spec correctly deferred template rewrite. Agents following verify will **expect a route that no longer happens**.

2. **`shared.md` “Approvals are human-only” (high)**  
   `templates/shared/shared.md.tpl`: “When a change **reaches** `pending-spec-approval` or `pending-signoff`, your only job is to tell the user [approve commands].”
   - Drain-only reading: still valid for in-flight changes already in those states.
   - Happy-path reading: implies the change **arrives** there. New model: change **stays** in `ready`/`done`.
   - Spec of templates-source does not mention this; contradiction is vs **lifecycle** specs.

3. **`specd-new` routing table (medium)**  
   `templates/skills/specd-new/SKILL.md.tpl`: `targetStep` rows for `pending-spec-approval` and `pending-signoff` as primary suggestions. After this change, `nextAction.targetStep` from `ready` with gate on should be approve-in-place / stay `ready`, not pending. Drain rows are still useful if engine ever reports those states. Table over-weights pending as **normal** `nextAction` keys.

4. **Hook “states you pass through” (medium)**  
   `shared.md.tpl`: “Execute hooks for every state the change **passes through**, including intermediate ones (`pending-spec-approval`, `spec-approved`, … `pending-signoff`, …).” Happy path no longer passes through pending. Drain still needs those hook step ids. Wording teaches agents to **walk** pending as intermediates.

5. **`specd-implement` entry (medium)**  
   Accepts `ready` / `implementing` / `spec-approved`; from `ready` always `transition … implementing`. No stay-in-ready + `approve spec` when the spec gate is on. Failed-transition section says follow Repair Guide (engine can recover), but the **happy path does not mention the gate**.
   - Spec-wrong if templates were in scope.
   - Implementation-ok for this change because delta is no-op.
   - Runtime: transition fails with `APPROVAL_REQUIRED` until human approve; agent may still try the hop first.

**Not a happy-path pending hop:** `specd` entry skill defers to CLI `nextAction` (aligned). `specd-new` `ready` row (“Review artifacts, then `/specd-implement` if approved”) is closer to in-place approval than pending routing.

**Possible resolutions (do not implement here):** update templates in a follow-on change (as this change already declared); or treat pending copy as drain-only with explicit “in-flight only” language; or keep templates and revert engine (rejected by this change’s specs).

#### Test coverage

- `template-workflow.spec.ts` asserts optimizer gating, command roles, archive metadata wording. **Does not** assert absence of “routes to `pending-signoff`” / “reaches `pending-spec-approval`”.
- No missing tests **for the no-op delta**. Missing tests **for lifecycle alignment** are deferred with the templates (verify delta: “verify scenarios deferred with the templates themselves”).

#### Spec dependency chain

Preview `dependsOn`: `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`. No-op does not contradict those. **Does** contradict **this change’s** lifecycle specs until templates are updated (acknowledged out-of-scope).

#### Summary (this spec)

| Metric                                 |                            Count |
| -------------------------------------- | -------------------------------: |
| Requirements reviewed (own spec)       |                               14 |
| Implemented vs own spec                |         14 (baseline; unchanged) |
| Partial vs sibling lifecycle specs     | 1 (whole template set; deferred) |
| Missing vs own spec                    |                                0 |
| Discrepancies (lifecycle vs templates) |                                5 |
| Missing tests (lifecycle wording)      |                     1 (deferred) |
| Missing tests (own spec / this change) |                                0 |

---

### `default:_global/architecture`

**Source:** `specs show default:_global/architecture` (not in the change). Lens: domain I/O, ports, tests vs adapters.

#### Change specs/code (this change)

- New/moved check engine lives in `packages/core/src/domain/` (`transition-checks`, check runners). **No `node:fs` / net / child_process in `packages/core/src/domain`.** Engine evaluates `PredicateSnapshots`; I/O stays in application/infrastructure. **Conforms** to “domain layer is pure” and “application uses ports.”
- `core:transition-checks` depends on `default:_global/architecture`. Change specs do **not** instruct domain I/O. **No spec↔global contradiction.**

#### `@specd/skills` (package that owns templates; not modified by this change)

Architecture: any package with domain logic uses `domain` / `application` / `infrastructure`; domain has zero I/O; application talks only through ports; public `"."` MUST NOT export concrete adapters.

| Finding                         | Evidence                                                                                                                     | Spec vs code                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain I/O                      | `packages/skills/src/domain/templates/index.ts` imports `existsSync` from `node:fs` and probes absolute template paths       | Spec: domain pure. Code: filesystem in domain. **Code (and placement) wrong** _or_ this helper should live in infrastructure. Pre-existing; **not introduced by this change**. |
| Application I/O without ports   | `application/specd-block-manager.ts`, `json-config-manager.ts`, `render-base-agent-instruction.ts` import `node:fs/promises` | Spec: application uses ports only. Code: direct fs. **Code wrong** _or_ these modules should be infrastructure adapters. Pre-existing.                                         |
| Adapter export                  | `packages/skills/src/index.ts` exports `createSkillRepository` from infrastructure                                           | Spec: concrete adapters not on public `"."`. Skills is not `@specd/core`, but it **has** a domain layer. Pre-existing.                                                         |
| Use cases that **do** use ports | `ResolveBundle` / `GetSkill` / `ListSkills` take `SkillRepository`                                                           | Conforms for those use cases.                                                                                                                                                  |

Architecture also says “Currently `@specd/core` is the only such package” for the three-layer layout, **and** “any future package with domain logic must follow the same structure.” Skills already has three layers but **does not** fully obey purity/ports. Ambiguous spec vs incomplete adoption.

**Adapter packages contain no business logic** lists CLI/MCP/plugins, not `@specd/skills`. No finding that skills must be logic-free.

#### Summary (this spec)

| Metric                                           |         Count |
| ------------------------------------------------ | ------------: |
| Requirements reviewed                            |            13 |
| Change core domain vs globals                    | Conform (I/O) |
| Skills-package discrepancies (pre-existing)      |             3 |
| Contradictions introduced by this change’s specs |             0 |
| Missing tests (this batch / this change)         |             0 |

---

### `default:_global/conventions`

**Source:** `specs show default:_global/conventions`. Lens: ESM, naming, errors.

| Requirement                       | This change / skills                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESM only                          | `@specd/skills` `"type": "module"`; tsup `--format esm`; no `require()` / `module.exports` / `export default` under `packages/skills`. Core change files remain ESM/`NodeNext`. **Pass.** |
| `strict` via `tsconfig.base.json` | `packages/skills/tsconfig.json` extends `../../tsconfig.base.json`. **Pass.**                                                                                                             |
| kebab-case sources                | Skills sources kebab-case. **Pass.**                                                                                                                                                      |
| Named exports                     | Skills public API named exports. **Pass.**                                                                                                                                                |
| Errors extend `SpecdError`        | `SpecdSkillsError extends SpecdError`. **Pass.**                                                                                                                                          |
| Lazy list vs content              | `SkillRepository.list()` is metadata; `get`/`getBundle` load content. Aligns with lazy-loading convention. **Pass.**                                                                      |

Change specs do not reintroduce CommonJS or `any`. **No contradiction** between this change and conventions.

#### Summary (this spec)

| Metric                |                                       Count |
| --------------------- | ------------------------------------------: |
| Requirements reviewed |                                           9 |
| Implemented           | 9 (for audited skills + change ESM surface) |
| Partial               |                                           0 |
| Missing               |                                           0 |
| Discrepancies         |                                           0 |
| Missing tests         |                                           0 |

---

### `default:_global/testing`

**Source:** `specs show default:_global/testing`. Lens: Vitest, unit tests with **mocked ports**, no fs in unit tests, typed full mocks, no snapshots.

#### Skills package

| Requirement                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                               | Verdict                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Vitest, `test/` mirror, `.spec.ts`              | `package.json` `"test": "vitest run"`; tests under `test/`                                                                                                                                                                                                                                                                                                                             | **Pass**                            |
| No snapshots                                    | No `toMatchSnapshot` / `toMatchInlineSnapshot` in skills                                                                                                                                                                                                                                                                                                                               | **Pass**                            |
| Unit tests mock ports, no fs                    | `test/resolve-bundle.spec.ts`: `SkillRepository` object with all four methods (`list`, `get`, `getBundle`, `listSharedFiles`) — **good**. Unused methods are `vi.fn()` not `throw new Error('not implemented')` — **soft miss** vs letter of the spec.                                                                                                                                 | Partial                             |
| Domain/application unit tests must not touch fs | `test/template-workflow.spec.ts` uses `readFileSync` on real templates (fixture contract test). `test/domain/skill.spec.ts` uses `os.tmpdir()` + `createSkillRepository` (real adapter) under **domain** path — **integration test mis-filed**. `specd-block-manager.spec.ts` / `json-config-manager.spec.ts` hit real temp files because those modules **are** fs (see architecture). | Pre-existing layering/test-type mix |

#### This change’s core tests (globals lens, not a skills-package edit)

- `packages/core/test/domain/services/transition-checks.spec.ts`: pure Vitest, **no filesystem**. Matches “domain unit tests with no I/O.”
- `packages/core/test/application/use-cases/transition-change.spec.ts` / `get-status.spec.ts`: `{ execute } as unknown as RefreshImplementationTracking` (and similar `CountTasks` casts). Testing spec **forbids** `as unknown as Port` for **ports**. These are **use-case class** stubs, not port interfaces.
  - If spec is read narrowly: **not a Port violation**.
  - If spec is read as “no partial typed casts of collaborators”: **spirit miss**. Prefer a tiny fake implementing the execute contract without `as unknown as`.

Composition tests `createX(deps as unknown as SpecdConfig)` are pre-existing overload-testing, not new port-mock style.

#### Summary (this spec)

| Metric                                            |                                                   Count |
| ------------------------------------------------- | ------------------------------------------------------: |
| Requirements reviewed                             |                                                       6 |
| Skills: hard fails vs this change                 |                                                       0 |
| Skills: pre-existing test-boundary issues         | 2 (`template-workflow` fs; domain spec using real repo) |
| Soft mock-contract issue                          |                       1 (`vi.fn()` unused port methods) |
| Change engine unit tests vs I/O rule              |                                                 Conform |
| Discrepancies to treat as this-change regressions |                                                       0 |
| Missing tests for deferred template lifecycle     |                      1 (same as skill-templates-source) |

---

## Batch totals

| Metric                                                                                      |            Count |
| ------------------------------------------------------------------------------------------- | ---------------: |
| Specs in batch                                                                              |                4 |
| Own-spec requirements reviewed (`skill-templates-source`)                                   |               14 |
| Global requirements reviewed (architecture + conventions + testing)                         |               28 |
| Discrepancies: templates vs **new lifecycle** (deferred, still real for agents)             |                5 |
| Discrepancies: this change **specs vs globals** (domain I/O / ESM / mocked ports)           |                0 |
| Discrepancies: **pre-existing** skills architecture (domain/application fs, adapter export) |                3 |
| Discrepancies: **pre-existing** skills testing boundaries                                   | 2 (+1 soft mock) |
| Missing tests attributable to **this change’s no-op**                                       |                0 |
| Missing tests for **lifecycle template language** (explicitly deferred)                     |                1 |

**Batch verdict:** Change specs and core engine **do not** contradict globals on domain I/O, ESM, or port-mocked engine tests. `skills:skill-templates-source` is an honest **no-op**; workflow templates **still describe `pending-spec-approval` / `pending-signoff` as happy-path waits**, especially `specd-verify` “transition routes to `pending-signoff`”. That is a **known deferred** mismatch with this change’s lifecycle, not a failed implementation of the no-op delta. Skills-package hexagonal/testing issues are **pre-existing** and out of this change’s task list.
