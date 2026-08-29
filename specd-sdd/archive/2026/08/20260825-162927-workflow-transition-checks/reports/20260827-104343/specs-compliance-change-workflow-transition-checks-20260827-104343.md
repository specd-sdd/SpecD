# Specs compliance — change `workflow-transition-checks`

- **Timestamp:** 20260827-104343
- **Mode:** change audit (full verification)
- **Change path:** specd-sdd/changes/20260825-162927-workflow-transition-checks
- **Change state at audit:** verifying
- **Specs in scope:** 19 change specs + globals architecture/conventions/testing

## Executive summary

Verification scenarios: **PASS** (core 2477, CLI 901, skills 48 tests; scenario agents reported no failed WHEN/THEN).

Compliance: **no critical/major implementation bugs** on the product axis (checks ABI, stay-in-ready/done, no snapshot bag, GetStatus from checks, archive after-persist collect, presenters, skill routing).

Material follow-ups for the reviewer:

1. **Medium (cross-spec / templates):** text `change status` omits `review:`; several skills still look for `review: required: yes` (D1 in CLI/skills batch). Spec-wrong or template-stale; code matches `cli:change-status`.
2. **Minor (spec-wrong):** `core:schema-format` still names `Change.effectiveStatus()`; DAG status lives on `LifecycleEngine`.
3. **Partial / leftover:** `ArchiveChange` still takes unused `RunStepHooks` for default bindings; transition progress is the generic check bus (spec still mentions legacy hook-start/phase in places).

## Aggregated counts

| Batch          | Critical | Major | Medium |                   Minor | LOW/info |
| -------------- | -------: | ----: | -----: | ----------------------: | -------: |
| core-checks    |        0 |     0 |      0 |                       1 |  several |
| core-use-cases |        0 |     0 |      0 | leftover ctor / wording |  several |
| cli-skills     |        0 |     0 | 1 (D1) |                       0 |        4 |

## Detailed findings

The following sections are the complete partial reports, verbatim.

---

# Partial: core-checks

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

---

# Partial: core-use-cases

# Spec compliance audit — core use cases (`workflow-transition-checks`)

**Mode:** change-scoped, read-only  
**Change:** `workflow-transition-checks` (state `verifying`)  
**Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`  
**CLI:** `node packages/cli/dist/index.js`  
**Specs:** merged via `changes spec-preview workflow-transition-checks <specId>`  
**Graph:** `stale: false`, `contentFresh: true`, `lastIndexedAt: 2026-08-27T08:44:02.754Z`  
**Globals checked:** `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`  
**Code/specs:** not modified (this file only)

**Assigned specs**

- `core:transition-change`
- `core:get-status`
- `core:archive-change`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `core:validate-artifacts`
- `core:get-artifact-instruction`
- `core:config` (approval-gate / pending-hop delta + related Approvals requirements only)

**Focus lens:** stay-in-ready/done, no snapshot bag, GetStatus from checks, archive after-persist collect, bindings not RunStepHooks on ArchiveChange, empty `checksByTarget` for instruction/validate DAG.

Primary surfaces (graph):

| Symbol                             | File                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `TransitionChange`                 | `packages/core/src/application/use-cases/transition-change.ts:109`      |
| `GetStatus`                        | `packages/core/src/application/use-cases/get-status.ts:281`             |
| `ArchiveChange`                    | `packages/core/src/application/use-cases/archive-change.ts:275`         |
| `ApproveSpec`                      | `packages/core/src/application/use-cases/approve-spec.ts:30`            |
| `ApproveSignoff`                   | `packages/core/src/application/use-cases/approve-signoff.ts:30`         |
| `ValidateArtifacts`                | `packages/core/src/application/use-cases/validate-artifacts.ts:114`     |
| `GetArtifactInstruction`           | `packages/core/src/application/use-cases/get-artifact-instruction.ts`   |
| `createHookPre` / `createHookPost` | `packages/core/src/application/checks/hook-effect.ts:187`               |
| `executeChecksByLegalTargets`      | `packages/core/src/application/services/execute-matching-predicates.ts` |
| `matchingEffects`                  | `packages/core/src/application/services/execute-hook-effect.ts:23`      |
| `resolveTransitionChangeDeps`      | `packages/core/src/composition/use-cases/transition-change.ts:44`       |
| `resolveArchiveChangeDeps`         | `packages/core/src/composition/use-cases/archive-change.ts:121`         |

`gatherPredicateSnapshots` / `PredicateSnapshots` / `emptyPredicateSnapshots`: **absent** from `packages/core/src` (graph + search). Domain test asserts they are not exported.

---

## Focus findings (executive)

| Focus                                               | Verdict                                            | Evidence                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stay in `ready` / `done`                            | **Implemented**                                    | `TransitionChange` persists `requestedTarget` with no pending-hop rewrite. `approval.spec` / `approval.signoff` map to `InvalidStateTransitionError` `{ type: 'approval-required' }` before `mutate`. `ApproveSpec` / `ApproveSignoff` record consent without transitioning on bound `from` states. Config Approvals delta documents in-place checks. |
| No snapshot bag                                     | **Implemented**                                    | Checks execute with `CheckExecutionContext` (change, schema, attempt, approvals, optional skip). Each check owns I/O via `create*` ports. No gatherer type.                                                                                                                                                                                           |
| GetStatus from checks                               | **Implemented**                                    | `executeChecksByLegalTargets` then `LifecycleEngine.evaluate(..., { checksByTarget })`. Task counts painted from `workflow.taskCompletion` details, not a second `CountTasks` on the use case.                                                                                                                                                        |
| Archive after-persist collect                       | **Implemented**                                    | `ARCHIVE_BINDING_SPECS` `hook.post`: `phase: 'after-persist'`, `onFailure: 'collect'`. After `archiveRepository.archive()`, `matchingEffects(..., 'after-persist')`; fail → `postHookFailures` when `hookFailureMode === 'fail-soft'`.                                                                                                                |
| Bindings not `RunStepHooks` on ArchiveChange        | **Mostly implemented; leftover constructor param** | Instance field is `_archiveBindings` only. Effects run via `check.execute`. `RunStepHooks` remains a **positional constructor argument** used only for `defaultArchiveBindings` fallback. Composition still puts `runStepHooks` on `ArchiveChangeDeps`. Spec also still lists it under Ports/factory (internal spec contradiction).                   |
| Empty `checksByTarget` for instruction/validate DAG | **Implemented**                                    | Both call `evaluate(change, schema, { checksByTarget: {} })`. Tests spy that options object.                                                                                                                                                                                                                                                          |

---

## Spec: `core:transition-change`

### Requirements summary

Merged spec centralizes hops on composed `transitionBindings`. Approval is a predicate on the requested delivery edge. Effective persist target is the requested target (no pending rewrite). Predicates then `before-persist` effects (`hook.post` then `hook.pre` via matcher + phase), then `ChangeRepository.mutate`. `RunStepHooks` / `CountTasks` are not use-case ports.

### Implementation status (requirement-level)

| Requirement                                                        | Status          | Notes                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------- |
| Input contract                                                     | **implemented** | `TransitionChangeInput`: `name`, `to`, optional `skipHookPhases`, `refreshImplementationTrackingBefore`, `allowOutOfScope`. No gate flags on input.                                                                                                    |
| Approval gates baked at construction                               | **implemented** | `approvals: ApprovalGates` ctor; `resolveTransitionChangeDeps` uses `resolver.config.approvals`.                                                                                                                                                       |
| Change must exist                                                  | **implemented** | `ChangeNotFoundError` when `get` is null.                                                                                                                                                                                                              |
| Optional pre-transition implementation tracking refresh            | **implemented** | Refresh unless `refreshImplementationTrackingBefore === false`.                                                                                                                                                                                        |
| Spec approval is a check not a pending hop                         | **implemented** | No rewrite to `pending-spec-approval`. Failed `approval.spec` → `approval-required` / `gate: 'spec'` before persist.                                                                                                                                   |
| Signoff is a check not a pending hop                               | **implemented** | Same for `done` → `archivable` / `approval.signoff`.                                                                                                                                                                                                   |
| Human-approval pending states produce explicit transition failures | **implemented** | `_assertDrainAndGateTargets` allows drain `pending-*` → designing / historic approve-forward; `gate-not-required` when targeting pending/approved states with gates off. Protocol edge rejects `ready → pending-spec-approval` (`change-state` tests). |
| Direct transition when gates are inactive                          | **implemented** | `effectiveTarget = requestedTarget`; persist after green predicates.                                                                                                                                                                                   |
| Workflow requires enforcement                                      | **implemented** | `workflow.requires` via matching predicates; map fail to `incomplete-artifact` using check details + `findBlockingParent`. Progress from evaluation, not a second walk after green execute (fail path emits then throws).                              |
| Task completion check during requires enforcement                  | **implemented** | Mapped from `workflow.taskCompletion` details; `CountTasks` not a use-case port.                                                                                                                                                                       |
| Artifact validation clearing on verifying → implementing           | **implemented** | No artifact downgrade on that hop (only designing invalidation + skill-hop signoff invalidate).                                                                                                                                                        |
| Skill-aligned backward hop invalidation                            | **implemented** | `invalidateSignoff` for done/signed-off/archivable → implementing/verifying; `along` excludes `hook.post` (`along: 'forward'` on binding).                                                                                                             |
| Transition to designing from any state                             | **implemented** | `invalidate` inside mutate when not already designing/drafting.                                                                                                                                                                                        |
| Transition from archiving to archivable                            | **implemented** | `exceptAlong: ['recovery']` on requires/task/hook.pre; `hook.post` forward-only.                                                                                                                                                                       |
| Pre-hook / Post-hook execution                                     | **implemented** | `matchingEffects(..., 'before-persist')` then `executeCheckWithProgress`; skip via `ctx.skipHookPhases` inside `HookEffectCheck`, not `check.id` switch to launch `RunStepHooks`.                                                                      |
| Transition delegation                                              | **implemented** | `freshChange.transition(effectiveTarget, actor)` (or invalidate path for designing).                                                                                                                                                                   |
| Transition event                                                   | **implemented** | `{ type: 'transitioned', from, to }` after mutate.                                                                                                                                                                                                     |
| Persistence                                                        | **implemented** | `changes.mutate`.                                                                                                                                                                                                                                      |
| Result type                                                        | **implemented** | `{ change }` only; no `postHookFailures` (transition abort).                                                                                                                                                                                           |
| Progress callback                                                  | **partial**     | Requires/task/transitioned match. Hook progress is **generic check bus** (`check-start` / `check-progress` with `detail: 'hook-start'                                                                                                                  | 'hook-done'`), not `{ type: 'hook-start', phase: 'pre' | 'post' }` as written in this spec. |
| Dependencies                                                       | **implemented** | No `RunStepHooks` / `CountTasks` / `ImplementationDetector` on the class.                                                                                                                                                                              |
| Config-based factory / `resolveTransitionChangeDeps`               | **implemented** | Bindings from `resolveWorkflowCheckRegistry`; does not put `runStepHooks` on deps.                                                                                                                                                                     |

### Constraints vs code

- Failed predicates map to existing reasons via `_mapFailedPredicate` (`protocol.edge`, requires, tasks, approval, deps, readOnly, impl.\*).
- Schema miss: `schemaProvider.get()` is not swallowed (throws).
- Enter-ready / exit-implementing share registry runners with archive (same `create*` ids). Redesign `along` is not `forward`, so `impl.*` bindings (`along: 'forward'`) do not match — **compliant**.

### Purpose vs requirements (spec-internal)

Purpose still says the use case delegates **approval-gate routing** to `LifecycleEngine` while requirements forbid target rewrite. Engine is still used for projection (`evaluate` with `checksByTarget: { [requestedTarget]: evaluation.checks }`) and artifact DAG (`projectArtifacts`). **Routing rewrite is gone; purpose text is stale.**

### Discrepancies

1. **Progress event shape (spec vs code)**
   - Spec: `{ type: 'hook-start', phase: 'pre'|'post', hookId, command }` and matching `hook-done`.
   - Code: `CheckProgressEvent` nested under TransitionChange’s `onProgress`.
   - **Either:** spec should adopt the generic check bus (likely, given `core:transition-checks`), **or** TransitionChange should re-emit the old first-class hook events. Tests do not assert `type: 'hook-start'` with `phase`.

2. **Spec purpose / constraint “approval-gate routing”** vs “no effective-target rewrite” — **spec-internal**, code follows the latter.

### Test coverage

| Area                                                      | Coverage                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Stay in ready / approval-required                         | `packages/core/test/application/use-cases/transition-change.spec.ts` (`stays in ready and throws approval-required...`) |
| Stay in done / signoff                                    | same file (`stays in done...`)                                                                                          |
| Drain pending hops                                        | same file                                                                                                               |
| Hooks via `RunStepHooks` in check, not use-case id switch | hook describe block spies `RunStepHooks.execute`                                                                        |
| Factory without `RunStepHooks` on use case                | composition test + ctor shape                                                                                           |

### Missing / weak tests

- No assertion that `onProgress` receives `{ type: 'hook-start', phase }` as specified (would fail today).
- No explicit “does not rewrite `to` to `pending-spec-approval`” persist spy beyond remaining in `ready` (outcome-equivalent).

### Spec dependency chain

Depends on `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

**Consistency:** Aligns with `core:config` Approvals delta and `core:approve-spec` stay-in-ready. Aligns with `core:hook-execution-model` (transition effects `before-persist` / `abort`). Conflicts with leftover “routing” wording in its own Purpose.

### Summary counts (`core:transition-change`)

- Requirements reviewed: 22
- Implemented: 21
- Partial: 1 (progress callback shape)
- Missing: 0
- Spec-internal stale wording: 1 (Purpose routing)
- Test gaps: 1 (legacy hook-start shape)

---

## Spec: `core:get-status`

### Requirements summary

Status is predicate-execute-then-project. No global snapshot bag. No `CountTasks` on the use case. Drafts use DAG-only (`projectArtifacts` / empty hop checks). Full path uses `executeChecksByLegalTargets` + engine projection.

### Implementation status

| Requirement                                           | Status                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepts a change name as input                        | **implemented**                                                                                                           | `name`, `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                                                                                                                                                                                                    |
| Returns the change and artifact statuses              | **implemented**                                                                                                           | Active `change` vs `draftView`; no `getDiscarded`                                                                                                                                                                                                                                                                                                             |
| Revision evaluation                                   | **implemented**                                                                                                           | Short-circuit skips refresh and full evaluate; empty artifactStatuses; `checksByTarget: {}`                                                                                                                                                                                                                                                                   |
| Drafted change read-only status                       | **implemented**                                                                                                           | `projectArtifacts` (spec allows this as the empty-`checksByTarget` DAG cascade). `availableTransitions: []`, `nextAction.command: null`                                                                                                                                                                                                                       |
| Implementation status projection                      | **implemented**                                                                                                           | `projectImplementationTracking`                                                                                                                                                                                                                                                                                                                               |
| Optional pre-read refresh                             | **implemented**                                                                                                           | After 304-style short-circuit; not for drafts                                                                                                                                                                                                                                                                                                                 |
| Drift-aware display status                            | **implemented**                                                                                                           | File + aggregate precedence                                                                                                                                                                                                                                                                                                                                   |
| Reports task completion from checks                   | **implemented**                                                                                                           | `taskCompletionFromChecks(checksByTargetMap)` reads `workflow.taskCompletion` `details.byArtifact`. No `CountTasks` field on `GetStatus`. Order: `projectArtifacts` (DAG statuses for check ctx) → `executeChecksByLegalTargets` (CountTasks inside check) → `evaluate`. This is **not** “engine then CountTasks only to paint”; paint is from check details. |
| Execute matching predicates then project              | **implemented**                                                                                                           | `executeChecksByLegalTargets` then `evaluate({ checksByTarget })`. Engine stays I/O-free. Result exposes `lifecycle.checksByTarget` and `lifecycle.checks`.                                                                                                                                                                                                   |
| Throws ChangeNotFoundError                            | **implemented**                                                                                                           |                                                                                                                                                                                                                                                                                                                                                               |
| Constructor dependencies                              | **implemented**                                                                                                           | `transitionBindings`; no `CountTasks`                                                                                                                                                                                                                                                                                                                         |
| Config-based factory bootstrap                        | **implemented** (composition; not re-audited line-by-line)                                                                |                                                                                                                                                                                                                                                                                                                                                               |
| Reports effective status for every artifact           | **implemented with nuance**                                                                                               | Full path iterates **schema artifact types**, filling missing as `missing`. Spec says “exactly one entry per artifact in the change's artifact map”. Extra schema types not on the change still appear. Likely longstanding; not introduced as snapshot-bag work.                                                                                             |
| Returns lifecycle context / blockers / nextAction     | **implemented**                                                                                                           | `_mergeBlockers` flattens failed predicates from all legal targets                                                                                                                                                                                                                                                                                            |
| Identifies blockers                                   | **implemented**                                                                                                           |                                                                                                                                                                                                                                                                                                                                                               |
| Graceful degradation when schema resolution fails     | **implemented**                                                                                                           | catch around `schemaProvider.get()`; persisted statuses only                                                                                                                                                                                                                                                                                                  |
| Config-based factory delegates `resolveGetStatusDeps` | **assumed implemented** via composition pattern matching TransitionChange; not opened in this pass beyond GetStatus class |

### Discrepancies

1. **Artifact list vs change map** (see table): possible spec vs code mismatch if a change has a subset of schema artifacts. Prefer clarifying spec to “one row per schema artifact type (missing if absent)” if that is the intended CLI contract.

2. **GetStatus tests** never mention snapshot bags or `executeChecksByLegalTargets` by name. Behaviour is covered indirectly (`availableTransitions` omit verifying when tasks incomplete). Domain module tests the absence of snapshot exports.

### Test coverage

- Draft empty transitions: `get-status.spec.ts` (`availableTransitions` `[]`)
- Task gating on status: `omits verifying from availableTransitions when implementing tasks are incomplete`
- Draft parent-review cascade without hop evaluate: `projects pending-parent-artifact-review for drafted dependents without calling evaluate`

### Missing tests

- Spy that `evaluate` is called with the map from `executeChecksByLegalTargets` (not `{}`) on the **active** path.
- Spy that `CountTasks` is not constructed on `GetStatus`.
- Explicit “no snapshot bag argument” (would be vacuously true).

### Spec dependency chain

Depends on change, kernel, transition-change, schema-format, config, lifecycle-engine, refresh, composition-resolver, count-tasks, transition-checks.

**Consistency with globals:** Application use case orchestrates I/O checks; domain engine projects — matches architecture. Tests in `test/application/use-cases/` — conventions.

### Summary counts (`core:get-status`)

- Requirements reviewed: 18 (this spec’s requirement headings in preview)
- Implemented: 16–17
- Partial / nuance: 1 (artifact row population vs “change map”)
- Missing: 0
- Test gaps: 2 (direct spies for check-then-project / no CountTasks on ctor)

---

## Spec: `core:archive-change`

### Requirements summary (focus + related)

Archive is an operation-scope check table. Predicates then `before-persist` effects (`abort`), persist/publish/archive, then `after-persist` effects (`collect`). Bindings injected; `RunStepHooks` belongs on hook checks.

### Implementation status

| Requirement                                                                                                | Status                                                         | Notes                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor (legacy block)                                                                       | **spec stale vs later requirement**                            | Still documents `RunStepHooks`, `ReadonlyMap` of spec repos, `RegenerateSpecMetadata`. Code: `ListWorkspaces`, `MaterializeSpecMetadata`, optional `archiveBindings`, `runStepHooks` still **required positional** for default registry.                                                                            |
| Archive bindings not RunStepHooks on the use case                                                          | **partial**                                                    | `_archiveBindings` stored. No `_runStepHooks` field. Kernel path: `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` **and** `runStepHooks`. Fallback `defaultArchiveBindings()` in the **use case file** still composes `createWorkflowCheckRegistry` + `CountTasks` if bindings omitted. |
| Input                                                                                                      | **implemented**                                                | `skipHookPhases` `pre`/`post`/`all`, `allowOverlap`, `allowOutOfScope`                                                                                                                                                                                                                                              |
| Schema name guard                                                                                          | **implemented**                                                | Predicate `schema.nameMatch` mapped to `SchemaMismatchError`                                                                                                                                                                                                                                                        |
| Archivable guard                                                                                           | **implemented**                                                | `archive.archivable` wraps `assertArchivable()`; fail mapping calls `assertArchivable()` again (throws `InvalidStateTransitionError`). Hooks not reached.                                                                                                                                                           |
| Deferred transition to archiving                                                                           | **implemented**                                                | mutate after snapshots, before publish loop                                                                                                                                                                                                                                                                         |
| ReadOnly / overlap                                                                                         | **implemented**                                                | Named predicates; overlap skippable via `allowOverlap`                                                                                                                                                                                                                                                              |
| Pre-archive hooks                                                                                          | **implemented**                                                | `matchingEffects(..., 'before-persist')`; skip `all`/`pre` inside hook check                                                                                                                                                                                                                                        |
| Tracked artifact selection / plan / staged commit / batch snapshot / restore / orphan / rollback / logging | **not re-proven line-by-line**                                 | Present in same `execute` (prepare → snapshot → mutate → publish → archive → cleanup). Out of focus except order vs after-persist.                                                                                                                                                                                  |
| Delta merge / archive repo / index / spec metadata / spec-lock / result / typed errors                     | **present in file**; metadata **before** after-persist effects |
| Post-archive hooks / after-persist collect                                                                 | **implemented**                                                | After `archive()` and backup `cleanup` and stale metadata loop: `matchingEffects(..., 'after-persist')`; collect commands into `postHookFailures`                                                                                                                                                                   |
| Archive checks share runners                                                                               | **implemented**                                                | Registry ids match spec list; `archive.publication` absent (domain test)                                                                                                                                                                                                                                            |
| Extra `_assertArchiveDepsConsistent`                                                                       | **compatible**                                                 | Second `runDepsConsistent` on **sidecar `finalDependsOn` vs extract** during preflight — spec allows remaining preflight inside the use case after named predicates. Shares the **runner**, not a second binding-table pass for the same facts.                                                                     |
| Config factory `resolveArchiveChangeDeps`                                                                  | **partial vs newer wording**                                   | Still **must** resolve `runStepHooks` per **this requirement’s list**. Newer “bindings not RunStepHooks” says RunStepHooks is only for `createHook*`. Composition satisfies the **older factory list** and the **inject bindings** clause.                                                                          |

### Discrepancies

1. **Spec-internal:** “Ports and constructor” + factory bullet list still require `RunStepHooks` on `ArchiveChange`; “Archive bindings not RunStepHooks” forbids storing it and says it is only a `createHook*` dep.
   - **Code** keeps the constructor argument for default wiring, does not store it when bindings are passed.
   - **Architecture:** `defaultArchiveBindings` inside `archive-change.ts` is composition logic in the application use case (should live in `composition/` only). Inner domain does not import fs. Mild layering smell, not a snapshot-bag issue.

2. **Verify scenario** “THEN it does not keep an unused `RunStepHooks` instance field” — **true** (no field). Tests do **not** assert this (no `_runStepHooks` / “unused field” test).

3. **Hook progress / skip:** Use case still **invokes** `execute` when skipped; skip is inside the check (`skip.has('post')`). Compliant with “skip MUST NOT rely on check.id”; slightly different from “do not call execute”.

4. **Metadata vs after-persist order:** Spec post-hooks: after `archive()` succeeds. Spec metadata: after `archive()` and backup delete. Code: archive → cleanup → metadata force → after-persist. **Compatible.** If a post-hook must observe metadata files, order is metadata-first.

### Test coverage

- Archive hook spies in `archive-change.spec.ts` (`RunStepHooks delegation parameters`, pre fail-fast, post collect).
- `matching-effects.spec.ts`: archive `after-persist` collect without filtering by check id.
- `transition-checks.spec.ts`: archive post `phase`/`onFailure`; no `archive.publication`; no snapshot exports.
- `archive-change-batch-restore.spec.ts`: log lines `after-persist effects started/completed`.
- Composition `createArchiveChange` instantiates; does not assert bindings vs unused `RunStepHooks`.

### Missing tests

- Construct with `archiveBindings` and a sentinel `runStepHooks` that throws if `execute` is called from the use case (only checks should call it).
- Assert class has no `runStepHooks` instance field.

### Spec dependency chain

Heavy (storage, hooks, overlap, lock, …). **Conflict:** leftover Ports constructor vs new bindings requirement. **Aligns** with `core:hook-execution-model` archive slot/collect.

### Summary counts (`core:archive-change`)

- Focus requirements: implemented
- Partial: constructor still takes `RunStepHooks`; spec Ports/factory stale
- Spec-internal contradictions: 1 major (Ports vs bindings)
- Test gaps: unused-field / bindings-only launch of RunStepHooks

---

## Spec: `core:hook-execution-model`

### Requirements (relevant)

| Requirement                                         | Status                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two hook types / instruction passive                | **implemented** (RunStepHooks skips instruction; not re-traced here)                                                                                                                                                                                                                       |
| Default hook execution for transitions and archives | **implemented** — Transition: `before-persist` only; Archive: before-persist then after-persist; `onFailure` from binding; no `check.id` launch of `RunStepHooks` in use cases                                                                                                             |
| Two execution modes                                 | **implemented** — `hookFailureMode`: collect → fail-soft, else fail-fast. Transition post is abort. Archive post collect                                                                                                                                                                   |
| Change entity does not execute hooks                | **implemented** (application checks)                                                                                                                                                                                                                                                       |
| Manual skipHookPhases                               | **implemented** in `HookEffectCheck` (`all`, `target.pre`/`source.post`, archive `pre`/`post`). Selectors `source.pre` / `target.post` are accepted on TransitionChange input but are **no-ops** for default bindings (both effects share `before-persist`). Spec documents them as valid. |
| Pre-hook failure abort                              | **implemented**                                                                                                                                                                                                                                                                            |
| Post-hook failure follows `onFailure`               | **implemented**                                                                                                                                                                                                                                                                            |
| External hooks phase semantics                      | **spec leftover risk:** “post-phase failures are reported without rolling back” matches **archive collect**, not **transition hook.post abort**. Transition is specified correctly in “Default hook execution”. External-hooks subsection is coarser.                                      |

### Discrepancies

- External-hooks “post-phase reported without rollback” vs transition `hook.post` `abort`/`before-persist`: **spec-internal** if read as applying to all hosts. Code applies binding `onFailure` per use case.

### Tests

- `workflow-check-factories.spec.ts`: `createHookPre` uses constructor `RunStepHooks`; protocol edge without snapshot bag.
- Transition/archive use-case hook tests as above.

### Summary counts

- Implemented for this change’s model: yes
- Spec-internal: external post-phase wording vs transition abort

---

## Spec: `core:approve-spec`

### Purpose / requirements

Consent in `ready` without entering `pending-spec-approval` or `spec-approved`. Drain: `pending-spec-approval` → `spec-approved`.

| Requirement                             | Status          |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate guard (disabled → no I/O)          | **implemented** | `ApprovalGateDisabledError` before `get`                                                                                                                                 |
| Change lookup / schema mismatch         | **implemented** |
| Artifact hash computation               | **implemented** | Skip missing/skipped; skip null artifact; cleanup map. **Nuance:** spec “obtain schema once”; `execute` calls `get()` then `_computeArtifactHashes` calls `get()` again. |
| Approval recording and state transition | **implemented** | `recordSpecApproval`; `transition('spec-approved')` **only** if `pending-spec-approval`. Bound `from` from `boundFromStates('approval.spec')` (currently `ready`).       |
| Persistence                             | **implemented** | Hashes computed **inside** `mutate` (stricter than “hash then mutate”; still serialized).                                                                                |
| Input / baked gates / factory           | **implemented** |

**Indexed canonical spec purpose** (graph search on `specs/`, not merged preview) still describes transitioning to `spec-approved` as the happy path. **Merged preview is the SoT for this change** and matches code. After archive, workspace spec must pick up the delta or graph will keep advertising the old purpose.

### Tests

- `approve-spec.spec.ts`: `records consent and stays in ready`; drain to `spec-approved`; mutate; gate disabled.

### Summary counts

- Implemented: all functional requirements
- Partial: double `SchemaProvider.get()` vs “once”
- Spec vs published index: old purpose until archive

---

## Spec: `core:approve-signoff`

Symmetric to ApproveSpec for `done` / `pending-signoff` / `signed-off`.

| Requirement                            | Status                                       |
| -------------------------------------- | -------------------------------------------- |
| Stay in `done` on happy path           | **implemented**                              |
| Drain `pending-signoff` → `signed-off` | **implemented**                              |
| Gate / hashes / mutate                 | **implemented** (same double `get()` nuance) |

### Tests

- `approve-signoff.spec.ts`: `records consent and stays in done`

### Summary counts

- Implemented: yes
- Same hash/schema-once nuance as ApproveSpec

---

## Spec: `core:validate-artifacts`

### Focus requirement: DAG lifecycle from engine `projectArtifacts` / empty `checksByTarget`

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Does not call `executeChecksByLegalTargets`. No snapshot bag. Other validation pipeline (requires, order, deltas, hashes, save) is pre-existing; not re-audited exhaustively in this batch except that hop predicates are not this use case.

### Tests

- `validate-artifacts.spec.ts`: `evaluates lifecycle with empty checksByTarget`

### Summary (focus)

- Implemented
- Other requirements: treated as out-of-scope except empty-DAG constraint — no contradiction found in the evaluate call site

---

## Spec: `core:get-artifact-instruction`

### Focus: empty `checksByTarget`; not GetStatus hop path

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

`nextArtifact` / effective status from DAG evaluate only. No `availableTransitions` evaluation. No snapshot bag.

Default ctor `lifecycle = new LifecycleEngine(Logger.debug.bind(Logger))` is a convenience; composition should still inject. Mild conventions/architecture note (constructing a domain service default), likely pre-existing.

### Tests

- `get-artifact-instruction.spec.ts`: spy `checksByTarget: {}`

### Summary (focus)

- Implemented

---

## Spec: `core:config` (Approvals delta only)

### Delta content

`approvals.spec` / `approvals.signoff` are in-place checks. Stay in `ready` / `done`. New work MUST NOT enter pending hops via `change transition`. Redesign `ready → designing` MUST NOT require spec gate. Spec gate covers any **forward** leave of `ready` (`from=ready`, `to=*`, `along=forward`), including `ready → verifying` when implementing is omitted.

### Code / binding alignment

```57:60:packages/core/src/domain/services/check-bindings.ts
    id: 'approval.spec',
    applicability: [{ scope: 'transition', from: 'ready', to: '*', along: 'forward' }],
```

`approval.signoff`: `from: 'done', to: 'archivable', along: 'forward'` — matches “cannot transition to archivable until signoff”.

### Verify

- Defaults false; enable flags; “Spec gate on does not require pending-spec-approval in the graph”

### Consistency

Matches TransitionChange / ApproveSpec / change-state (`ready → pending-spec-approval` invalid).

### Summary

- Delta **implemented** in bindings + use cases
- Config loader defaults not re-opened; existing Approvals verify scenarios remain the contract

---

## Globals

### `default:_global/architecture`

- **Match:** Domain `LifecycleEngine` / predicate **runners** stay I/O-free; application `create*` checks and use cases perform I/O. GetStatus/TransitionChange/ArchiveChange do not put hook running on the entity.
- **Smell:** `ArchiveChange.defaultArchiveBindings` composes `createWorkflowCheckRegistry` inside the use-case module (composition belongs in `packages/core/src/composition/`). Fallback `process.cwd()` default for `projectRoot` is infra-ish.
- **Match:** YAML/config not parsed in these use cases.

### `default:_global/conventions`

- Use cases: kebab-case files, named exports, tests under `packages/core/test/...` mirroring src, explicit return types on public execute methods.
- `exactOptionalPropertyTypes`: optional `onCheckProgress` / `skipHookPhases` spread with conditionals — compliant pattern.
- ApproveSpec/Signoff `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')` uses `noUncheckedIndexedAccess`-safe fallback.

### `default:_global/testing`

- Vitest; `test/` mirrors `src/`; many `given…, when…, then…` / `it('given…')` names.
- **No snapshots** in these tests; domain test explicitly forbids snapshot-bag **exports**.
- Gap: few tests named after “empty checksByTarget” / “no snapshot bag” on GetStatus itself (Validate/Instruction have spies).

---

## Cross-spec consistency (change artifacts)

| Topic                              | Specs                                                                             | Code                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| Stay in ready/done                 | transition-change, approve-\*, config Approvals                                   | Aligned                                            |
| Pending hops drain-only            | transition-change, approve-\*                                                     | Aligned; `VALID_TRANSITIONS` forbids ready→pending |
| No snapshot bag                    | get-status, validate-artifacts, get-artifact-instruction, transition-checks (dep) | Aligned                                            |
| GetStatus check-then-project       | get-status                                                                        | Aligned                                            |
| Archive after-persist collect      | archive-change, hook-execution-model, check-bindings                              | Aligned                                            |
| RunStepHooks not use-case launcher | transition-change (strict), archive-change (new req vs old Ports)                 | Transition strict; Archive leftover ctor param     |
| Empty checksByTarget DAG           | validate-artifacts, get-artifact-instruction, get-status drafts                   | Aligned                                            |
| Hook progress events               | transition-change lists first-class hook-start; transition-checks generic bus     | Code = generic bus                                 |

**Graph search caveat:** `specd graph search --specs` still scores **archived/workspace** `core:approve-spec` purpose as “transitions to spec-approved”. That is **index of `specs/`**, not `spec-preview`. Do not treat it as this change’s merged contract.

---

## Totals (this batch)

| Spec                          |             Req reviewed (approx.) | Implemented |      Partial | Missing impl |      Spec-internal issues |
| ----------------------------- | ---------------------------------: | ----------: | -----------: | -----------: | ------------------------: |
| core:transition-change        |                                 22 |          21 |            1 |            0 |       1 (Purpose routing) |
| core:get-status               |                                 18 |          16 |            1 |            0 |                         0 |
| core:archive-change           |                          20+ focus |   focus yes | ctor/factory |            0 |     1 (Ports vs bindings) |
| core:hook-execution-model     |                           12 focus |          12 |            0 |            0 | 1 (external post wording) |
| core:approve-spec             |                                  8 |           8 |  schema-once |            0 |  indexed purpose vs delta |
| core:approve-signoff          |                                  8 |           8 |  schema-once |            0 |                      same |
| core:validate-artifacts       | 1 focus (+ rest not fully counted) |           1 |            0 |            0 |                         0 |
| core:get-artifact-instruction |                            1 focus |           1 |            0 |            0 |                         0 |
| core:config Approvals         |                          1 section |           1 |            0 |            0 |                         0 |

**Neither spec nor code is automatically SoT.** Highest-value reviewer choices:

1. Treat **merged preview** Approvals / stay-in-state as correct; finish archive so graph purpose text for ApproveSpec matches.
2. **ArchiveChange:** pick one constructor story — drop unused `RunStepHooks` param when bindings required, **or** keep factory list and relax “createHook\* only”. Move `defaultArchiveBindings` to composition.
3. **Transition progress:** update `core:transition-change` Progress callback to the check bus, **or** re-emit legacy `hook-start`/`hook-done` with `phase`.

---

## Files / tests referenced

- `packages/core/src/application/use-cases/transition-change.ts`
- `packages/core/src/application/use-cases/get-status.ts`
- `packages/core/src/application/use-cases/archive-change.ts`
- `packages/core/src/application/use-cases/approve-spec.ts`
- `packages/core/src/application/use-cases/approve-signoff.ts`
- `packages/core/src/application/use-cases/validate-artifacts.ts`
- `packages/core/src/application/use-cases/get-artifact-instruction.ts`
- `packages/core/src/application/checks/hook-effect.ts`
- `packages/core/src/application/services/execute-matching-predicates.ts`
- `packages/core/src/application/services/execute-hook-effect.ts`
- `packages/core/src/domain/services/check-bindings.ts`
- `packages/core/src/composition/use-cases/transition-change.ts`
- `packages/core/src/composition/use-cases/archive-change.ts`
- Tests: `transition-change.spec.ts`, `get-status.spec.ts`, `archive-change.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, `validate-artifacts.spec.ts`, `get-artifact-instruction.spec.ts`, `transition-checks.spec.ts`, `matching-effects.spec.ts`, `workflow-check-factories.spec.ts`

---

# Partial: cli-skills

# Spec compliance audit — CLI + skills (batch)

- **Change:** `workflow-transition-checks`
- **Mode:** change spec-preview (deltas applied)
- **Read-only:** no code or spec files modified
- **Graph:** `stale: false`, `contentFresh: true`, indexed `2026-08-27T08:44:02.754Z` / `2948f1a2`
- **CLI:** `node packages/cli/dist/index.js`
- **Specs in this batch:**
  - `cli:change-status`
  - `cli:change-transition`
  - `cli:change-approve`
  - `cli:change-archive`
  - `skills:skill-templates-source`
- **Focus:** presenters; no pending hops in templates; archive `--skip-hooks pre`; verify drain; implement verify gate; specd router-only
- **Project-wide constraints consulted:** `default:_global/architecture` (CLI delegates to core/SDK), `default:_global/testing`, `default:_global/conventions`

---

## Method

- Spec content via `changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md).
- Navigation via `specd graph search` / `specd graph impact` (`createCheckProgressPresenter`, `CheckProgressStreamName`, CLI command files). Direct reads used after graph located the files.
- Implementation files:
  - `packages/cli/src/commands/change/status.ts`
  - `packages/cli/src/commands/change/transition.ts`
  - `packages/cli/src/commands/change/archive.ts`
  - `packages/cli/src/commands/change/approve.ts`
  - `packages/cli/src/commands/change/_check-progress-presenter.ts`
  - `packages/cli/src/commands/change/_hook-progress-presenter.ts` (run-hooks only)
  - `packages/cli/src/handle-error.ts`
  - `packages/skills/templates/skills/{specd,specd-verify,specd-implement,specd-archive,specd-design,specd-new}/SKILL.md.tpl`
  - `packages/skills/templates/shared/shared.md.tpl`
- Tests: `packages/cli/test/commands/change-*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

---

## Focus findings (executive)

| Focus                        | Verdict                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presenters                   | **Compliant**                                 | Transition and archive share `createCheckProgressPresenter`. Text: `<label> (<id>)` then `✓`/`✗` with no `Executing:` prefix. JSON/TOON: `stream: "change-transition"` / `"change-archive"`. `run-hooks` keeps `_hook-progress-presenter` with `stream: "hook-progress"`. Status text uses GetStatus `availableTransitions`, gerund blocker labels, omits `review:` header, prints `overlap:` only for spec-overlap peers. |
| No pending hops in templates | **Compliant** (with one related drift, below) | Verify/design/archive/entry do not teach `change transition` into `pending-*`. Shared copy is stay-in-`ready`/`done`. New-skill table marks pending rows as drain-only.                                                                                                                                                                                                                                                    |
| Archive `--skip-hooks pre`   | **Compliant**                                 | Archive skill examples use `--skip-hooks pre` only; forbids `--skip-hooks all` on archive; does not call `run-hooks … --phase post` after persist; still fetches post `hook-instruction`. CLI maps `pre`/`post`/`all` to `ArchiveChangeInput.skipHookPhases`.                                                                                                                                                              |
| Verify drain                 | **Compliant**                                 | Verify skill stays in-skill on `IMPLEMENTATION_STATE` / open files, points at `shared.md`, does not bounce to `/specd-implement` for that blocker alone.                                                                                                                                                                                                                                                                   |
| Implement verify gate        | **Compliant**                                 | Implement requires `implementation list` with zero `open` files before recommending `/specd-verify`; does not hop `implementing` when spec gate blocks.                                                                                                                                                                                                                                                                    |
| specd router-only            | **Compliant**                                 | Entry skill: does not execute lifecycle phases; no signoff / `approve signoff` / `pending-signoff`.                                                                                                                                                                                                                                                                                                                        |

**Related drift (not a failed focus scenario):** text status no longer prints `review: required: yes`, but several skills still branch on that exact string. See discrepancy D1.

---

## `cli:change-status`

### Requirements summary

| Requirement                                          | Intent                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Command signature                                    | `change status <name> [--format text\|json\|toon]`                             |
| Drafted change status is read-only                   | Render `draftView`; no mutating transitions; indicate drafted                  |
| Output format                                        | JSON/TOON `artifactDag` includes `hasTasks`; DAG `state` is display projection |
| Task completion display in DAG                       | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                               |
| Display-state rendering                              | Text prefers display status; JSON has canonical + display                      |
| **Lifecycle projections come from GetStatus checks** | MUST NOT locally re-filter protocol graph / `VALID_TRANSITIONS`                |
| **Text status omits duplicated review file lists**   | No `review:` header/files in text; overlap peers still print                   |
| **Text blockers include check labels**               | `! <CODE> — <label>: <message>`                                                |
| Schema version warning                               | Compare recorded vs `lifecycle.schemaInfo`; skip if null                       |
| Change not found                                     | exit 1 + `error:`                                                              |
| Schema-derived fields                                | DAG from `schema.artifactDag()`, children from `childrenOf`                    |
| Delegates refresh policy to GetStatus                | No direct RefreshImplementationTracking / ImplementationDetector               |
| Implementation section                               | `--implementation` uses SDK projection                                         |
| Task completion in details                           | `tasks: N/M`                                                                   |
| Basic info section                                   | name + state; no standalone `specs:` list                                      |
| Specs and dependencies                               | `specDependsOn` in text and JSON                                               |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/status.ts`.

- Calls `kernel.changes.status.execute({ name })` only (default refresh). No `RefreshImplementationTracking` / `ImplementationDetector` in this file.
- Text `lifecycle.transitions` is `lifecycle.availableTransitions.join` — no second `VALID_TRANSITIONS` union (`packages/cli/src/commands/change/status.ts` ~256–257).
- Blockers: `! ${code} — ${label}: ${message}` when `label` present (~237–241); JSON includes `label`/`checkId` (~386–391).
- Review: text prints `overlap:` for `spec-overlap-conflict` only (~317–328); no `review:` header. JSON still serializes full `review` (~437–449).
- Draft path: `(drafted)` in text; `isDrafted: true` in JSON (~141–177).
- DAG: `getActiveSchema` + `schema.artifactDag()` when available; displayStatus for node state; task suffix in details.

Architecture: CLI is an adapter that serializes GetStatus; lifecycle is not recomputed locally. Matches `default:_global/architecture`.

### Discrepancies

None for this spec’s own requirements vs CLI code.

**Cross-surface (templates):** D1 — skills still look for `review: required: yes` in **text** status. After this spec, that string is intentionally absent. JSON/TOON still have `review.required`. Templates that already use `--format text` can miss review routing unless they use **blockers** (`REVIEW_REQUIRED`) or structured status.

Interpretation:

- **Spec correct / templates stale:** `cli:change-status` forbids reprinting review in text; templates were not updated to use blockers / JSON.
- **Templates correct / spec over-strict:** agents need a visible `review:` block in text.
- Evidence favors the first: verify.md explicitly tests “does not include a `review:` header”; CLI tests assert `not.toContain('review:')`.

### Test coverage

Covered:

- Available transitions passthrough, no protocol-edge union — `packages/cli/test/commands/change/change-status.spec.ts`
- Gerund blocker labels in text + JSON `blockers[].label` — same file
- No `review:` header; `overlap:` for spec-overlap — `change-status.spec.ts` / `change/change-status.spec.ts`
- Drafted read-only / `isDrafted` — `packages/cli/test/commands/change-status.spec.ts`

### Missing tests

- No dedicated assertion that `status.execute` is **not** passed `refreshImplementationTracking: false` (default-on is implied by omitting the flag). Low risk.
- Implementation `--implementation` SDK projection is out of this change’s focus; not re-audited in depth.

### Spec dependency chain

- `cli:entrypoint` — formats, exit codes (used via `handleError` / `output`)
- `core:get-status` / `core:transition-checks` — CLI projects checks; does not re-evaluate
- `sdk:build-implementation-review` — `--implementation` path
- **No contradiction** with those deps: “do not re-filter transitions” aligns with check-derived `availableTransitions`.

### Summary counts (`cli:change-status`)

|                            |                         Count |
| -------------------------- | ----------------------------: |
| Requirements               |                            16 |
| Implemented                |                            16 |
| Partial                    |                             0 |
| Missing                    |                             0 |
| Spec-vs-code discrepancies | 0 (1 cross-template drift D1) |
| Covered by tests           |                            15 |
| Missing/weak tests         |           1 (refresh default) |

---

## `cli:change-transition`

### Requirements summary

| Requirement                           | Intent                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Command signature                     | `transition <name> <step>\| --next` + `--skip-hooks` phases `source.pre/post`, `target.pre/post`, `all` |
| Next-transition resolution            | Fixed forward map; `--next` forbidden from pending/archivable                                           |
| Delegates refresh to TransitionChange | Pre-status and repair GetStatus use `refreshImplementationTracking: false`                              |
| Approval-gate routing                 | Do not pass gate flags; do not rewrite `implementing`/`archivable` to pending                           |
| Hook execution                        | Map `--skip-hooks` → `skipHookPhases`                                                                   |
| Progress output                       | Generic check bus; no `stream: "hook-progress"`                                                         |
| Transition hook observability         | Surface hook progress while in flight                                                                   |
| Shared hook progress presentation     | Transition uses check presenter; run-hooks may keep hook-progress stream                                |
| Output on success                     | Text confirmation; JSON terminal `complete` on `change-transition`                                      |
| Post-hook failure warning             | Hook fail → exit 2, `error:`; no separate warning state                                                 |
| Invalid transition error              | Repair guide on stderr from GetStatus; HookFailedError no repair guide                                  |
| Incomplete tasks error                | exit 1 naming artifact (core); CLI surfaces GetStatus repair                                            |
| Check progress rendering              | Gerund labels; no `Executing:`                                                                          |
| Unsatisfied requires error            | exit 1                                                                                                  |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/transition.ts` + `_check-progress-presenter.ts`.

- `VALID_HOOK_PHASES` matches spec. `--skip-hooks` parsed into `skipHookPhases` Set on execute input. Execute payload is `{ name, to, skipHookPhases }` — **no approval flags**.
- `--next` map includes `signed-off → archivable`; pending-spec-approval / pending-signoff / archivable / archiving → `cliError` (~159–188).
- Pre-transition and repair `status.execute({ name, refreshImplementationTracking: false })` (~297–300, ~343–346).
- `makeProgressRenderer` uses `createCheckProgressPresenter({ streamName: 'change-transition' })`. Text progress on **stderr**; structured on **stdout**. Check events routed; no `hook-progress` stream.
- Repair guide: `! CODE — label: message` then `repair guide:` with `nextAction` from GetStatus (~88–102). Repair-guide errors: `InvalidStateTransitionError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`. `HookFailedError` is rethrown → `handleError` exit 2 (`packages/cli/src/handle-error.ts`).
- Help text: “Approval gates stay in ready/done; pending states drain in-flight work only.”

Presenter (`_check-progress-presenter.ts`):

- `check-start` → `<label> (<id>)`
- `check-done` fail → `✗ <label>: <reason>`; pass → `✓ <label>`
- Hook details: `command:`, ` |`/` !`, `still running (Ns)`
- Structured: `{ stream: streamName, event }` — stream limited to `'change-transition' | 'change-archive'`

### Discrepancies

**D2 (low, spec incomplete vs CLI extra events):** Progress renderer still handles legacy `requires-check`, `task-completion-failed`, `transitioned` event types. Spec’s public contract is the generic check bus. If core still emits those, CLI still renders them; if core only emits check events, the branches are dead. Not a user-facing violation of the new contract.

**D3 (informational):** Isolated unit tests live on the command specs, not `_check-progress-presenter.spec.ts` (unlike `_hook-progress-presenter.spec.ts`). Behaviour is covered; presenter file itself is untested in isolation.

No contradiction with `core:hook-execution-model` / `core:transition-checks`: skip-hooks mapping and gerund check bus match.

### Test coverage

Covered in `packages/cli/test/commands/change-transition.spec.ts` and `packages/cli/test/commands/change/change-transition.spec.ts`:

- Gerund predicate + hook progress; no `Executing:`
- JSON stream `change-transition`; no `hook-progress`
- Repair guide on stderr; HookFailedError exit 2 without repair guide
- `refreshImplementationTracking: false` on status calls
- `--next` / skip-hooks (existing command tests)

### Missing tests

- No test that `transition.execute` is called **without** `approvalsSpec` / `approvalsSignoff` keys (code review confirms; verify.md scenario “Transition execute omits approval flags” is only weakly asserted by “called with `{ name, to }` only” — actual call also has `skipHookPhases`). **Spec vs test wording:** extra `skipHookPhases` is required by another requirement; tests should allow that field.

### Spec dependency chain

- `cli:entrypoint`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`
- Repair guide `nextAction` from GetStatus — consistent with check-derived verify vs implement recommendation.

### Summary counts (`cli:change-transition`)

|                            |                                           Count |
| -------------------------- | ----------------------------------------------: |
| Requirements               |                                              14 |
| Implemented                |                                              14 |
| Partial                    |                                               0 |
| Missing                    |                                               0 |
| Spec-vs-code discrepancies |                        0 material (D2/D3 notes) |
| Covered by tests           |                                              13 |
| Missing/weak tests         | 1 (execute input exact-shape vs skipHookPhases) |

---

## `cli:change-approve`

### Requirements summary

| Requirement                    | Intent                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Command signatures             | `approve spec\|signoff <name> --reason`                                                  |
| Delegates gate state to kernel | Only `{ name, reason }`; `kernel.changes.approveSpec` / `approveSignoff`                 |
| Artifact hash computation      | CLI does not hash                                                                        |
| Approve spec behaviour         | Valid from `ready` or drain `pending-spec-approval`; stay in ready; help uses bound-from |
| Approve signoff behaviour      | Valid from `done` or drain `pending-signoff`; stay in done                               |
| Output on success              | `approved <gate> for <name>` / JSON `{ result, gate, name }`                             |
| Error cases                    | Missing `--reason` usage error; wrong state / missing change → exit 1                    |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- `requiredOption('--reason')`
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags
- Help: “Record spec-gate consent for a change in ready (pending-spec-approval remains valid for drain).” Analogous for signoff/`done`.
- Success text/JSON as specified

### Discrepancies

None vs this spec.

Help still **mentions** pending drain states. That is required for drain, not a “pending hop.” Skills (not this CLI spec) forbid teaching pending as happy-path.

### Test coverage

`packages/cli/test/commands/change-approve.spec.ts` and `packages/cli/test/commands/change/change-approve.spec.ts`:

- Execute `{ name, reason }`
- Ready/done stay-in-state; stdout does not print pending
- Drain from pending still invokes use case
- Missing reason / unknown sub-verb / not found (legacy file)

### Missing tests

- Verify.md: “`kernel.specs.approveSpec` is not invoked” — **no explicit `expect(kernel.specs.*).not.toHaveBeenCalled()`**. Implementation only calls `kernel.changes.*`. Coverage gap, not a code bug.

### Spec dependency chain

- `core:change`, `core:transition-checks` (approval.spec / approval.signoff bindings)
- Consistent: CLI does not rewrite to pending parking states.

### Summary counts (`cli:change-approve`)

|                            |                            Count |
| -------------------------- | -------------------------------: |
| Requirements               |                                7 |
| Implemented                |                                7 |
| Partial                    |                                0 |
| Missing                    |                                0 |
| Spec-vs-code discrepancies |                                0 |
| Covered by tests           |                                6 |
| Missing/weak tests         | 1 (`kernel.specs.*` not invoked) |

---

## `cli:change-archive`

### Requirements summary

| Requirement              | Intent                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Command signature        | Canonical `changes archive`; alias `change archive`; `--skip-hooks pre\|post\|all`; `--allow-overlap` |
| Prerequisites            | Must be `archivable`; else exit 1 naming state                                                        |
| Behaviour                | Delegate to `ArchiveChange`                                                                           |
| Hook execution           | Map skip-hooks to archive phase selector                                                              |
| Check progress rendering | Same gerund check presenter as transition                                                             |
| Post-archive hooks       | Failures → exit 2                                                                                     |
| Output on success        | Path line; invalidated section only when non-empty                                                    |
| JSON output on success   | Terminal `stream: "change-archive"` `complete`; no second unwrapped object                            |
| Error cases              | not found / not archivable / merge fail → 1                                                           |

### Implementation status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- Registered on `program.command('changes').alias('change')` in `packages/cli/src/index.ts` — canonical plural + singular alias.
- `VALID_ARCHIVE_HOOK_PHASES = pre | post | all` forwarded as `skipHookPhases`.
- Progress: `createCheckProgressPresenter({ streamName: 'change-archive' })`.
- `postHookFailures.length > 0` → `cliError(..., 2)`.
- Text: archive path; optional invalidated list. JSON: single terminal complete record after progress rows.
- `--allow-overlap` forwarded.

**Extra CLI surface (not in this spec’s signature):** `--allow-out-of-scope`. Templates and implementation-tracking archive flow use it. Pre-existing / adjacent feature.

### Discrepancies

**D4 (low, spec incomplete):** `cli:change-archive` command signature omits `--allow-out-of-scope` while CLI and `specd-archive` template document it. Options:

- Spec should list the flag (spec drift).
- Flag is out of this change’s scope and should stay undocumented in this spec.

Not a failure of skip-hooks / presenter requirements.

### Test coverage

`packages/cli/test/commands/change-archive.spec.ts`:

- `--skip-hooks all` / `pre,post` / default empty set
- Check progress gerund + hook output; no `Executing:`
- JSON `change-archive` stream then `complete`
- Post-hook failure exit 2
- Not-archivable / not found

### Missing tests

- Dedicated `--skip-hooks pre` **only** (not `pre,post`) — parser is the same path; skill tests cover the template contract, CLI tests cover comma-separated pre+post.
- Singular alias `change archive` vs `changes archive` — registration via parent alias; no dedicated parse test in the files sampled.

### Spec dependency chain

- `core:archive-change`, `core:hook-execution-model`, `core:transition-checks`, `cli:command-resource-naming`
- Archive skip `pre` vs transition skip `target.pre` — different selector vocabularies, correctly not mixed in CLI.

### Summary counts (`cli:change-archive`)

|                            |                               Count |
| -------------------------- | ----------------------------------: |
| Requirements               |                                   9 |
| Implemented                |                                   9 |
| Partial                    |                                   0 |
| Missing                    |                                   0 |
| Spec-vs-code discrepancies |               1 low (D4 extra flag) |
| Covered by tests           |                                   8 |
| Missing/weak tests         | 1 (`--skip-hooks pre` alone; alias) |

---

## `skills:skill-templates-source`

This spec is large (template layout, frontmatter, graph guidance, optimizer gating, command roles). **This batch focused on the change’s workflow-check UX deltas.** Other template requirements (optimizer agents, graph `--snippet`, frontmatter matrix) were not exhaustively re-audited; `template-workflow.spec.ts` still asserts several of them.

### Requirements in focus

#### In-place approval gates (no pending hops)

| Scenario                                                   | Template                       | Status                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify does not route to pending-signoff                   | `specd-verify/SKILL.md.tpl`    | **Pass.** Signoff: stay in `done`, `approve signoff`. No `pending-signoff`; no `change transition` into pending.                                                  |
| Implement does not hop implementing while spec gate blocks | `specd-implement/SKILL.md.tpl` | **Pass.** Stay in `ready`; do not `transition implementing`.                                                                                                      |
| Shared approvals stay-in-state                             | `shared.md.tpl`                | **Pass.** MUST NEVER run `changes approve`; stays in `ready` or `done`; pending MAY appear as drain only; no “reaches `pending-spec-approval`”.                   |
| Shared hook list no pending as happy-path                  | `shared.md.tpl`                | **Pass.** Delivery states listed; “Do **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates”; drain MAY still name those step ids. |
| New-skill table pending = drain only                       | `specd-new/SKILL.md.tpl`       | **Pass.** `pending-signoff` / `pending-spec-approval` rows are “Drain only”.                                                                                      |
| Design stays in ready for spec gate                        | `specd-design/SKILL.md.tpl`    | **Pass.** Stay in `ready`; `approve spec`; no `pending-spec-approval`.                                                                                            |
| specd entry does not teach signoff                         | `specd/SKILL.md.tpl`           | **Pass.** Router; “does NOT execute lifecycle phases”; no signoff / `approve signoff` / `pending-signoff`.                                                        |
| specd-archive mentions in-place gates                      | `specd-archive/SKILL.md.tpl`   | **Pass.** Requires `archivable`; signoff wait owned by `/specd-verify` in `done`; no `pending-signoff`.                                                           |

#### Implementation tracking in verify and implement

| Scenario                                         | Status                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared documents list/resolve/ignore             | **Pass.** `shared.md.tpl` + `template-workflow.spec.ts`                                                                                                  |
| Verify drains open files; no bounce to implement | **Pass.** `IMPLEMENTATION_STATE`; drain via shared; “Do **not** redirect to `/specd-implement` solely for open files”                                    |
| Implement zero-open gate before `/specd-verify`  | **Pass.** `implementation list`; “do **not** tell the user to run `/specd-verify` yet”; guardrail “Never recommend `/specd-verify` while … `open` files” |

#### Archive skill skips only pre hooks

| Scenario                                                                         | Status                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--skip-hooks pre` not `all`; no post `run-hooks`; still `hook-instruction` post | **Pass.** `specd-archive/SKILL.md.tpl` steps 5–6; tests in `template-workflow.spec.ts` |

### Implementation status (focus)

All focus scenarios are present in templates and locked by `packages/skills/test/template-workflow.spec.ts` (`does not teach pending parking…`, `verify drains…`, `archive skips only pre hooks`).

Shared vs archive hook policy is **intentionally split:** shared still says every **transition** uses `--skip-hooks all` with manual run-hooks; archive is the exception (`--skip-hooks pre` so post `run:` cannot be forgotten). Matches `cli:change-archive` + hook-execution-model.

### Discrepancies

**D1 (medium, template vs `cli:change-status`):** These templates still key off text `review: required: yes`:

- `packages/skills/templates/skills/specd/SKILL.md.tpl` (~80)
- `specd-verify/SKILL.md.tpl` (~33)
- `specd-implement/SKILL.md.tpl` (~30, ~317)
- `specd-archive/SKILL.md.tpl` (~30)

`cli:change-status` text MUST NOT print a `review:` header. `specd-new` uses structured `review.required` (better). Blockers section may still show `REVIEW_REQUIRED`, so routing is not fully dead — the exact-string branch is.

Interpretations:

- **Templates should switch to blockers / JSON `review.required`** (implementation follow-up; `skills:skill-templates-source` in-place-gate scenarios do not mention this string).
- **CLI text should keep a compact review signal** (would violate current `cli:change-status` verify scenarios).

Recommend treating as **template staleness**, not a failed in-place-approval scenario.

**D5 (low, test vs spec wording):** `template-workflow.spec.ts` asserts `expect(entry).not.toMatch(/approve spec/)` on the **entry** skill. Spec says entry must not mention **signoff** / `approve signoff` / `pending-signoff`. Forbidding `approve spec` is stricter than the spec (and currently holds). Fine if intentional.

### Test coverage

`packages/skills/test/template-workflow.spec.ts` uses **exact command/field strings** (satisfies “keyword-only assertions are insufficient” for these contracts).

Covered: pending hops, drain/gate copy, archive `--skip-hooks pre`, verify drain, implement verify gate, router-only, shared approve-never, optimizer/metadata roles (adjacent).

### Missing tests

- No test that workflow skills do **not** match `review: required: yes` against text status, or that they use `REVIEW_REQUIRED` blockers instead (would lock D1).
- No test that `specd-new` pending rows contain “Drain only” (present in template; test only checks “Drain only:” somewhere in file). Weak but the string is unique enough.

### Spec dependency chain

- `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`
- In-place gates align with `cli:change-approve` / `cli:change-transition` (stay in ready/done).
- D1 is a **consistency gap with `cli:change-status`**, not with `core:transition-checks`.

### Summary counts (`skills:skill-templates-source`, **focus subset**)

Focus scenarios audited: 11 (8 in-place + 3 tracking/archive-hooks). All 11 implemented.

|                                         |                Count |
| --------------------------------------- | -------------------: |
| Focus scenarios                         |                   11 |
| Implemented                             |                   11 |
| Partial                                 |                    0 |
| Missing                                 |                    0 |
| Spec-vs-template discrepancies in focus |                    0 |
| Cross-spec drifts                       | 1 (D1 review marker) |
| Covered by tests                        |                   11 |
| Extra test gaps                         |          1 (D1 lock) |

Full spec (frontmatter, graph terminology, optimizer agents, etc.): **not fully re-audited in this batch.** Existing `template-workflow.spec.ts` still covers optimizer gating and command-role copy.

---

## Global / dependency consistency

| Pair                                                                    | Result                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| CLI specs vs `default:_global/architecture`                             | CLI commands delegate to SDK kernel use cases; no local lifecycle engine. **OK** |
| CLI presenters vs `core:transition-checks`                              | Gerund labels + check bus. **OK**                                                |
| Skills in-place gates vs `cli:change-approve` / `cli:change-transition` | Stay-in-state; drain-only pending. **OK**                                        |
| Skills archive hooks vs `cli:change-archive`                            | `--skip-hooks pre` matches CLI archive phases. **OK**                            |
| Skills review text vs `cli:change-status`                               | **D1** — templates still expect a text `review:` line the CLI spec removed       |

No finding that the **change’s spec deltas contradict** global spec-layout or testing conventions. Missing isolated presenter tests are a coverage preference, not a spec-layout violation.

---

## Discrepancy register

| ID  | Severity   | Spec(s)                                                            | Kind                        | Summary                                                                                                                     |
| --- | ---------- | ------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | **medium** | `cli:change-status` vs `skills:skill-templates-source` (templates) | Cross-spec / template stale | Text status omits `review:`; skills still branch on `review: required: yes`. Prefer updating templates to blockers or JSON. |
| D2  | low        | `cli:change-transition`                                            | Extra renderer branches     | Legacy `requires-check` / `task-completion-failed` / `transitioned` still handled.                                          |
| D3  | low        | `cli:change-transition` / `cli:change-archive`                     | Test shape                  | No isolated `_check-progress-presenter.spec.ts`.                                                                            |
| D4  | low        | `cli:change-archive`                                               | Spec incomplete             | `--allow-out-of-scope` in CLI + archive skill, not in spec signature.                                                       |
| D5  | info       | `skills:skill-templates-source`                                    | Test stricter than spec     | Entry skill test also forbids `approve spec`.                                                                               |

No **high/critical** implementation bugs found in the focus area. Presenters, skip-hooks mapping, stay-in-state approvals, verify drain, implement verify gate, and specd router-only **match the change specs**.

---

## Totals (this batch)

| Metric                          |      Count |
| ------------------------------- | ---------: |
| Specs audited                   |          5 |
| Focus scenarios (skills)        | 11/11 pass |
| Material CLI requirement misses |          0 |
| Medium discrepancies            |     1 (D1) |
| Low/info notes                  |  4 (D2–D5) |

---

## Sources (graph / files)

- `cli:src/commands/change/_check-progress-presenter.ts` — `createCheckProgressPresenter`, `CheckProgressStreamName`
- Dependents: `cli:src/commands/change/transition.ts`, `cli:src/commands/change/archive.ts`
- `cli:src/commands/change/_hook-progress-presenter.ts` — `run-hooks` only (`stream: "hook-progress"`)
- Tests: `cli:test/commands/change-transition.spec.ts`, `change-archive.spec.ts`, `change-status.spec.ts`, `change/change-status.spec.ts`, `change/change-transition.spec.ts`, `change/change-approve.spec.ts`, `skills:test/template-workflow.spec.ts`
