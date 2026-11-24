# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260827-025508
- **Graph:** indexed this session (`stale: false`; stats `fileCount` was 0 after force skip; `graph search` still resolved symbols)
- **CLI:** `node packages/cli/dist/index.js`

## Aggregated counts (partials, may overlap themes)

| Source           | critical |         major | minor | nit |
| ---------------- | -------: | ------------: | ----: | --: |
| core-checks      |        0 |             0 |     2 |   5 |
| core-usecases    |        0 |           1\* |    11 |  11 |
| cli-skills       |        0 |             1 |    ~4 | n/a |
| **This compile** |    **0** | **see notes** |       |     |

\* `core:config` workspace file still uses pending-hop language. **Merged** spec-preview + code are in-place gates. This is expected until archive; it is not a runtime defect of the change.

**Prior majors (dual blockers, unknown step vs buildSchema, empty checksByTarget spies, Repair Guide stdout, hook-progress on transition) are closed in this pass.**

After this compile, remaining **actionable** majors were docs (`cli-reference` archive JSON stream). Those docs, status drafted help, `docs/guide/workflow.md` JSON bus, and an archive NDJSON test were fixed in the same implementing session **after** the partials were written — re-audit those files before treating DOC-1 as still open.

Locked product remains implemented: splice axis, lookup `workflow[]`, stay-in-`ready`/`done`, check bus, archive `stream: change-archive`.

## Detailed Findings

Verbatim partial reports follow.

---

## Partial: \_partial-core-checks.md

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

---

## Partial: \_partial-core-usecases.md

# Spec compliance — core use cases (partial)

Change: `workflow-transition-checks`  
Scope: `core:get-status`, `core:transition-change`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:config` plus depth-1 deps and `default:_global/architecture`.  
Source: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`.  
Code: `packages/core` (read-only). Graph (current, `stale: false`): `GetStatus` (`get-status.ts:281`), `TransitionChange` (`transition-change.ts:109`), `ArchiveChange` (`archive-change.ts:275`), `ApproveSpec` (`approve-spec.ts:30`), `ApproveSignoff` (`approve-signoff.ts:30`), `ValidateArtifacts` (`validate-artifacts.ts:114`), `GetArtifactInstruction` (`get-artifact-instruction.ts:52`).

Locked product (not re-litigated): self-sufficient checks; no snapshot bag (`gatherPredicateSnapshots` absent); stay-in-ready/done; drafts = `projectArtifacts` not `evaluate`; `TransitionChange` requires `transitionBindings` (no ctor default to domain `TRANSITION_BINDINGS`).

Vs previous partial (`reports/20260827-021654/_partial-core-usecases.md`): previously **major** verify gaps for draft parent cascade, empty `checksByTarget` spies, and auto-select of persisted-complete children are **now Implemented** in tests. Previously missing `availableSteps` on GetStatus DTO is **now Implemented**.

Focus checks:

| Check                                                             | Verdict                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus exposes `availableSteps`                                | **Implemented** — `LifecycleContext.availableSteps`; active path copies `verdict.availableSteps`; drafts / schema-miss / unchanged set `[]` |
| Drafts DAG via `projectArtifacts`; missing schema artifacts       | **Implemented** — `_buildDraftedResult` calls `projectArtifacts` only; test projects missing `proposal`                                     |
| Draft `pending-parent-artifact-review` without `evaluate`         | **Implemented** — spy + effectiveStatus assertion                                                                                           |
| Validate `evaluate(..., { checksByTarget: {} })`                  | **Implemented** — code + spy                                                                                                                |
| Validate persisted-complete child blocked by parent review        | **Implemented**                                                                                                                             |
| GetArtifactInstruction empty `checksByTarget`                     | **Implemented** — code + spy                                                                                                                |
| Auto-select ignores persisted complete when parent pending-review | **Implemented** — selects `proposal`                                                                                                        |
| TransitionChange schema miss throws                               | **Implemented** — `SchemaNotFoundError` (no skip-checks path)                                                                               |
| Skip selectors independent                                        | **Implemented** — `target.pre` vs `source.post`; `'all'` still fails incomplete tasks                                                       |
| No persist on pending / approval fail                             | **Implemented** — `_mapFailedPredicate` throws before `mutate`; stay-in-ready/done tests                                                    |
| Approvals stay in ready/done                                      | **Implemented**                                                                                                                             |
| Config Approvals merged vs workspace                              | **Merged matches code**; **workspace `specs/core/config/spec.md` still pending-hop language** (major docs lag until archive)                |

Neither merged spec nor code is assumed always right. Where they diverge, both interpretations are listed.

---

## core:get-status

### Requirements Summary

Merged (workspace + deltas):

1. Input (`name`, optional refresh, `ifModifiedSince`)
2. Result: `change` xor `draftView`, artifact statuses, review, blockers, `nextAction`
3. Revision short-circuit
4. Drafted read-only status: DAG via `projectArtifacts` (same cascade as `evaluate` with empty checks); empty transitions; no mutate commands
5. Implementation-tracking projection
6. Optional pre-read refresh (active only)
7. Drift-aware display status
8. Task counts from `workflow.taskCompletion` details — no second CountTasks, no global snapshot bag
9. Execute matching predicates then project (`executeChecksByLegalTargets` → `evaluate`)
10. `ChangeNotFoundError` for unknown names
11. Constructor: `transitionBindings`; CountTasks not a GetStatus port
12. Config factory via `resolveGetStatusDeps`
13. Effective status cascade
14. Lifecycle: `validTransitions`, `availableTransitions`, **`availableSteps`** (extras-bearing `schema.workflow()` rows), `nextAction`
15. Blockers from failed predicates; `impl.filesResolved` vs `impl.linksInScope` bypass
16. Schema miss degrades (empty hops/checks, no throw)
17. Identifies blockers / factory completeness

### Implementation Status

**Implemented.**

- Active (`_buildActiveResult`): `projectArtifacts` → `executeChecksByLegalTargets(this._transitionBindings, …)` → `evaluate(..., { checksByTarget })` → paint `taskCompletion` via `taskCompletionFromChecks`. `availableSteps = verdict.availableSteps`.
- Draft (`_buildDraftedResult`): `getDraft` only; **`projectArtifacts`, not `evaluate`**; `availableTransitions` / `validTransitions` / `availableSteps` empty; no refresh.
- Constructor args include required `transitionBindings` (no default table).
- Schema miss: catch around `schemaProvider.get()` only; empty `availableSteps`.

### Discrepancies

None critical/major vs **merged** spec.

- **nit:** Some tests still describe CountTasks as “task projection for painting”; painting is from check details. Behaviour matches (CountTasks once inside the check).

### Test Coverage

`packages/core/test/application/use-cases/get-status.spec.ts`:

- Task counts; incomplete implementing tasks omit `verifying` / `INCOMPLETE_TASKS`
- Check rows / `checksByTarget`; `impl.*` bypass; predicate blocker `label` / `checkId`
- Draft empty transitions; **no `evaluate`**; **`pending-parent-artifact-review`**; **missing schema artifacts on DAG**
- Schema provider failure; `ifModifiedSince`
- Composition: `GetStatusDeps.transitionBindings`

Engine (depth-1 `core:lifecycle-engine`): `availableSteps` omits extras-less `implementing` while `validTransitions` includes it (`lifecycle-engine.spec.ts`).

### Missing Tests

- **minor:** GetStatus **active** path does not assert `lifecycle.availableSteps` (only drafts assert `[]`). Extras-vs-protocol contract is covered on the engine, not on this DTO copy.
- **minor:** No spy that CountTasks is not invoked a second time after `evaluate` (implied by constructor + paint helper).

### Spec dependency chain

`core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`, `core:drafted-change-view`.

Aligned with engine extras-vs-protocol split. Workspace `core:config` Approvals still pending-hop until archive (see `core:config`).

`default:_global/architecture`: application use case; I/O via ports; engine remains I/O-free. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 17      |
| Implemented           | 17      |
| Partial               | 0       |
| Missing               | 0       |
| Discrepancies         | 1 nit   |
| Test gaps             | 2 minor |

---

## core:transition-change

### Requirements Summary

1. Input: requested target is persist target; `allowOutOfScope`; `skipHookPhases` skips **effects** only
2. Approval gates baked at construction
3. Change must exist
4. Optional pre-transition refresh
5. Spec approval is a check, not a pending hop — stay in `ready`
6. Signoff is a check, not a pending hop — stay in `done`
7. Pending states drain-only; new work MUST NOT persist pending
8. Direct persist of requested target when predicates pass
9. `workflow.requires` / `workflow.taskCompletion` in the same evaluation
10. Validation clearing `verifying → implementing`
11. Skill-aligned backward hop invalidation
12. Designing from any state
13. `archiving → archivable` recovery (`along=recovery`)
14. Pre/post hooks via matching **effects** (`phase` + skip selector, not `check.id` in the loop)
15. Entity `transition` + event + `mutate`
16. Progress callback
17. Deps: `transitionBindings` **required**; MUST NOT default to domain stub `TRANSITION_BINDINGS`
18. Factory `resolveTransitionChangeDeps`
19. Schema miss MUST throw (not skip checks)

### Implementation Status

**Implemented.**

- `schema = await this._schemaProvider.get()` is not swallowed; tests expect `SchemaNotFoundError`.
- `effectiveTarget = requestedTarget`; no rewrite to pending.
- Predicates: `executeMatchingPredicates(this._transitionBindings, …)` then `evaluate` with `{ [requestedTarget]: evaluation.checks }`.
- Failed `approval.spec` / `approval.signoff` → `InvalidStateTransitionError` `{ type: 'approval-required' }` **before** `mutate`.
- `_assertDrainAndGateTargets` blocks targeting pending when gate off.
- Constructor: `transitionBindings: readonly CheckBinding[]` — no default. Domain `TRANSITION_BINDINGS` remains for matcher tests / stubs only; composition injects registry `create*` bindings.
- `_executeEffect` forwards `skipHookPhases` into check context; does not `switch` on `check.id` to skip. Independent selectors covered by tests (`target.pre` vs `source.post`; `'all'` still runs `workflow.taskCompletion`).

### Discrepancies

- **nit:** Purpose/constraints in merged spec still mention “approval-gate routing … centralized through LifecycleEngine.” Code **projects** check results; routing to pending is gone. Copy leftover, not a runtime bug.
- **minor (use-case vs binding):** `ready → verifying` with spec gate is matched by bindings (`transition-checks.spec.ts`). `TransitionChange` execute tests cover `ready → implementing`, not a dedicated `to: 'verifying'` from `ready` with `approvals.spec: true`. Same predicate path; unproven at this use case.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`:

- Schema miss throws (does not skip checks)
- Stay in `ready` / `done` on approval-required
- Consent then persist requested target
- Drain pending → spec-approved / signed-off
- Reject explicit `to: pending-spec-approval` from ready
- `skipHookPhases` `target.pre` / `source.post` independently
- `'all'` still fails incomplete tasks
- `mutate` on successful persist

Composition: deps include `transitionBindings` (empty array accepted; no silent `TRANSITION_BINDINGS` default).

### Missing Tests

- **minor:** `execute({ to: 'verifying' })` from `ready` with spec gate on — stay in `ready`, `approval-required` (config “any forward leave”).
- **minor:** Spy `mutate` **not** called on approval-required / pending target (state-on-original-object is weaker if `mutate` cloned).

### Spec dependency chain

`core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

Aligned with in-place approval checks. Architecture: use case maps failed checks to typed errors; entity still owns `transition`.

### Counts

|                       | n                     |
| --------------------- | --------------------- |
| Requirements reviewed | 23                    |
| Implemented           | 23                    |
| Partial               | 0                     |
| Missing               | 0                     |
| Discrepancies         | 1 nit, 1 untested hop |
| Test gaps             | 2 minor               |

---

## core:archive-change

### Requirements Summary

Archival pipeline plus deltas: named archive checks (`schema.nameMatch`, `archive.archivable`, `workspace.readOnly`, `deps.consistent`, `impl.*`, `spec.overlap`); effects by binding `phase`; inject `archiveBindings`; **must not keep unused `RunStepHooks` instance field**; ctor param OK for default bindings; `approval.signoff` not an archive binding.

### Implementation Status

**Implemented** for delta-focused items.

- Instance fields include `_archiveBindings`; **no `_runStepHooks`**.
- Ctor `runStepHooks` used only when `archiveBindings` omitted (`defaultArchiveBindings`).
- Schema miss throws (`archive-change.spec.ts`).

### Discrepancies

- **nit:** `ArchiveChangeDeps.runStepHooks` remains **required** even when `archiveBindings` is provided. Spec forbids a stored unused field, not an unused ctor argument. Interpretation A (leftover wiring for defaults) preferred; B (factory still reconstructs a use-case-level hook port) is spec-strict but not a runtime defect.

### Test Coverage

Historical overlap / readonly / impl / hooks / rollback. Schema miss throw exists.

### Missing Tests

- **minor:** Explicit `archiveBindings` + unused/throwing ctor `runStepHooks` mock — predicates/effects must not invoke that mock.
- **minor:** `approval.signoff` not in `ARCHIVE_BINDING_SPECS` (belongs with bindings tests).

### Spec dependency chain

Includes `core:transition-checks`. Consistent with `ARCHIVE_BINDING_SPECS`. Architecture: application orchestration + ports.

### Counts

|                           | n                |
| ------------------------- | ---------------- |
| Requirements reviewed     | 31 (delta focus) |
| Implemented (delta focus) | yes              |
| Discrepancies             | 1 nit            |
| Test gaps                 | 2 minor          |

---

## core:approve-spec

### Requirements Summary

Gate guard; lookup; hashes; **stay in `approval.spec` `from` states (`ready`)**; drain `pending-spec-approval` → `spec-approved`; `mutate`; no hop to pending; factory `contentHasher`.

### Implementation Status

**Implemented.** `boundFromStates('approval.spec')` plus drain; `recordSpecApproval`; `transition('spec-approved')` only if already `pending-spec-approval`. Happy path from `ready` stays `ready`.

### Discrepancies

- **nit:** Ctor param still named `hasher`; composition field `contentHasher`. Mapping is correct.
- **nit:** Describe “not in pending-spec-approval” still uses drafting; merged verify says not in ready or pending. Behaviour matches.

### Test Coverage

Stay in `ready`; drain pending; gate disabled; not-found; schema mismatch before mutate. Composition `contentHasher`.

### Missing Tests

- **minor:** Explicit spy that `transition('pending-spec-approval')` is never called (implied by stay-in-ready).

### Spec dependency chain

`core:transition-checks` for `from` states. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:approve-signoff

### Requirements Summary

Symmetric: stay in `done`; drain `pending-signoff` → `signed-off`; factory `contentHasher`.

### Implementation Status

**Implemented.** Same structure as ApproveSpec.

### Discrepancies

Same nits as ApproveSpec (`hasher` vs `contentHasher`; stale describe).

### Test Coverage

Stay in `done`; drain pending; gate/lookup/mismatch. Composition `contentHasher`.

### Missing Tests

- **minor:** Spy no `transition('pending-signoff')` on happy path.

### Spec dependency chain

`boundFromStates('approval.signoff')` → `['done']`.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:validate-artifacts

### Requirements Summary

Full validation pipeline plus: DAG status / next-artifact from `LifecycleEngine.evaluate` with **empty `checksByTarget`**. Must not run hop predicates / `executeChecksByLegalTargets`. No snapshot bag. Dependency order MUST use **effective** status (persisted `complete` blocked by parent `pending-review`).

### Implementation Status

**Implemented.**

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Empty map ⇒ no hop `execute`. DAG from `projectArtifacts` inside `evaluate`. Parent-review blocks child re-validation (test asserts failure + not `validated`).

### Discrepancies

- **nit:** Spec title says “from engine projectArtifacts” while body mandates `evaluate` with empty `checksByTarget`. Code follows the body. GetStatus drafts call `projectArtifacts` directly; Validate calls `evaluate`. Two call shapes, both specified.

### Test Coverage

- Spy `evaluate(..., { checksByTarget: {} })`
- Persisted complete + parent pending-review → blocked, not marked validated
- Historical validation / persist / invalidation suite

### Missing Tests

- **minor:** No explicit assert that `executeChecksByLegalTargets` is not called (implied by empty map + spy on `evaluate` only).

### Spec dependency chain

Adds `core:transition-checks`. Consistent. Architecture: use case still owns I/O (hash, persist); engine I/O-free.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 24      |
| Implemented           | 24      |
| Discrepancies         | 1 nit   |
| Test gaps             | 1 minor |

---

## core:get-artifact-instruction

### Requirements Summary

Ports, optional `artifactId` → engine `nextArtifact`, schema guard, instruction/template/delta, factory `templateExpander`, plus: `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates; auto-select MUST NOT treat persisted complete as resolved under parent-review blockage.

### Implementation Status

**Implemented.**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

### Discrepancies

- **nit:** Ctor `templates` vs spec/factory `templateExpander`.
- **nit:** Constraint “MUST NOT evaluate hop availability” vs calling full `evaluate` (walks `validTransitions` but skips missing injections). Code matches the **requirement** that names empty `checksByTarget`.

### Test Coverage

- Spy empty `checksByTarget`
- Auto-select first incomplete in topo order
- **Does not auto-select persisted-complete child blocked by parent review** (selects `proposal`)
- All complete → `ArtifactNotFoundError`

### Missing Tests

None **major**. Remaining:

- **minor:** No assert `executeChecksByLegalTargets` unused.

### Spec dependency chain

`core:lifecycle-engine`, `core:transition-checks`. Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 9       |
| Implemented           | 9       |
| Discrepancies         | 2 nits  |
| Test gaps             | 1 minor |

---

## core:config

### Requirements Summary

This change rewrites **Approvals** only (merged):

- `approvals.spec: true` → cannot take any **forward** leave of `ready` until `ApproveSpec`; stay in `ready`; includes `ready → implementing` and `ready → verifying` when `implementing` omitted; redesign `ready → designing` MUST NOT require the gate.
- `approvals.signoff: true` → stay in `done` until `ApproveSignoff`.
- New work MUST NOT enter pending via `change transition`.
- Defaults false.

Loader still parses booleans; semantics live in bindings + use cases.

### Implementation Status

**Implemented** vs **merged** Approvals:

- Binding `approval.spec` `{ from: 'ready', to: '*', along: 'forward' }`.
- Matcher tests: `ready → verifying` matches; `ready → designing` does not.
- Loader defaults false.

### Discrepancies

- **major — workspace spec vs change (expected until archive):** On-disk `specs/core/config/spec.md` Approvals still documents `pending-spec-approval` / `pending-signoff` hops (`ready` cannot go directly to `implementing`; must enter pending). Merged preview + code follow in-place checks.
  - **A (spec drift):** Anyone reading archived workspace specs today gets the old product.
  - **B (change is truth):** Correct until `specd change archive` replaces the section.
    This audit scores **implementation against merged spec** → not an implementation defect.

No TransitionChange rewrite to pending.

### Test Coverage

`config-loader.spec.ts` booleans. Semantic tests in `transition-checks.spec.ts` / `transition-change.spec.ts` / `lifecycle-engine.spec.ts`. Merged verify “Spec gate on does not require pending-spec-approval in the graph” is bindings + protocol, not config-loader.

### Missing Tests

- **minor:** Docs/config-layer assertion that comments do not mention pending hops (documentation contract). Binding tests already cover verifying vs designing.

### Spec dependency chain

Adds `core:transition-checks`. Merged Approvals consistent with bindings. **Unmerged workspace spec contradicts** the change.

### Counts

|                            | n                                                        |
| -------------------------- | -------------------------------------------------------- |
| Requirements reviewed      | 1 delta (Approvals)                                      |
| Approvals (merged) vs code | Implemented                                              |
| Discrepancies              | 1 major **base-spec vs change** (docs), 0 implementation |
| Test gaps                  | 1 minor                                                  |

---

## Depth-1 deps / architecture (this batch)

Direct deps used by these use cases (`core:transition-checks`, `core:lifecycle-engine`, `core:workflow-model`, `core:schema-format`, `core:composition-resolver`, `core:count-tasks`, `core:hook-execution-model`) are consistent with: self-sufficient `check.execute`; empty `checksByTarget` for DAG-only consumers; hop consumers inject executed predicates; no snapshot bag.

`default:_global/architecture`: layered ports; domain engine I/O-free; use cases own persistence and typed error mapping. No contradiction found for this batch.

---

## Batch summary

| Spec                     | Reqs    | Impl           | Disc.                     | Missing tests |
| ------------------------ | ------- | -------------- | ------------------------- | ------------- |
| get-status               | 17      | 17             | 1 nit                     | 2 minor       |
| transition-change        | 23      | 23             | 1 nit + untested hop      | 2 minor       |
| archive-change           | 31      | delta OK       | 1 nit                     | 2 minor       |
| approve-spec             | 8       | 8              | 2 nits                    | 1 minor       |
| approve-signoff          | 8       | 8              | 2 nits                    | 1 minor       |
| validate-artifacts       | 24      | 24             | 1 nit                     | 1 minor       |
| get-artifact-instruction | 9       | 9              | 2 nits                    | 1 minor       |
| config (Approvals)       | 1 delta | matches merged | 1 major workspace-doc lag | 1 minor       |

**Focus checks:** all **code-compliant** with merged specs. Previously major **test** gaps in this batch are closed. Highest remaining finding is **unarchived workspace config Approvals** (docs), not missing runtime behaviour.

**Severity rollup (this batch):** critical 0; major 1 (workspace config docs vs merged); minor 11; nit 11.

---

## Partial: \_partial-cli-skills.md

# Spec compliance partial: CLI + skills (workflow-transition-checks)

- **Mode:** change audit
- **Change:** `workflow-transition-checks`
- **Date:** 2026-08-27
- **Auditor:** read-only; no code or spec edits
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** `project status --graph` reported `stale: false` but `fileCount: 0`, `symbolCount: 0`. `graph search` returned spec hits only; `graph impact --file cli:src/commands/change/transition.ts` failed (`no indexed file`). Navigation: spec search, then Read of command sources, tests, `docs/cli/cli-reference.md`, skill templates.

**Locked product (this batch):** check bus stream `change-transition` / `change-archive` (NOT `hook-progress` for transition); Repair Guide on stderr; `--next` from `signed-off` → `archivable`; `HookFailedError` exit 2 with no repair guide; stay-in-`ready`/`done`.

**Do not recycle:** Repair Guide on stdout, transition JSON `hook-progress`, pending-state hop as happy path, `--next` missing `signed-off` — **those are currently implemented and tested.**

---

## cli:change-status

### Requirements Summary

Merged preview (`changes spec-preview workflow-transition-checks cli:change-status`): 16 requirements.

| Requirement                             | Intent                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Command signature                       | `change status <name> [--format text\|json\|toon]`                                                 |
| Drafted change status is read-only      | No mutating transition ads; indicate drafted (`(drafted)` / `isDrafted: true`); artifacts MAY show |
| Output format                           | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display-state (e.g. `complete-with-drift`)      |
| Task completion display in DAG          | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                   |
| Display-state rendering                 | Text prefers display status; JSON includes canonical + display                                     |
| Lifecycle projections from GetStatus    | No local `VALID_TRANSITIONS` re-filter                                                             |
| Text omits duplicated review file lists | No `review:` file dump; overlap peers still print                                                  |
| Text blockers include check labels      | `! CODE — label: message`                                                                          |
| Schema version warning                  | stderr `warning:`; skip if `schemaInfo` null; no independent schema resolve for the warning        |
| Change not found                        | exit 1, `error:`                                                                                   |
| Schema-derived fields                   | `schema.artifactDag` from `artifactDag()`; text DAG display status; convergent nodes once          |
| Delegates refresh to GetStatus          | No direct refresh/detector                                                                         |
| Implementation section                  | `--implementation` via SDK projection                                                              |
| Task completion in details              | `tasks: N/M`                                                                                       |
| Basic info                              | name + state; no standalone `specs:` line                                                          |
| Specs and dependencies                  | text list + JSON `specDependsOn`                                                                   |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts`.

- Drafted: text `state: … (drafted)`, `transitions: (none — change is drafted)`; JSON `isDrafted: true`.
- Display-state, DAG `hasTasks`, blocker labels, overlap-only review peers, `getActiveSchema` only for DAG (warning uses `lifecycle.schemaInfo`).
- `--implementation` → `buildImplementationReview` (`_implementation-tracking.ts`), not ad-hoc graph matching.
- GetStatus invoked without CLI-side refresh/detector.

**Partial / docs-only:** Commander `--help` JSON schema omits `isDrafted`, `hasTasks`, blocker `label`/`checkId`. `docs/cli/cli-reference.md` **change status** does not document drafted/`isDrafted` (drafting is documented under drafts commands only).

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                  | B (code/docs)                                                                                                                             | Assessment                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ST-1 | Drafted JSON example includes `isDrafted: true`; text indicates drafted                   | Code matches. `cli-reference.md` status section does not mention drafted/`isDrafted`. Status `addHelpText` JSON schema omits `isDrafted`. | **Docs/help drift.** Code is correct. Spec vs `default:_global/docs` (output contract in `docs/cli/` same change). |
| ST-2 | Text DAG `[hasTasks]` when `hasTasks: true` **or** `taskCompletionCheck` (JSON uses both) | Text `renderDag` gates the tag on `artifact.hasTasks` only; JSON uses `hasTasks \|\| taskCompletionCheck`.                                | **Minor code/spec split** if a schema sets only `taskCompletionCheck`. Schema-std typically sets both.             |
| ST-3 | MUST NOT print **actionable lifecycle transitions** for drafted                           | Transitions line is suppressed. `next action` still renders from GetStatus (tests use `command: null`).                                   | **Compliant if** GetStatus never returns a mutating command for drafts. CLI does not extra-filter `nextAction`.    |

No current major: status does not re-add `verifying` locally; review files are not duplicated under a `review:` header.

### Test Coverage

- `packages/cli/test/commands/change-status.spec.ts`: JSON `isDrafted`, text `(drafted)` and no `change transition`.
- `packages/cli/test/commands/change/change-status.spec.ts`: specDependsOn, `complete-with-drift`, overlap without `review:` header, `DEPS_INCONSISTENT` gerund labels, JSON `blockers[].label`.

### Missing Tests

- Help/docs: `--help` JSON schema includes `isDrafted` / `hasTasks`.
- Text DAG tag when `taskCompletionCheck` is set and `hasTasks` is false.
- Drafted `nextAction.command` non-null must still not advertise `change transition` (guard if core ever returns a command).

### Spec Dependency Chain

- `cli:entrypoint` (exit codes, format)
- `core:get-status` / lifecycle check projections (not in this batch)
- `sdk:build-implementation-review` for `--implementation`
- `default:_global/docs` for CLI reference alignment

### Counts

| Metric                   | Count                             |
| ------------------------ | --------------------------------- |
| Requirements             | 16                                |
| Fully implemented        | 15                                |
| Partial (help/docs)      | 1 (drafted contract in help/docs) |
| Code majors              | 0                                 |
| Docs/help minors         | 2 (ST-1, ST-2)                    |
| Test files covering spec | 2                                 |
| Missing tests (material) | 2                                 |

---

## cli:change-transition

### Requirements Summary

Merged preview: command signature (`<step>` xor `--next`, `--skip-hooks`, format); `--next` map including `signed-off` → `archivable` and refuse pending/archivable; refresh false on pre-status and repair GetStatus; no CLI approval rewrite (stay `ready`/`done`); hooks via `skipHookPhases`; **progress stream `change-transition`**, not `hook-progress`; success/failure terminal `complete` on that stream; Repair Guide **stderr**; `HookFailedError` exit **2**, no repair guide; check bus gerund labels, no `Executing:`; incomplete tasks / requires → exit 1.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts` + `createCheckProgressPresenter({ streamName: 'change-transition' })`.

- `--next` map includes `signed-off` → `archivable`.
- Repair guide: `writeTextRepairGuide` → **stderr**; JSON failure is `stream: "change-transition"` `complete`/`failure`.
- `isRepairGuideError` does **not** include `HookFailedError`; that falls through to `handleError` → exit 2, `error: hook '…' failed`.
- Text check progress on **stderr**; JSON records on **stdout**.
- Commander description: in-place gates (`ready`/`done`; pending drain only).
- Help: `{ stream: "change-transition", … }` — matches locked product.
- `docs/cli/cli-reference.md` **change transition**: Repair Guide on **stderr**; JSON `change-transition`; not `hook-progress`; `signed-off -> archivable`; stay in `ready`/`done`. **Aligned with code.**

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                | B (code/docs)                                                                                                                                                                                     | Assessment                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| TR-1 | Transition JSON stream is `change-transition`                                           | Code, tests, Commander help, `cli-reference.md` match. `docs/guide/workflow.md` Hooks section still says JSON in-flight hook progress is on **stderr** with final result on stdout.               | **Not a CLI bug.** Stale **guide** vs current CLI contract (`default:_global/docs`: any doc with the old shape is in scope). |
| TR-2 | `run-hooks` MAY keep `hook-progress`; MUST NOT share public JSON stream with transition | `run-hooks.ts` still emits `hook-progress`. `cli-reference.md` run-hooks says it “shares the same live hook-progress presentation as change transition” then documents `stream: "hook-progress"`. | **Wording collision** (stream name vs “presentation”). JSON names are distinct. Minor docs.                                  |

No current major: Repair Guide is not on stdout; transition does not emit `hook-progress`.

### Test Coverage

- `packages/cli/test/commands/change-transition.spec.ts`: `--next` including `signed-off` → `archivable`; no pending rewrite; HookFailedError exit 2 and **no** `repair guide:` on stderr/stdout; JSON NDJSON `change-transition` through `complete`; Repair Guide on stderr not stdout; refresh `false`.
- `packages/cli/test/commands/change/change-transition.spec.ts`: repair guide for typed errors; no silent implementing → pending.
- `packages/cli/test/commands/change.spec.ts`: JSON terminal `change-transition` `complete`.
- `packages/cli/test/handle-error.spec.ts`: HookFailedError → exit 2.

### Missing Tests

- Commander `.description()` / `--help` asserts in-place-gate copy (behavior is already in description).
- Explicit assert JSON lines never have `stream: "hook-progress"` (implied by equality to `change-transition`).

### Spec Dependency Chain

- `cli:entrypoint`
- `core:transition-change`, `core:transition-checks`, `core:get-status`
- `core:hook-execution-model`
- `default:_global/docs`

### Counts

| Metric                                         | Count                                  |
| ---------------------------------------------- | -------------------------------------- |
| Requirements (spec.md)                         | 14 named + constraints                 |
| Fully implemented (CLI)                        | all locked-product items               |
| Code majors                                    | 0                                      |
| Docs minors (outside cli-reference transition) | 2 (TR-1 guide, TR-2 run-hooks wording) |
| Tests covering locked product                  | strong                                 |
| Missing tests                                  | 1 (help text)                          |

---

## cli:change-approve

### Requirements Summary

Subcommands `spec` / `signoff`; `--reason` required; pass only `{ name, reason }` via `kernel.changes.approveSpec|approveSignoff`; hashes not computed in CLI; from `ready` stay in `ready` (no print of hop to `pending-spec-approval`); from `done` stay in `done`; help uses bound-`from` language; text `approved <gate> for <name>`; JSON `{ result, gate, name }`; errors exit 1.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- Descriptions: `ready` / drain `pending-spec-approval`; `done` / drain `pending-signoff`.
- `docs/cli/cli-reference.md` approve spec/signoff: leave in `ready`/`done`; drain pending. **Aligned.**

### Discrepancies (A vs B)

None material. CLI never prints a transition to pending; success copy is `approved spec|signoff for <name>`. Stay-in-state is owned by core; CLI tests assert execute payload and stdout.

### Test Coverage

- `packages/cli/test/commands/change-approve.spec.ts` and `packages/cli/test/commands/change/change-approve.spec.ts`: ready/done consent, no pending in stdout, drain still invoked, `{ name, reason }` only.

### Missing Tests

- `--help` bound-from strings (`ready` / `done`) as required by spec “Help text MUST…”.
- JSON success shape is covered in root approve spec file (verify.md scenario).

### Spec Dependency Chain

- `cli:entrypoint`
- `core:change`, `core:transition-checks` (approval.spec / approval.signoff)

### Counts

| Metric            | Count                       |
| ----------------- | --------------------------- |
| Requirements      | 7                           |
| Fully implemented | 7                           |
| Code majors       | 0                           |
| Missing tests     | 1 (Commander help language) |

---

## cli:change-archive

### Requirements Summary

`changes archive` canonical + `change archive` alias; `--skip-hooks` `pre|post|all`; `--allow-overlap`; must be `archivable`; delegate `ArchiveChange`; check bus gerunds, hooks on same bus; post-hook failures exit 2; text archive path + optional invalidated section; **JSON/TOON terminal `stream: "change-archive"` `complete` with `result/name/archivePath/invalidatedChanges`**; progress on same stream; **no second unwrapped JSON object**.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Presenter `streamName: 'change-archive'`; text progress stderr; JSON complete record on stdout.
- Commander help documents `change-archive` stream and terminal `complete` — **matches spec and code**.
- Post-hook failures: `cliError(..., 2)` before success print.

### Discrepancies (A vs B)

| ID   | A (spec)                                                                                                              | B (code/docs)                                                                                                                                                                               | Assessment                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AR-1 | JSON success is a structured stream `change-archive` + `complete`; callers MUST NOT require a second unwrapped object | Code emits only the stream record. Tests `JSON.parse(stdout())` for success **without** progress events (single JSON value).                                                                | **Code compliant** for the no-progress path.                                           |
| AR-2 | Same as AR-1, plus `default:_global/docs`: CLI docs MUST describe machine output                                      | `docs/cli/cli-reference.md` **change archive** has flags and archivable/overlap/`--allow-out-of-scope` but **does not** mention `stream: "change-archive"`, NDJSON, or terminal `complete`. | **Current docs gap** (not an old recycled major). Help text is ahead of cli-reference. |
| AR-3 | Spec.md “Output on success” body is truncated/malformed in the merged preview                                         | Implementation still has a coherent text/JSON split.                                                                                                                                        | **Spec quality** in the change delta, not a CLI bug.                                   |

`--allow-out-of-scope` is extra vs the spec signature table; docs list it. Not a locked-product regression.

### Test Coverage

- `packages/cli/test/commands/change-archive.spec.ts`: text path; exit 2 post-hooks without success line; JSON `stream === 'change-archive'` + `complete` + `invalidatedChanges`; text invalidated section; skip-hooks forwarding; text check bus (gerund, `Running pre hooks`, no `Executing:`).

### Missing Tests

- JSON **with** in-flight `check-*` events: NDJSON lines all `stream: "change-archive"`, last event `complete`, `JSON.parse` of **full** stdout must fail (proves no extra unwrapped object / that consumers must read NDJSON). Current success tests would break if progress were emitted on stdout in the same test.

### Spec Dependency Chain

- `cli:entrypoint`, `cli:command-resource-naming`
- `core:archive-change`, `core:change`, `core:hook-execution-model`, `core:transition-checks`

### Counts

| Metric                         | Count                             |
| ------------------------------ | --------------------------------- |
| Requirements                   | 10 named                          |
| Code vs spec                   | implemented                       |
| Docs vs spec (`cli-reference`) | **gap (AR-2)**                    |
| Code majors                    | 0                                 |
| Missing tests                  | 1 (JSON progress+complete NDJSON) |

---

## skills:skill-templates-source

### Requirements Summary

Large template-source spec (locations, metadata, Handlebars, graph impact/search wording, frontmatter, implementation tracking, metadata self-heal, optimizer gating, command roles, **in-place approval gates**).

This batch’s locked focus: stay-in-`done` / stay-in-`ready`; pending parking **drain-only** for new work; no `change transition` into pending as happy path.

### Implementation Status

**In-place gates: implemented** in templates:

- `specd-verify/SKILL.md.tpl`: signoff on → stay in `done`; `approve signoff`; do not transition into `pending-signoff`.
- `specd-implement/SKILL.md.tpl`: spec gate → stay in `ready`; do not `transition implementing`.
- `shared.md.tpl`: never run `changes approve`; **stays** in `ready` or `done`; pending drain-only; hook “states you pass through” lists delivery states only, not pending as happy-path intermediates.
- `specd-new/SKILL.md.tpl` `targetStep` table: pending rows **Drain only**; `ready`/`done` gate copy.
- `specd-design/SKILL.md.tpl`: stay in `ready`; no happy-path pending wait.
- `specd/SKILL.md.tpl` and `specd-archive/SKILL.md.tpl`: in-place gates on `ready`/`done`; no transition into pending.

`packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` asserts the above.

Other template requirements (snippet opt-in, optimizer `llmOptimizedContext`, metadata self-heal) still have dedicated tests in the same file; `--changes` impact selector not present in templates (grep).

### Discrepancies (A vs B)

None found for in-place-gate / no-pending-parking requirements.

### Test Coverage

`template-workflow.spec.ts`: verify stay in `done`; implement stay in `ready` and do not unconditional `transition implementing`; shared no `reaches pending-spec-approval`; new Drain only; design Stay in `ready`; entry/archive in-place.

### Missing Tests

- Exact Commander-unrelated: none for locked product.
- Keyword tests do not freeze full `targetStep` table rows (acceptable; table was inspected).

### Spec Dependency Chain

- Workflow skills consume `cli:change-*` contracts; `cli:spec-optimizations` for optimizer persistence; graph CLI specs for impact/search wording.

### Counts

| Metric                              | Count |
| ----------------------------------- | ----- |
| In-place-gate scenarios (verify.md) | 7     |
| Implemented                         | 7     |
| Code/template majors                | 0     |
| Missing tests (locked product)      | 0     |

---

## default:\_global/docs (CLI output contract)

### Requirements Summary (relevant)

- Every command documented under `docs/cli/`.
- Command-specific machine output MUST be described so readers need not read implementation.
- Output-contract changes MUST update `docs/cli/` **in the same change**.
- Other `docs/` files documenting the **same stale shape** are in scope.

### Implementation Status vs this change

| Surface                                                | Repair Guide stderr | Transition stream `change-transition` | Archive stream `change-archive` | Stay ready/done        |
| ------------------------------------------------------ | ------------------- | ------------------------------------- | ------------------------------- | ---------------------- |
| `docs/cli/cli-reference.md` transition                 | yes                 | yes                                   | n/a                             | yes                    |
| `docs/cli/cli-reference.md` archive                    | n/a                 | n/a                                   | **missing**                     | n/a                    |
| `docs/cli/cli-reference.md` approve                    | n/a                 | n/a                                   | n/a                             | yes                    |
| `docs/cli/cli-reference.md` status drafted/`isDrafted` | n/a                 | n/a                                   | n/a                             | **missing**            |
| `docs/guide/workflow.md` Hooks JSON                    | n/a                 | **stale** (stderr structured events)  | possibly stale                  | n/a                    |
| Commander help transition/archive                      | n/a                 | yes                                   | yes                             | transition/approve yes |

### Discrepancies (A vs B)

| ID    | Severity         | Finding                                                                                                                                                                                                    |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1 | **Major (docs)** | `cli:change-archive` JSON stream contract is implemented and in `--help`, but **not** in `docs/cli/cli-reference.md` archive section. Violates global docs “output contract in cli-reference same change”. |
| DOC-2 | Minor            | Status drafted/`isDrafted` not in cli-reference status section.                                                                                                                                            |
| DOC-3 | Minor            | `docs/guide/workflow.md` still describes JSON hook progress on **stderr**; transition/archive JSON progress is **stdout** NDJSON on `change-transition` / `change-archive`.                                |
| DOC-4 | Nit              | run-hooks “same live hook-progress presentation as change transition” vs distinct JSON stream names (already documented in the next bullets).                                                              |

### Test Coverage

No automated docs contract tests in this batch.

### Missing Tests

Docs alignment is review-gated (`default:_global/docs` verify.md). No CLI unit test for cli-reference contents.

### Spec Dependency Chain

- `default:_global/conventions`
- CLI command specs as the contracts docs must track

### Counts

| Metric                | Count                  |
| --------------------- | ---------------------- |
| Docs majors (current) | 1 (DOC-1 archive JSON) |
| Docs minors           | 3                      |
| Recycled old majors   | 0                      |

---

## Cross-cutting: Commander description vs in-place gates

| Command           | Description / help                                                             | Verdict                                       |
| ----------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `transition`      | “Approval gates stay in ready/done; pending states drain in-flight work only.” | **Matches** spec                              |
| `approve spec`    | bound `ready` + drain pending-spec-approval                                    | **Matches**                                   |
| `approve signoff` | bound `done` + drain pending-signoff                                           | **Matches**                                   |
| `archive`         | “Move a completed change…” (does not say `archivable`)                         | Soft; prerequisites still exit 1 via use case |
| `status`          | no drafted mention in description                                              | Soft; drafted handled in action               |

No test asserts these description strings.

---

## Summary counts (this partial)

| Spec                            | Reqs audited                    | Code majors | Docs majors                       | Missing tests (material) |
| ------------------------------- | ------------------------------- | ----------- | --------------------------------- | ------------------------ |
| `cli:change-status`             | 16                              | 0           | 0 (help/docs minor)               | 2                        |
| `cli:change-transition`         | locked set + full spec.md       | 0           | 0 (`cli-reference` OK)            | 1                        |
| `cli:change-approve`            | 7                               | 0           | 0                                 | 1                        |
| `cli:change-archive`            | 10                              | 0           | **1** (cli-reference JSON stream) | 1                        |
| `skills:skill-templates-source` | in-place gates + sample of rest | 0           | 0                                 | 0                        |
| `default:_global/docs`          | CLI output alignment            | n/a         | **1** (same as archive)           | n/a                      |

**Honest bottom line:** Locked CLI/skill **behavior** matches the merged specs (check bus names, Repair Guide stderr, `--next` signed-off → archivable, HookFailedError exit 2 without repair guide, stay-in-ready/done, skill drain-only pending). The live gap is **documentation of archive JSON `change-archive` in `docs/cli/cli-reference.md`**, plus stale guide wording and incomplete status drafted docs/help — not a regression of the old stdout-repair-guide / `hook-progress`-on-transition majors.

---

## Re-audit after docs/test fixes

# Re-audit: docs / tests (read-only) — 20260827-025508

Question: are previous findings still true after docs/test fixes? No code modified.

CLI used: `node packages/cli/dist/index.js`

---

## 1. MAJOR DOC-1 — archive section omitted `stream: change-archive` / NDJSON complete

**CLOSED**

`docs/cli/cli-reference.md` ### change archive now documents the check-progress bus and NDJSON terminal event.

Evidence:

> When archive checks and hooks run, `change archive` uses the generic check-progress bus (`stream: "change-archive"`), not the `run-hooks` `hook-progress` stream and not `change-transition`:

> In `json` and `toon`, all machine-readable output is emitted on `stdout` as a newline-delimited stream of structured records with `stream: "change-archive"` (`check-start` / `check-progress` / `check-done`, then a terminal `complete` event whose `result` includes `result: "ok"`, `name`, `archivePath`, and `invalidatedChanges`).

Grep `docs/cli/cli-reference.md` for `change-archive`: hits at the archive section and the run-hooks contrast (`change archive` (`change-archive`)).

Tests (`packages/cli/test/commands/change-archive.spec.ts`): NDJSON/`check-start` present.

- `expect(parsed.stream).toBe('change-archive')`
- `it('JSON output streams check-progress then complete on change-archive'…)` with `onProgress?.({ type: 'check-start', …})` and `expect(lines.map((row) => row.event.type)).toEqual(['check-start', 'check-done', 'complete'])`

---

## 2. MINOR — `drafted` / `isDrafted` missing from cli-reference and Commander help

**PARTIAL — docs CLOSED; running Commander help still OPEN (MINOR)**

cli-reference **matches**. `### change status` documents drafted text and `isDrafted`.

Evidence:

> Drafted changes are read-only. Text mode marks the state as `(drafted)` and prints `transitions: (none — change is drafted)`. JSON/TOON include `isDrafted: true`, empty `availableTransitions`, and `nextAction.command: null`.

Grep `docs/cli/cli-reference.md` for `isDrafted`: one hit (line above).

Commander help from **dist** (`node packages/cli/dist/index.js changes status --help`) still omits `isDrafted` / drafted. The printed JSON schema starts:

> `{ name: string; state: string; specIds: string[] … }`

No `isDrafted` field. Grep of `packages/cli/dist` for `isDrafted`: no matches.

Source already has the field (`packages/cli/src/commands/change/status.ts` help text: `isDrafted?: boolean`). Dist is stale relative to source. Finding remains true for the CLI the audit was told to run.

---

## 3. MINOR — `docs/guide/workflow.md` Hooks JSON on stderr

**CLOSED**

Current Hooks section: JSON/TOON progress is **stdout** NDJSON; **stderr** is text-mode / diagnostics only.

Evidence:

> In `json` and `toon`, in-flight check/hook progress is emitted on **stdout** as NDJSON (`stream: "change-transition"` for `change transition`, `stream: "change-archive"` for `change archive`, `stream: "hook-progress"` for `change run-hooks`).

> `stderr` is reserved for text-mode progress, the transition Repair Guide, and non-structured diagnostics.

---

## 4. MINOR — run-hooks “shares the same live hook-progress presentation” / colliding stream names

**CLOSED**

`### change run-hooks` now states distinct public JSON streams.

Evidence:

> `change run-hooks` keeps a **distinct** public JSON stream (`hook-progress` / terminal `run-hooks`). It does not share a stream name with `change transition` (`change-transition`) or `change archive` (`change-archive`).

> Hook progress uses `stream: "hook-progress"`, and the final result is emitted as a terminal `stream: "run-hooks"` record with `event.type: "complete"`.

---

## 5. MAJOR — workspace `specs/core/config` Approvals pending hops vs merged change

**STILL OPEN** — MAJOR (expected until archive; preview is the source of truth for this change)

Command: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks core:config --format text`

Merged preview **in-place gates** (no pending hops for new work):

> **`spec`** — when `true`, a change in `ready` cannot take any **forward** leave of `ready` (`approval.spec` is `from=ready`, `to=*`, `along=forward`) until `ApproveSpec` records consent. The change stays in `ready`. … New work MUST NOT enter `pending-spec-approval` via `change transition`.

> **`signoff`** — … The change stays in `done`. … New work MUST NOT enter `pending-signoff` via `change transition`.

Preview also links: `approvals.spec` / `approvals.signoff` are in-place checks, not pending hops.

Workspace file `specs/core/config/spec.md` **still pending hops**:

> **`spec`** — when `true`, a change in `ready` state cannot transition directly to `implementing`. It must first enter `pending-spec-approval` and receive an explicit approval … before transitioning to `spec-approved` and then to `implementing`.

> **`signoff`** — … It must enter `pending-signoff`, receive explicit sign-off, and transition through `signed-off → archivable`.

Confirm: merged preview matches in-place gates; workspace file lags until archive.

---

**Re-audit majors remaining: 1**

1. Workspace `specs/core/config` Approvals still describe pending hops; merged `spec-preview` for `workflow-transition-checks` / `core:config` describes in-place gates (lags until archive).

## Verdict

- **Implementation + merged specs + CLI docs (this change):** 0 critical, 0 actionable majors.
- **DOC-1 archive JSON stream:** closed.
- **Remaining labeled major:** unarchived workspace `specs/core/config` Approvals still describe pending hops. That file must not be edited ad hoc; the change delta is already correct and lands on archive. This finding cannot close without `/specd-archive`.
