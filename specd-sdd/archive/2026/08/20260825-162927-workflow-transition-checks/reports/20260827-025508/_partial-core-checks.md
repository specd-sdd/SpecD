# Partial audit: core checks / lifecycle (change `workflow-transition-checks`)

Mode: change audit (read-only). Specs via `node packages/cli/dist/index.js changes spec-preview`. Architecture via `specs show default:_global/architecture`. Graph stats: `stale: false` but `fileCount: 0` (symbol search empty); implementation evidence from `packages/core/src` and tests.

Locked product (not re-litigated): self-sufficient `check.execute` → `CheckResult`; `AXIS_FALLBACK` spliced by canonical index (not tail-append); `workflow[]` is extras lookup not protocol; `availableSteps` = extras-bearing `schema.workflow()` rows; no hop to `pending-*`; stay-in-`ready`/`done` for approvals; `archive.publication` is not a `CheckId`; GetStatus drafts use `projectArtifacts` not `evaluate`; public blockers = failed-predicate codes; `skipHookPhases` by binding phase + selectors.

**Closed vs prior audit (do not recycle):** `_requestedTargetBlockers` dual-write is **Implemented**; `applyBindingSpecs` throws `InvalidInputError`; `executeHookEffect` / `shouldExecuteHookEffect` **removed**; GetStatus now copies `availableSteps`; unknown `workflow[].step` rejected in `buildSchema`; omit-`implementing` `verifying → implementing` is `backward`.

---

## Spec: `core:transition-checks`

### Requirements Summary

Shared evaluation of one transition attempt (and archive as an operation): stable `CheckId` + gerund `label`, `kind` predicate|effect, self-sufficient `execute(ctx)` returning `CheckResult`. Bindings carry `from`/`to`/`along` (or `archive`) plus effect `phase`/`onFailure`. Progress axis from known `workflow[]` names with missing `AXIS_FALLBACK` delivery states spliced by canonical index. Classify `along` (`forward`/`backward`/`redesign`/`recovery`/`any`). Protocol fail-fast; no pending rewrite; projections from predicates; no snapshot bag; `archive.publication` not a check; skip hooks via binding phase **plus** selectors because transition pre/post share `before-persist`.

### Implementation Status

| Area                                    | Status                | Evidence                                                                                                                                      |
| --------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Check ABI / `WorkflowCheck`             | Implemented           | `packages/core/src/application/checks/workflow-check.ts` 17–80; `Check.execute` in `transition-checks.ts` 379–399                             |
| Self-sufficient `execute`               | Implemented           | `CheckExecutionContext` host fields only (`transition-checks.ts` 337–356); I/O on `create*` constructors                                      |
| `buildAxis` splice                      | Implemented           | `transition-checks.ts` 139–156: omitted fallback inserted at first listed axis member with `listedIndex >= fallbackIndex`                     |
| `classifyAlong` omit-implementing retry | Implemented           | `transition-checks.ts` 167–203; tests `transition-checks.spec.ts` 63–73 (`ready→verifying` forward; `verifying→implementing` **backward**)    |
| Unknown strings not axis slots          | Implemented           | `buildAxis` filters `step in VALID_TRANSITIONS` (`transition-checks.ts` 140); `classifyAlong` test `reviewing` still forward (80–83)          |
| Bindings table                          | Implemented           | `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts` 28–94; `applyBindingSpecs` 442–459                                |
| `applyBindingSpecs` typed error         | Implemented           | throws `InvalidInputError` (`transition-checks.ts` 447–449); test `transition-checks.spec.ts` 394–400                                         |
| Production path                         | Implemented           | `createWorkflowCheckRegistry` (`workflow-check-registry.ts` 67–109) attaches `create*` onto specs — **not** domain `TRANSITION_BINDINGS`      |
| No `archive.publication`                | Implemented           | `ARCHIVE_BINDING_SPECS` 84–94; test `transition-checks.spec.ts` 390–391                                                                       |
| No snapshot bag                         | Implemented           | no `PredicateSnapshots` / `gatherPredicateSnapshots` under `packages/core/src`                                                                |
| Skip selectors in effect `execute`      | Implemented           | `hook-effect.ts` 133–149: `all` / `target.pre` / `source.post` / archive `pre`/`post`; not `binding.phase` alone                              |
| Dead `executeHookEffect` helpers        | Implemented (removed) | `execute-hook-effect.ts` now only `matchingEffects` + `hookFailureMode`; grep `executeHookEffect` / `shouldExecuteHookEffect`: **no matches** |

### Discrepancies

**1. Domain stub `TRANSITION_BINDINGS` remain (nit)**

- **Spec:** Domain MAY export `run(facts)` + stub `Check`; stubs MUST NOT be the production `execute` path.
- **Code:** `check-bindings.ts` 96–129 materializes domain stubs for matcher tests. Production wires `createWorkflowCheckRegistry`. Domain `hookPre`/`hookPost` stubs skip I/O.
- **Interpretation A (spec right):** A host importing `domain` `TRANSITION_BINDINGS` would skip real hooks. **Interpretation B (code right):** Explicitly documented test fixtures; use cases require injected application bindings.
- **Severity:** nit (production path complies).

**2. `ArchiveChange` still switches on `check.id` for overlap skip side-effects (minor)**

- **Spec:** Use cases MUST NOT `switch` on `CheckId` to gather facts / map skip / launch hooks. Mapping a **failed** predicate to a typed error is allowed.
- **Code:** Failed-predicate mapping is allowed (`archive-change.ts` `throwMappedArchiveFailure` 1399–1458; `transition-change.ts` `_mapFailedPredicate`). Separately, `ArchiveChange` 399–404 branches `check.id === 'spec.overlap' && outcome === 'skip'` to invalidate peers.
- **Interpretation A:** Skip-triggered invalidation should be a generic post-predicate policy (details on the result), not an id switch. **Interpretation B:** Archive orchestration after predicates; not hook launch or skip mapping.
- **Severity:** minor.

No remaining critical/major gaps on axis splice, ABI, or dead hook helpers.

### Test Coverage

- `packages/core/test/domain/services/transition-checks.spec.ts`: redesign, recovery, omit-implementing forward/backward, omit-ready still forward, unknown `reviewing` does not invert, impl vs redesign, `approval.spec` vs `ready→designing`, `InvalidInputError`, no `archive.publication`.
- `packages/core/test/application/use-cases/transition-change.spec.ts`: skip `all` still fails tasks; `target.pre` vs `source.post` independently; source.post before target.pre (registry order).
- `packages/core/test/application/checks/workflow-check-factories.spec.ts`: factory ABI.

### Missing Tests

- Direct `buildAxis` insertion against a list that would fail under tail-append (e.g. listed `verifying` before omitted `implementing`) — covered only via `classifyAlong` outcomes.
- No test that `createTransitionChange` composition rejects domain `TRANSITION_BINDINGS` (TypeScript + composition resolver already require registry bindings).

### Spec Dependency Chain

- `core:change` — `VALID_TRANSITIONS`, stay in `ready`/`done`. **Consistent** (`change-state.ts` 30–42: `ready` → implementing/designing only).
- `core:workflow-model` — lookup `workflow[]`, axis splice, unknown step at `buildSchema`. **Consistent.**
- `core:schema-format` — YAML workflow shape; unknown step `SchemaValidationError`. **Consistent.**
- `default:_global/architecture` — domain purity; typed `SpecdError`. **Consistent** for `InvalidInputError` (`invalid-input-error.ts` extends `SpecdError`). Domain stubs are I/O-free; application checks own ports.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 1     |
| nit      | 1     |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary

Sole authority for lifecycle interpretation: project from caller-supplied predicate `CheckResult`s (no I/O, no snapshot bag, no `check.run` fallback). `validTransitions` = protocol; `availableTransitions` = injected predicates with no `fail`; `availableSteps` = extras-bearing `schema.workflow()` rows. `_resolveTarget` identity (no pending rewrite). `isReady` from `workflow.requires` when those results are present — MUST NOT re-walk `requires` to emit a **different** blocker code (`INCOMPLETE_ARTIFACT` vs `MISSING_ARTIFACT`) for the same artifact. Public `blockers` from failed predicates (+ review). Next-action matrix; archiving recovery; `CompileContext` not an evaluate consumer.

### Implementation Status

| Area                                    | Status          | Evidence                                                                                                                                                                                |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predicate-only `evaluate`               | Implemented     | `lifecycle-engine.ts` 128–154; uses `options.checksByTarget`                                                                                                                            |
| `validTransitions`                      | Implemented     | `VALID_TRANSITIONS[change.state]` (131)                                                                                                                                                 |
| `availableTransitions`                  | Implemented     | Only targets with **injected** checks and no `fail` (145–154)                                                                                                                           |
| `availableSteps` extras-only            | Implemented     | `schema.workflow().map(...)` (156–194). Test 837–851: omit `implementing` → not in `availableSteps`, still in `validTransitions`                                                        |
| `_resolveTarget`                        | Implemented     | Identity (309–311)                                                                                                                                                                      |
| Dual-write INCOMPLETE vs MISSING        | **Implemented** | `_requestedTargetBlockers` 594–606: if any `workflow.requires` result is present, skip `_artifactBlockers` walk. Test 854–866: `INCOMPLETE_ARTIFACT` present, `MISSING_ARTIFACT` absent |
| `isReady` from requires check           | Implemented     | 166–172: `requiresFailed` from `workflow.requires` fail when `evaluationChecks` defined                                                                                                 |
| GetStatus copies `availableSteps`       | Implemented     | `get-status.ts` 227, 496, 512                                                                                                                                                           |
| GetStatus drafts use `projectArtifacts` | Implemented     | `get-status.ts` 609–610; test `get-status.spec.ts` 764–804 (`evaluate` spy not called)                                                                                                  |
| Public blockers = failed predicates     | Implemented     | Engine `_blockersFromFailedChecks` 761–778; GetStatus `_mergeBlockers` 696–731 flattens failed `checksByTarget`                                                                         |
| nextAction matrix                       | Implemented     | `lifecycle-engine.ts` 781–967; tests in `lifecycle-engine.spec.ts`                                                                                                                      |

### Discrepancies

**Prior major (dual-write) is closed.** Current `_requestedTargetBlockers` only DAG-walks `requires` when **no** `workflow.requires` row exists in `requestedChecks`. Domain `workflow.requires` `run()` always fails with `INCOMPLETE_ARTIFACT` including `status: 'missing'` (`workflow-requires.ts` 44–50). That is the intended single code when the check ran.

**1. `_isStepPermitted` fallback still special-cases pending gates (nit)**

- **Spec:** `_resolveTarget` must not rewrite to pending; drain states remain in `VALID_TRANSITIONS`.
- **Code:** When `checksByTarget[step]` is missing (`ValidateArtifacts` empty map), `_isStepPermitted` 313–324 still keys `pending-spec-approval` / `pending-signoff` against `approvals.*`. Not a parking hop for new work (`ready` has no pending target in `VALID_TRANSITIONS`).
- **Interpretation A:** Dead pending routing in a fallback path. **Interpretation B:** Drain-state protocol for empty-check consumers.
- **Severity:** nit.

**2. `LifecycleEngine` is a domain class (nit vs architecture)**

- **Architecture:** Stateless domain operations SHOULD be plain functions.
- **Code:** `class LifecycleEngine` with instance methods (`lifecycle-engine.ts` 123–127). Pre-existing pattern; `projectArtifacts` is also an instance method.
- **Interpretation A:** Extract `evaluate` / `projectArtifacts` as functions. **Interpretation B:** Engine is the established domain service shape for this package.
- **Severity:** nit (not unique to this change).

**3. Stale comment on parking hops (nit)**

- `LifecycleEngineOptions.approvals` JSDoc still says “when a parking hop is requested” (`lifecycle-engine.ts` 29–31) while `_resolveTarget` is identity.
- **Severity:** nit.

### Test Coverage

- Dual-write: `lifecycle-engine.spec.ts` 854–866.
- extras vs protocol: 837–851.
- Incomplete tasks hide `verifying` from `availableTransitions`; nextAction implement vs verify; done backward hops; archiving escapes.
- GetStatus drafts: `get-status.spec.ts` 743–804.

### Missing Tests

- GetStatus-level assertion that omitting an `implementing` extras row still lists `implementing` in `lifecycle.validTransitions` (engine covered; DTO copy untested).
- `_requestedTargetBlockers` when `workflow.requires` is **absent** (empty injection) still emits `MISSING_ARTIFACT` — documents the allowed fallback, not dual-write.

### Spec Dependency Chain

- `core:change` — persisted facts, no pending enter from ready/done. **Consistent.**
- `core:workflow-model` — extras vs protocol. **Consistent** with `availableSteps` ← `schema.workflow()`.
- `core:schema-format` — DAG / artifacts. **Consistent** (`projectArtifacts`, topo `nextArtifact` 737–758).
- `core:transition-checks` — projections / blocker codes. **Consistent** with current dual-write guard.
- `default:_global/architecture` — **nit** class-vs-function (above). Engine performs no I/O.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| nit      | 3     |

---

## Spec: `core:workflow-model`

### Requirements Summary

`workflow[]` `step` is a lookup onto existing `ChangeState`. Omitting a row does not delete protocol membership (`workflowStep` null). Unknown step names: `buildSchema` throws `SchemaValidationError`; they never occupy the axis or reach hop evaluation. Requires / task-completion evaluated as shared checks. `availableSteps` / hop availability from engine projections. Axis splice via `buildAxis`. Hooks: `run:` as effects with same matcher; `instruction:` not checks. `CompileContext` MUST NOT call `evaluate`.

### Implementation Status

| Area                                     | Status      | Evidence                                                                                                   |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Lookup vs protocol                       | Implemented | `schema.workflowStep`; omitted row → null extras; `VALID_TRANSITIONS` unchanged                            |
| Unknown step at `buildSchema`            | Implemented | `build-schema.ts` 687–695; test `build-schema.spec.ts` 37–41; plugin path `resolve-schema.spec.ts` 748–773 |
| Axis splice / omit-implementing backward | Implemented | `classifyAlong` + tests (see transition-checks)                                                            |
| Shared requires/taskCompletion           | Implemented | application `createWorkflowRequires` / `createWorkflowTaskCompletion`; engine projects results             |
| `CompileContext` not evaluate            | Implemented | `compile-context.spec.ts` asserts no `availableSteps` on result; workflow-model constraint                 |
| GetStatus/engine extras-only             | Implemented | engine map + GetStatus copy                                                                                |

### Discrepancies

None current on unknown-step rejection site (hop-time vs build time). `classifyAlong` still defensively filters non-`ChangeState` strings; resolved schemas never contain them (`buildSchema` already threw). That is belt-and-suspenders, not a second rejection site.

**1. Intermediate merge may still list unknown steps (nit)**

- **Spec:** Resolved schemas never contain unknown names; `buildSchema` is the rejection site.
- **Code:** `merge-schema-layers.spec.ts` still expects merged YAML to retain `reviewing` before resolve/`buildSchema`. Resolve then throws (`resolve-schema.spec.ts` 748–773).
- **Interpretation A:** Merge should reject unknown steps earlier. **Interpretation B:** Merge is structural; semantic validation belongs at `buildSchema` as specified.
- **Severity:** nit (matches spec’s named rejection site).

### Test Coverage

- `build-schema.spec.ts` unknown / duplicate / `requiresTaskCompletion` subset.
- `transition-checks.spec.ts` axis classification.
- `lifecycle-engine.spec.ts` extras vs protocol.

### Missing Tests

- End-to-end: schema YAML with `step: reviewing` fails at `buildSchema` **and** `TransitionChange` is never invoked (only build/resolve covered).

### Spec Dependency Chain

- `core:change` — **Consistent.**
- `core:schema-format` — unknown step `SchemaValidationError`. **Consistent.**
- `core:build-schema` — implementation site. **Consistent.**
- `core:compile-context` — must not evaluate hops. **Consistent** (consumer; not in this batch’s code edits beyond tests).
- `core:get-status` / `core:transition-change` / `core:archive-change` / `core:hook-execution-model` — shared matcher. **Consistent** with extras-only `availableSteps` and check pipeline.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| nit      | 1     |

---

## Spec: `core:schema-format`

### Requirements Summary

`workflow` is optional lookup config, not a state-machine definition. `step` names existing lifecycle states. Declaration order is display + listed names on the `along` axis; missing delivery states spliced by fallback index. Unknown `step` MUST throw `SchemaValidationError` at `buildSchema` and MUST NOT occupy an axis slot or reach hop evaluation. `requiresTaskCompletion` subset of `requires` and `hasTasks: true`.

### Implementation Status

| Area                                | Status      | Evidence                                                             |
| ----------------------------------- | ----------- | -------------------------------------------------------------------- |
| Lookup language in delta            | Implemented | change delta `schema-format/spec.md.delta.yaml` (workflow is extras) |
| Unknown step validation             | Implemented | `build-schema.ts` 687–695                                            |
| `requiresTaskCompletion` invariants | Implemented | `build-schema.ts` 721–739                                            |
| Duplicate steps                     | Implemented | `build-schema.ts` 678–685                                            |
| Axis occupied only by ChangeState   | Implemented | unknown never stored on `Schema`; `buildAxis` also filters           |

### Discrepancies

None current. Prior tension (unknown step surviving to hop-time) is **Implemented** as build-time `SchemaValidationError`.

YAML-at-boundary (architecture): `buildSchema` throws `SchemaValidationError` (extends `SpecdError`) after infrastructure parse — **consistent** with `default:_global/architecture` “YAML inputs validated at the infrastructure boundary” / typed schema errors.

### Test Coverage

- `build-schema.spec.ts` 32–41 accept valid ChangeState / reject `reviewing`.
- `resolve-schema.spec.ts` plugin create with `reviewing` rejects.

### Missing Tests

- Explicit message assertion: `workflow step 'reviewing' is not a valid lifecycle state` (throw type covered; exact string optional).

### Spec Dependency Chain

- `core:delta-format` / `core:selector-model` / `core:content-extraction` / `core:schema-merge` — unchanged by workflow-lookup semantics. **No contradiction** with extras-vs-protocol (those specs do not define lifecycle membership).
- Downstream `core:workflow-model` / `core:transition-checks` — **Consistent.**

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| nit      | 0     |

---

## Spec: `core:change`

### Requirements Summary

Fixed `ChangeState` set including drain parking states. When approval gates are on, the change **stays** in `ready` or `done` until `ApproveSpec` / `ApproveSignoff`; `change transition` does not enter `pending-*`. `VALID_TRANSITIONS['ready']` is `implementing` and `designing` only. Drain: `pending-spec-approval` → `spec-approved` | `designing`.

### Implementation Status

| Area                            | Status      | Evidence                                                                                           |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Stay-in-ready/done              | Implemented | `change-state.ts` 30–42; `ready`: `['implementing', 'designing']`; `done`: no `pending-signoff`    |
| Drain-only pending              | Implemented | `pending-spec-approval` / `pending-signoff` targets only drain hops                                |
| No pending rewrite in engine    | Implemented | `_resolveTarget` identity                                                                          |
| TransitionChange persist target | Implemented | `transition-change.ts` 203: `effectiveTarget = requestedTarget`; `_assertDrainAndGateTargets` 323+ |

### Discrepancies

None vs locked product. Next-action still has copy for **if** `state === 'pending-spec-approval'` (`lifecycle-engine.ts` 850–857) — drain UX, not a new parking hop.

### Test Coverage

- Entity / transition tests historically cover `VALID_TRANSITIONS`.
- `transition-checks.spec.ts` pending→spec-approved classified `forward` (delivery alias), not a new enter-from-ready hop.

### Missing Tests

- None required for this batch beyond existing stay-in-ready execute tests in `transition-change.spec.ts` (no persist to pending).

### Spec Dependency Chain

- `core:workflow-model` / `core:lifecycle-engine` / `core:transition-checks` — **Consistent** (protocol vs extras; approvals as checks on delivery edge).
- `default:_global/architecture` — entity throws typed errors on invalid `transition()`. **Consistent** (not re-audited line-by-line here; `isValidTransition` is the machine).
- Other deps (`change-manifest`, `spec-metadata`, …) — not implicated by this change’s check model.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| nit      | 0     |

---

## Spec: `core:hook-execution-model`

### Requirements Summary

Default path auto-executes matching `run:` effects after predicates. Slot/`onFailure` from binding, not check id. Transition both hooks `before-persist`/`abort`; archive pre `before-persist`/`abort`, post `after-persist`/`collect`. `skipHookPhases`: transition `source.pre|source.post|target.pre|target.post|all`; archive `pre|post|all`. Skip MUST use phase **plus** selectors because transition pre/post share `before-persist`. `instruction:` not in the check pipeline. `RunStepHooks` is a constructor dep of hook checks.

### Implementation Status

| Area                                | Status                      | Evidence                                                                                                                                                |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matcher + phase selection           | Implemented                 | `matchingEffects` (`execute-hook-effect.ts` 23–35); `TransitionChange` 238–245 `before-persist` only; `ArchiveChange` before-persist then after-persist |
| `onFailure`                         | Implemented                 | `hookFailureMode` + `throwHookFailed`; archive post `collect`                                                                                           |
| Skip selectors in `execute`         | Implemented                 | `hook-effect.ts` 133–149 (not use-case `check.id === 'hook.pre'`)                                                                                       |
| `source.pre` / `target.post` no-ops | Implemented                 | Accepted on `HookPhaseSelector` (`transition-change.ts` 34); unused by `HookEffectCheck`                                                                |
| `instruction:` not checks           | Implemented                 | Bindings only `hook.pre`/`hook.post` `run:` effects                                                                                                     |
| No dead execute helpers             | Implemented                 | helpers removed; live path is `HookEffectCheck.execute`                                                                                                 |
| Registry order (post then pre)      | Implemented (product tests) | `TRANSITION_BINDING_SPECS` lists `hook.post` then `hook.pre` (`check-bindings.ts` 67–78); test `source.post runs before target.pre`                     |

### Discrepancies

**1. Spec example says pre then post; code/tests run post then pre (minor, spec-drift)**

- **Spec** (`hook-execution-model` delta example “Default transition with hooks”): matching before-persist effects described as “pre then source.post on forward”.
- **Code:** Registry order is `hook.post` then `hook.pre`; `matchingEffects` preserves that order; `transition-change.spec.ts` 1361 asserts `source.post` **before** `target.pre`.
- **Interpretation A (spec right):** Example/requirement should match a pre-then-post pipeline. **Interpretation B (code right):** Forward exit completes source.post before entering target.pre; the example is stale.
- **Locked product** does not prescribe intra-slot order. Treat as **spec example drift**, not a skipHookPhases regression.
- **Severity:** minor.

No discrepancy on skip-by-phase-alone: skip lives in `HookEffectCheck` using pre/post identity, while the use case only filters `binding.phase`.

### Test Coverage

- `transition-change.spec.ts`: skip `all` / `target.pre` / `source.post`; redesign skips source.post; fail-fast before persist.
- `archive-change.spec.ts`: skip `all` / `pre` / `post`.
- `matching-effects.spec.ts`: phase filtering on domain fixtures.

### Missing Tests

- Explicit assertion that skip `target.pre` does **not** skip `hook.post` solely because both bindings share `before-persist` (partially covered by independent skip tests).
- Spec example order vs registry order (would fail if example were taken as normative).

### Spec Dependency Chain

- `core:workflow-model` — matcher / along filter for post. **Consistent** (post `along = forward` only).
- `core:schema-format` — hook YAML. **Consistent.**
- `core:transition-checks` — effects after predicates; skip selectors. **Consistent** except example order (above).
- `core:transition-change` / `core:archive-change` / `core:run-step-hooks` / CLI skip flags — consumers. **Consistent** on phase+selector skip.
- `core:hook-runner-port` / `core:get-hook-instructions` / `core:config` — instruction vs run split. **Consistent** (`instruction:` not registered).

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 1     |
| nit      | 0     |

---

## Architecture consistency (`default:_global/architecture`)

| Constraint                     | Status      | Notes                                                                                                                             |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Domain no I/O                  | Implemented | `domain/checks/*` `run`/`execute` use `ctx` facts only; application `create*` own ports                                           |
| Application via ports          | Implemented | `CountTasks`, `RunStepHooks`, ready-facts ports                                                                                   |
| Typed domain errors            | Implemented | `InvalidInputError`, `SchemaValidationError`, `HookFailedError` extend `SpecdError`; generic `Error` on missing binding **fixed** |
| YAML → `SchemaValidationError` | Implemented | `buildSchema`                                                                                                                     |
| Stateless domain as functions  | Nit         | `LifecycleEngine` class (pre-existing)                                                                                            |
| Inner layers no outer imports  | Implemented | no `domain/` → `application/` imports in `packages/core/src`                                                                      |

---

## Batch totals

| Spec                        | critical | major | minor | nit   |
| --------------------------- | -------- | ----- | ----- | ----- |
| `core:transition-checks`    | 0        | 0     | 1     | 1     |
| `core:lifecycle-engine`     | 0        | 0     | 0     | 3     |
| `core:workflow-model`       | 0        | 0     | 0     | 1     |
| `core:schema-format`        | 0        | 0     | 0     | 0     |
| `core:change`               | 0        | 0     | 0     | 0     |
| `core:hook-execution-model` | 0        | 0     | 1     | 0     |
| **Total**                   | **0**    | **0** | **2** | **5** |

### Focus items (current)

| Item                                                                   | Status                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `_requestedTargetBlockers` dual-write INCOMPLETE vs MISSING            | **Implemented** (`hasRequiresResult` skip; test 854–866)                                                                          |
| Unknown workflow step at `buildSchema`                                 | **Implemented**                                                                                                                   |
| `applyBindingSpecs` → `InvalidInputError`                              | **Implemented**                                                                                                                   |
| Dead `executeHookEffect` helpers                                       | **Implemented** (removed)                                                                                                         |
| GetStatus/engine `availableSteps` extras-only                          | **Implemented**                                                                                                                   |
| `classifyAlong` omit-implementing `verifying→implementing` is backward | **Implemented**                                                                                                                   |
| GetStatus drafts `projectArtifacts` not `evaluate`                     | **Implemented**                                                                                                                   |
| Public blockers = failed-predicate codes                               | **Implemented**                                                                                                                   |
| `skipHookPhases` phase + selectors                                     | **Implemented**                                                                                                                   |
| Remaining gaps                                                         | Archive `spec.overlap` skip id-switch (minor); hook example pre-then-post vs code post-then-pre (minor spec-drift); nits as above |
