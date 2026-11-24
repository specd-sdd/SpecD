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
