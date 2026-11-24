# Partial audit: core checks / lifecycle (change `workflow-transition-checks`)

Mode: change audit (read-only). Specs via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`. Globals via `specs show default:_global/{architecture,conventions,testing}`.

Graph: `graph stats` `stale: false`, `state: current`, `lastIndexedAt: 2026-08-27T08:44:02.754Z`, `COVERS_SYMBOL: 0` (see LOW note). Navigation: `graph search` (`classifyAlong`, `LifecycleEngine`, `buildAxis`, `VALID_TRANSITIONS`, `_requestedTargetBlockers`, `effectiveStatus`, `PredicateSnapshots`).

Locked product (not re-litigated): self-sufficient `Check.execute` → `CheckResult`; `AXIS_FALLBACK` spliced by canonical index (not tail-append); `workflow[]` is extras lookup not protocol; `availableSteps` = extras-bearing `schema.workflow()` rows; no hop to `pending-*`; stay-in-`ready`/`done` for approvals; `archive.publication` is not a `CheckId`; GetStatus drafts use `projectArtifacts` not `evaluate`; public blockers = failed-predicate codes; `skipHookPhases` by binding phase + selectors.

**Closed vs prior audit (do not recycle):** `_requestedTargetBlockers` dual-write is **Implemented**; `applyBindingSpecs` throws `InvalidInputError`; `executeHookEffect` / `shouldExecuteHookEffect` **removed**; GetStatus copies `availableSteps`; unknown `workflow[].step` rejected in `buildSchema`; omit-`implementing` `verifying → implementing` is `backward`; Archive overlap skip no longer `check.id === 'spec.overlap'`; parking-hop JSDoc on `LifecycleEngineOptions.approvals` **updated**.

Batch specs: `core:transition-checks`, `core:lifecycle-engine`, `core:workflow-model`, `core:change`, `core:schema-format`. Globals: `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`.

---

## Spec: `core:transition-checks`

### Requirements Summary

Shared evaluation of one transition attempt (and archive as an operation): stable `CheckId` + gerund `label`, `kind` predicate|effect, self-sufficient `execute(ctx)` returning `CheckResult`. Bindings carry `from`/`to`/`along` (or `archive`) plus effect `phase`/`onFailure`. Progress axis from known `workflow[]` names with missing `AXIS_FALLBACK` delivery states spliced by canonical index. Classify `along` (`forward`/`backward`/`redesign`/`recovery`/`any`). Protocol fail-fast; no pending rewrite; projections from predicates; no snapshot bag; `archive.publication` not a check; skip hooks via binding phase **plus** selectors because transition pre/post share `before-persist`. One binding-spec table composed with application `create*`. Actionable fail diagnostics; generic `check-start` / `check-progress` / `check-done` bus.

### Implementation Status

| Area                                    | Status      | Evidence                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check ABI / `WorkflowCheck`             | Implemented | `packages/core/src/application/checks/workflow-check.ts` (`Check` + `pass`/`fail`/`skip`); `Check.execute` `transition-checks.ts` 379–399                                                                                                                                                    |
| Self-sufficient `execute`               | Implemented | `CheckExecutionContext` host fields only (`transition-checks.ts` 337–356); I/O on `create*` constructors / `createWorkflowCheckRegistry`                                                                                                                                                     |
| Canonical labels                        | Implemented | `CHECK_LABELS` `transition-checks.ts` 42–57; matches spec table                                                                                                                                                                                                                              |
| `buildAxis` splice                      | Implemented | `transition-checks.ts` 139–156: omitted fallback inserted at first listed axis member with `listedIndex >= fallbackIndex`                                                                                                                                                                    |
| `classifyAlong` omit-implementing retry | Implemented | `transition-checks.ts` 167–203; tests `transition-checks.spec.ts` 63–73 (`ready→verifying` forward; `verifying→implementing` **backward**)                                                                                                                                                   |
| Unknown strings not axis slots          | Implemented | `buildAxis` filters `step in VALID_TRANSITIONS` (`transition-checks.ts` 140); `classifyAlong` test `reviewing` still forward (80–83)                                                                                                                                                         |
| Bindings table (single specs)           | Implemented | `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts` 28–94; `applyBindingSpecs` 442–459; registry `workflow-check-registry.ts` 67–109 attaches `create*` onto **same** specs                                                                                          |
| `applyBindingSpecs` typed error         | Implemented | throws `InvalidInputError` (`transition-checks.ts` 447–449); test `transition-checks.spec.ts` 394–400                                                                                                                                                                                        |
| Production path                         | Implemented | `createWorkflowCheckRegistry` — not domain `TRANSITION_BINDINGS` (those are documented matcher fixtures, 96–129)                                                                                                                                                                             |
| Registry rows vs spec                   | Implemented | impl `from=implementing` `along=forward`; `approval.spec` `from=ready` `along=forward`; `approval.signoff` exact `done→archivable`; archive list has no `archive.publication` or `approval.signoff`; hooks: transition both `before-persist`/`abort`, archive post `after-persist`/`collect` |
| No snapshot bag                         | Implemented | graph search finds no `PredicateSnapshots` / `gatherPredicateSnapshots`; test `transition-checks.spec.ts` 382–388                                                                                                                                                                            |
| Skip selectors in effect `execute`      | Implemented | `hook-effect.ts` 133–149: `all` / `target.pre` / `source.post` / archive `pre`/`post`; not `binding.phase` alone; not use-case `check.id`                                                                                                                                                    |
| Protocol fail-fast                      | Implemented | `TransitionChange` `executeMatchingPredicates(..., { failFast: true })` (`transition-change.ts` 189–202); `protocol.edge` first in `TRANSITION_BINDING_SPECS`                                                                                                                                |
| Progress bus                            | Implemented | `executeCheckWithProgress` (`execute-matching-predicates.ts` 73–90)                                                                                                                                                                                                                          |
| Projections                             | Implemented | engine `availableTransitions` = injected predicates with no `fail`; `nextAction` uses `boundFromStates` for approve commands (`lifecycle-engine.ts` 799–822)                                                                                                                                 |
| One file per check                      | Implemented | 14 domain `checks/*.ts` (one id each); application `create*` per id except shared `HookEffectCheck` in `hook-effect.ts` (allowed “as needed”; `kind` declared on class, not inferred from id)                                                                                                |

### Discrepancies

None that change product behaviour.

Domain `TRANSITION_BINDINGS` / `ARCHIVE_BINDINGS` are materialized from the **same** `*_BINDING_SPECS` with I/O-free stubs. Spec explicitly allows domain `run` + stub `Check` and forbids them as the production `execute` path. Production wires `createWorkflowCheckRegistry`. Not counted as fail.

Archive failed-predicate mapping via `throwMappedArchiveFailure(check, …)` is the **allowed** id→typed-error path. Current `ArchiveChange` overlap invalidation is `allowOverlap && relevantOverlap.length` (`archive-change.ts` 399–408), not `check.id === 'spec.overlap' && skip`.

### Test Coverage

- `packages/core/test/domain/services/transition-checks.spec.ts`: redesign, recovery, omit-implementing forward/backward, omit-ready still forward, unknown `reviewing` does not invert, impl vs redesign, `approval.spec` vs `ready→designing`, `InvalidInputError`, no `archive.publication`, no snapshot exports, compact overlap message.
- `packages/core/test/application/use-cases/transition-change.spec.ts`: skip `all` still fails tasks; `target.pre` vs `source.post` independently; source.post before target.pre (registry order).
- `packages/core/test/application/checks/workflow-check-factories.spec.ts`: factory ABI / `RunStepHooks` constructor deps.
- `packages/core/test/application/services/execute-check-with-progress.spec.ts`: progress bus envelope.

### Missing Tests

- Direct `buildAxis` insertion against a list that would fail under tail-append (e.g. listed `verifying` before omitted `implementing`) — covered only via `classifyAlong` outcomes (**gap**, not a fail).
- No test that composition rejects domain `TRANSITION_BINDINGS` at runtime (TypeScript + kernel already require registry bindings).

### Spec Dependency Chain

- `core:change` — `VALID_TRANSITIONS`, stay in `ready`/`done`. **Consistent** (`change-state.ts` 30–42: `ready` → implementing/designing only; `done` has no `pending-signoff`).
- `core:workflow-model` — lookup `workflow[]`, axis splice, unknown step at `buildSchema`. **Consistent.**
- `core:schema-format` — YAML workflow shape; unknown step `SchemaValidationError`. **Consistent** for workflow lookup. Separate leftover `Change.effectiveStatus()` language lives on schema-format artifact requires (see `core:schema-format` below); it does not contradict this spec’s check ABI.
- `default:_global/architecture` — domain purity; typed `SpecdError`. **Consistent** for `InvalidInputError` (`invalid-input-error.ts` extends `SpecdError`). Domain stubs are I/O-free; application checks own ports.

### Counts

| Metric               | Count |
| -------------------- | ----- |
| pass (requirements)  | 13    |
| fail (discrepancies) | 0     |
| gaps (missing tests) | 2     |
| critical             | 0     |
| major                | 0     |
| minor                | 0     |
| LOW                  | 0     |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary

Sole authority for lifecycle interpretation: project from caller-supplied predicate `CheckResult`s (no I/O, no snapshot bag, no `check.run` fallback). `validTransitions` = protocol; `availableTransitions` = injected predicates with no `fail`; `availableSteps` = extras-bearing `schema.workflow()` rows. `_resolveTarget` identity (no pending rewrite). `isReady` from `workflow.requires` when those results are present — MUST NOT re-walk `requires` to emit a **different** blocker code (`INCOMPLETE_ARTIFACT` vs `MISSING_ARTIFACT`) for the same artifact. Public `blockers` from failed predicates (+ review). Next-action matrix (approve CLI, not pending hops); archiving recovery; `CompileContext` not an evaluate consumer; `nextArtifact` from DAG topological order.

### Implementation Status

| Area                                | Status      | Evidence                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predicate-only `evaluate`           | Implemented | `lifecycle-engine.ts` 129–154; uses `options.checksByTarget`                                                                                                                                                                                                                                             |
| `validTransitions`                  | Implemented | `VALID_TRANSITIONS[change.state]` (132)                                                                                                                                                                                                                                                                  |
| `availableTransitions`              | Implemented | Only targets with **injected** checks and no `fail` (145–154)                                                                                                                                                                                                                                            |
| `availableSteps` extras-only        | Implemented | `schema.workflow().map(...)` (157–194). Test 837–851: omit `implementing` → not in `availableSteps`, still in `validTransitions`                                                                                                                                                                         |
| `_resolveTarget`                    | Implemented | Identity (310–311)                                                                                                                                                                                                                                                                                       |
| Dual-write INCOMPLETE vs MISSING    | Implemented | `_requestedTargetBlockers` 595–607: if any `workflow.requires` result is present, skip `_artifactBlockers` walk. Test helper `domainChecksByTarget` injects `runWorkflowRequires` (which fails missing as `INCOMPLETE_ARTIFACT`). Test 854–866: `INCOMPLETE_ARTIFACT` present, `MISSING_ARTIFACT` absent |
| `isReady` from requires check       | Implemented | 167–173: `requiresFailed` from `workflow.requires` fail when `evaluationChecks` defined                                                                                                                                                                                                                  |
| `isPermitted` from `protocol.edge`  | Implemented | 174–179 when checks injected                                                                                                                                                                                                                                                                             |
| Public blockers = failed predicates | Implemented | `_blockersFromFailedChecks` 762–778; `impl.linksInScope` only for `--allow-out-of-scope`                                                                                                                                                                                                                 |
| nextAction matrix                   | Implemented | 782+; approve via `boundFromStates`; implementing/verifying skills; drain `pending-spec-approval` copy remains for in-flight states (851–857)                                                                                                                                                            |
| `nextArtifact` topo                 | Implemented | `_nextArtifact` 742–759 uses `schema.artifactDag().topologicalOrder()`                                                                                                                                                                                                                                   |
| `projectArtifacts` pure helper      | Implemented | 288–300; no I/O                                                                                                                                                                                                                                                                                          |
| Archiving recovery                  | Implemented | `transitionBlockers` skip requires for `archiving→archivable` (199–201); `_requestedTargetBlockers` 587–588                                                                                                                                                                                              |

### Discrepancies

None for this change’s locked product.

`_isStepPermitted` still keys `pending-spec-approval` / `pending-signoff` when `checksByTarget[step]` is missing (`lifecycle-engine.ts` 314–325). Drain-state protocol for empty-check consumers (`ValidateArtifacts`); `ready` has no pending target in `VALID_TRANSITIONS`. Not a parking hop for new work. Not counted as fail.

`LifecycleEngine` as a class vs architecture “stateless domain = functions”: see Architecture section (**LOW**, pre-existing).

### Test Coverage

- Dual-write: `lifecycle-engine.spec.ts` 854–866 (via injected requires results).
- extras vs protocol: 837–851.
- Incomplete tasks hide `verifying` from `availableTransitions` (819–835).
- Helper `domainChecksByTarget` mirrors matcher + protocol + requires (+ approvals when bound).

### Missing Tests

- `_requestedTargetBlockers` when `workflow.requires` is **absent** (empty injection) still emits `MISSING_ARTIFACT` — documents the allowed DAG fallback, not dual-write (**gap**).
- GetStatus-level assertion that omitting an `implementing` extras row still lists `implementing` in `lifecycle.validTransitions` (engine covered; DTO copy is a GetStatus concern).

### Spec Dependency Chain

- `core:change` — persisted facts, no pending enter from ready/done. **Consistent.**
- `core:workflow-model` — extras vs protocol. **Consistent** with `availableSteps` ← `schema.workflow()`.
- `core:schema-format` — DAG / artifacts. **Consistent** (`projectArtifacts`, topo `nextArtifact`). Artifact-requires prose still names `Change.effectiveStatus()` (schema-format leftover; engine is the real site).
- `core:transition-checks` — projections / blocker codes. **Consistent** with `hasRequiresResult` guard.
- `default:_global/architecture` — engine performs no I/O. Class-vs-function **LOW**.

### Counts

| Metric               | Count                               |
| -------------------- | ----------------------------------- |
| pass (requirements)  | 9                                   |
| fail (discrepancies) | 0                                   |
| gaps (missing tests) | 2                                   |
| critical             | 0                                   |
| major                | 0                                   |
| minor                | 0                                   |
| LOW                  | 1 (class vs function; architecture) |

---

## Spec: `core:workflow-model`

### Requirements Summary

`workflow[]` `step` is a lookup onto existing `ChangeState`. Omitting a row does not delete protocol membership (`workflowStep` null). Unknown step names: `buildSchema` throws `SchemaValidationError`; they never occupy the axis or reach hop evaluation. Requires / task-completion evaluated as shared checks. `availableSteps` / hop availability from engine projections. Axis splice via `buildAxis`. Hooks: `run:` as effects with same matcher; `instruction:` not checks. `CompileContext` MUST NOT call `evaluate`. Step `requires` are artifact IDs; DAG cycles rejected at `buildSchema`.

### Implementation Status

| Area                                     | Status      | Evidence                                                                                                                                                   |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lookup vs protocol                       | Implemented | `schema.workflowStep`; omitted row → null extras; `VALID_TRANSITIONS` unchanged                                                                            |
| Unknown step at `buildSchema`            | Implemented | `build-schema.ts` 687–695; test `build-schema.spec.ts` 37–41                                                                                               |
| Axis splice / omit-implementing backward | Implemented | `classifyAlong` + tests (see transition-checks)                                                                                                            |
| Shared requires/taskCompletion           | Implemented | application `createWorkflowRequires` / `createWorkflowTaskCompletion`; engine projects results                                                             |
| `CompileContext` not evaluate            | Implemented | workflow-model constraint; compile-context tests assert no hop availability evaluation (consumer spec)                                                     |
| GetStatus/engine extras-only             | Implemented | engine map of `schema.workflow()`                                                                                                                          |
| Requires → `InvalidStateTransitionError` | Implemented | TransitionChange maps failed `workflow.requires` (allowed failed-predicate mapping); domain `run` uses `INCOMPLETE_ARTIFACT` including `status: 'missing'` |

### Discrepancies

None current on unknown-step rejection site (hop-time vs build time). `classifyAlong` still defensively filters non-`ChangeState` strings; resolved schemas never contain them (`buildSchema` already threw). Belt-and-suspenders, not a second rejection site.

Constraint “never from `change.effectiveStatus()` (the entity has no such method)” is **true of code** (`graph search` `effectiveStatus`: engine `_effectiveStatus` only; no `Change` method). Contradicts leftover schema-format language (counted under `core:schema-format`).

### Test Coverage

- `build-schema.spec.ts` unknown / duplicate / `requiresTaskCompletion` subset / `hasTasks`.
- `transition-checks.spec.ts` axis classification.
- `lifecycle-engine.spec.ts` extras vs protocol.

### Missing Tests

- End-to-end: schema YAML with `step: reviewing` fails at `buildSchema` **and** `TransitionChange` is never invoked (only build/resolve covered) (**gap**).

### Spec Dependency Chain

- `core:change` — **Consistent.**
- `core:schema-format` — unknown step `SchemaValidationError`. **Consistent** for Workflow requirement. **Inconsistent** with schema-format Artifact `Change.effectiveStatus()` (schema-wrong).
- `core:build-schema` — implementation site. **Consistent.**
- `core:compile-context` — must not evaluate hops. **Consistent** (constraint).
- `core:get-status` / `core:transition-change` / `core:archive-change` / `core:hook-execution-model` — shared matcher. **Consistent** with extras-only `availableSteps` and check pipeline.
- `core:transition-checks` — **Consistent.**

### Counts

| Metric               | Count |
| -------------------- | ----- |
| pass (requirements)  | 10    |
| fail (discrepancies) | 0     |
| gaps (missing tests) | 1     |
| critical             | 0     |
| major                | 0     |
| minor                | 0     |
| LOW                  | 0     |

---

## Spec: `core:schema-format`

### Requirements Summary

`workflow` is optional lookup config, not a state-machine definition. `step` names existing lifecycle states. Declaration order is display + listed names on the `along` axis; missing delivery states spliced by fallback index. Unknown `step` MUST throw `SchemaValidationError` at `buildSchema` and MUST NOT occupy an axis slot or reach hop evaluation. `requiresTaskCompletion` subset of `requires` and `hasTasks: true`. Artifact `requires` still described as feeding `Change.effectiveStatus()` (pre-existing artifact section).

### Implementation Status

| Area                                    | Status      | Evidence                                                                                       |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Lookup language in Workflow requirement | Implemented | spec-preview Requirement: Workflow; change delta extras-vs-protocol                            |
| Unknown step validation                 | Implemented | `build-schema.ts` 687–695; verify scenario “Unknown workflow step is rejected at schema build” |
| `requiresTaskCompletion` invariants     | Implemented | `build-schema.ts` 721–739                                                                      |
| Duplicate steps                         | Implemented | `build-schema.ts` 678–685                                                                      |
| Axis occupied only by ChangeState       | Implemented | unknown never stored on `Schema`; `buildAxis` also filters                                     |
| YAML boundary typed error               | Implemented | `SchemaValidationError` extends `SpecdError`                                                   |

### Discrepancies

**1. Artifact `requires` still names `Change.effectiveStatus()` (spec-wrong)**

- **Spec (`schema-format`):** Artifact `requires` “used to compute `Change.effectiveStatus()`”; verify scenario “THEN `Change.effectiveStatus('b')` must return `in-progress`” when A is `in-progress`.
- **Code / sibling specs:** No `Change.effectiveStatus` method (`graph search` `effectiveStatus` → `LifecycleEngine._effectiveStatus` only). `core:workflow-model` constraint: never from `change.effectiveStatus()` (entity has no such method). `core:lifecycle-engine`: if B is `complete` and parent A is not complete/skipped, effective status is `pending-parent-artifact-review`, not `in-progress`.
- **Interpretation A (code + lifecycle-engine right):** schema-format leftover; should cite `LifecycleEngine.projectArtifacts` / `_effectiveStatus`. **Interpretation B (schema-format right):** Change should own DAG effective status — would contradict this change’s engine-as-sole-authority and workflow-model.
- **Verdict:** **spec-wrong** (schema-format + its verify scenario). Code matches lifecycle-engine.
- **Severity:** minor (does not break workflow-lookup implementation; it is a real spec-vs-spec/code contradiction in an audited spec).

**2. “Schema validation on load” bullet list omits unknown `workflow[].step` (LOW)**

- Workflow requirement and `buildSchema` **do** reject unknown steps. The enumerated “Validation covers” list (`schema-format` spec) lists duplicate steps but not “step is not a ChangeState”.
- **Severity:** LOW (incomplete list; behaviour is specified elsewhere and implemented).

### Test Coverage

- `build-schema.spec.ts` 32–41 accept valid ChangeState / reject `reviewing`.
- `requiresTaskCompletion` / `hasTasks` validation in the same file.
- Plugin/resolve path covered in `resolve-schema.spec.ts` (prior evidence; not re-run here).

### Missing Tests

- Explicit message assertion: `workflow step 'reviewing' is not a valid lifecycle state` (throw type covered; exact string optional) (**gap**).
- No test that `Change` lacks `effectiveStatus` (would lock the schema-format leftover as wrong).

### Spec Dependency Chain

- `core:delta-format` / `core:selector-model` / `core:content-extraction` / `core:schema-merge` — unchanged by workflow-lookup semantics. **No contradiction** with extras-vs-protocol.
- Downstream `core:workflow-model` / `core:transition-checks` / `core:lifecycle-engine` — **Consistent** on workflow lookup; **inconsistent** on `Change.effectiveStatus()` (above).
- `default:_global/architecture` — YAML → `SchemaValidationError`. **Consistent.**

### Counts

| Metric                               | Count                                            |
| ------------------------------------ | ------------------------------------------------ |
| pass (workflow-related requirements) | 1 (Workflow) + remaining schema-format unchanged |
| fail (discrepancies)                 | 1 (minor: `Change.effectiveStatus`)              |
| gaps (missing tests)                 | 2                                                |
| critical                             | 0                                                |
| major                                | 0                                                |
| minor                                | 1                                                |
| LOW                                  | 1 (validation bullet list)                       |

---

## Spec: `core:change`

### Requirements Summary

Fixed `ChangeState` set including drain parking states. When approval gates are on, the change **stays** in `ready` or `done` until `ApproveSpec` / `ApproveSignoff`; `change transition` does not enter `pending-*`. `VALID_TRANSITIONS['ready']` is `implementing` and `designing` only. Drain: `pending-spec-approval` → `spec-approved` | `designing`. Skill-aligned backward hops from `done` / `signed-off` / `archivable`. `implementing → verifying` gated by `workflow.taskCompletion`. Entity still rejects pairs not in `VALID_TRANSITIONS`.

### Implementation Status

| Area                            | Status      | Evidence                                                                                                                                                 |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stay-in-ready/done              | Implemented | `change-state.ts` 30–42; `ready`: `['implementing', 'designing']`; `done`: `archivable`, `designing`, `implementing`, `verifying` — no `pending-signoff` |
| Drain-only pending              | Implemented | `pending-spec-approval` / `pending-signoff` targets only drain hops                                                                                      |
| No pending rewrite in engine    | Implemented | `_resolveTarget` identity                                                                                                                                |
| TransitionChange persist target | Implemented | `transition-change.ts` 203: `effectiveTarget = requestedTarget`                                                                                          |
| Backward hops                   | Implemented | `done` / `signed-off` / `archivable` include implementing/verifying; `archiving` only archivable/designing                                               |
| Task gate as check              | Implemented | delegated to `workflow.taskCompletion` (this change); entity `transition()` still protocol-only                                                          |

### Discrepancies

None vs locked product. Next-action still has drain copy **if** `state === 'pending-spec-approval'` (`lifecycle-engine.ts` 851–857) — in-flight UX, not a new parking hop from `ready`.

### Test Coverage

- `transition-checks.spec.ts` pending→spec-approved classified `forward` (delivery alias), not a new enter-from-ready hop.
- Entity / `VALID_TRANSITIONS` historically covered in change-state / transition-change tests; stay-in-ready execute in `transition-change.spec.ts`.

### Missing Tests

- None required for this batch beyond existing stay-in-ready execute tests.

### Spec Dependency Chain

- `core:workflow-model` / `core:lifecycle-engine` / `core:transition-checks` — **Consistent** (protocol vs extras; approvals as checks on delivery edge).
- `default:_global/architecture` — entity throws typed errors on invalid `transition()`. **Consistent** (`isValidTransition` is the machine).
- Other deps (`change-manifest`, `spec-metadata`, …) — not implicated by this change’s check model.

### Counts

| Metric                                                | Count                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| pass (lifecycle + related requirements in this batch) | 4 (Lifecycle, Skill-aligned hops, Archiving escape, Impl/verify loop gating) |
| fail (discrepancies)                                  | 0                                                                            |
| gaps (missing tests)                                  | 0                                                                            |
| critical                                              | 0                                                                            |
| major                                                 | 0                                                                            |
| minor                                                 | 0                                                                            |
| LOW                                                   | 0                                                                            |

---

## Architecture consistency (`default:_global/architecture`)

| Constraint                     | Status                   | Notes                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain no I/O                  | Implemented              | `domain/checks/*` `run`/`execute` use `ctx` facts only; application `create*` own ports                                                                                                                                       |
| Application via ports          | Implemented              | `CountTasks`, `RunStepHooks`, ready-facts ports on factories                                                                                                                                                                  |
| Typed domain errors            | Implemented              | `InvalidInputError`, `SchemaValidationError`, `HookFailedError` extend `SpecdError`                                                                                                                                           |
| YAML → `SchemaValidationError` | Implemented              | `buildSchema`                                                                                                                                                                                                                 |
| Inner layers no outer imports  | Implemented (spot-check) | domain checks import domain services/value-objects only                                                                                                                                                                       |
| Stateless domain as functions  | LOW                      | `class LifecycleEngine` with instance methods (`lifecycle-engine.ts` 124–127). Pre-existing pattern; `evaluate` / `projectArtifacts` are I/O-free. Architecture MUST is functions-not-classes. **Not unique to this change.** |
| Manual DI                      | Implemented              | `createWorkflowCheckRegistry(deps)`                                                                                                                                                                                           |

### Discrepancy (LOW)

LifecycleEngine class vs “plain exported functions”. **Interpretation A:** extract functions. **Interpretation B:** established domain-service shape. Severity LOW; not a functional fail for transition checks.

---

## Conventions consistency (`default:_global/conventions`)

| Constraint                          | Status      | Notes                                                                             |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| kebab-case modules                  | Implemented | `transition-checks.ts`, `check-bindings.ts`, `workflow-check.ts`, per-check files |
| Named exports                       | Implemented | no default exports on these modules                                               |
| Explicit return types on public API | Implemented | `classifyAlong`, `applyBindingSpecs`, `evaluate`, `createWorkflowCheckRegistry`   |
| Errors extend `SpecdError`          | Implemented | see architecture                                                                  |
| Layer barrels                       | Implemented | `domain/checks/index.ts` allowed for packages with >50 modules                    |

No new convention fails in this batch’s core check modules.

---

## Testing consistency (`default:_global/testing`)

| Constraint              | Status      | Notes                                                                                                                                                                                                   |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest + `test/` mirror | Implemented | `test/domain/services/transition-checks.spec.ts`, `lifecycle-engine.spec.ts`, `build-schema.spec.ts`, `test/application/checks/workflow-check-factories.spec.ts`                                        |
| given/when/then names   | Mostly      | classifyAlong / engine tests follow the pattern                                                                                                                                                         |
| No snapshot tests       | Implemented | assertions are explicit                                                                                                                                                                                 |
| Full port mocks         | LOW         | `workflow-check-factories.spec.ts` uses `as unknown as CountTasks` / `RunStepHooks` (partial). Testing spec forbids `{ … } as unknown as Port`. Pattern exists elsewhere; not a product-behaviour fail. |

---

## Graph / coverage (LOW)

`relationCounts.COVERS_SYMBOL: 0` while `COVERS_FILE: 177`. Spec↔symbol graph links are empty. Cosmetic for this audit (implementation was located via `graph search` declarations + file reads). **LOW** stale/incomplete coverage links, not a behavioural discrepancy.

---

## Batch totals

| Spec                     | pass          | fail  | gaps  | critical | major | minor | LOW               |
| ------------------------ | ------------- | ----- | ----- | -------- | ----- | ----- | ----------------- |
| `core:transition-checks` | 13            | 0     | 2     | 0        | 0     | 0     | 0                 |
| `core:lifecycle-engine`  | 9             | 0     | 2     | 0        | 0     | 0     | 1                 |
| `core:workflow-model`    | 10            | 0     | 1     | 0        | 0     | 0     | 0                 |
| `core:schema-format`     | (Workflow OK) | 1     | 2     | 0        | 0     | 1     | 1                 |
| `core:change`            | 4             | 0     | 0     | 0        | 0     | 0     | 0                 |
| architecture             | —             | 0     | 0     | 0        | 0     | 0     | 1 (class)         |
| conventions              | —             | 0     | 0     | 0        | 0     | 0     | 0                 |
| testing                  | —             | 0     | 0     | 0        | 0     | 0     | 1 (partial mocks) |
| graph coversSymbol       | —             | 0     | 0     | 0        | 0     | 0     | 1                 |
| **Total (behavioural)**  | —             | **1** | **7** | **0**    | **0** | **1** | **5**             |

### Focus items (current)

| Item                                                                   | Status                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `_requestedTargetBlockers` dual-write INCOMPLETE vs MISSING            | **Implemented** (`hasRequiresResult` skip; test 854–866)                                  |
| Unknown workflow step at `buildSchema`                                 | **Implemented**                                                                           |
| `applyBindingSpecs` → `InvalidInputError`                              | **Implemented**                                                                           |
| Dead `executeHookEffect` helpers                                       | **Implemented** (removed)                                                                 |
| GetStatus/engine `availableSteps` extras-only                          | **Implemented**                                                                           |
| `classifyAlong` omit-implementing `verifying→implementing` is backward | **Implemented**                                                                           |
| Public blockers = failed-predicate codes                               | **Implemented**                                                                           |
| `skipHookPhases` phase + selectors                                     | **Implemented**                                                                           |
| Archive `spec.overlap` skip id-switch                                  | **Closed** (`allowOverlap` + overlap list)                                                |
| Remaining real discrepancy                                             | schema-format `Change.effectiveStatus()` leftover (**minor, spec-wrong**)                 |
| LOW                                                                    | engine class vs functions; validation bullet list; partial port mocks; `COVERS_SYMBOL: 0` |
