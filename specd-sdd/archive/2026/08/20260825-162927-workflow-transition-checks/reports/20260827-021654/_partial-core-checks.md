# Partial audit: core checks / lifecycle (change `workflow-transition-checks`)

Mode: change audit (read-only). Specs via `changes spec-preview`. Graph: current (`stale: false`). CLI: `node packages/cli/dist/index.js`.

Locked product (not re-litigated): self-sufficient `check.execute`; `AXIS_FALLBACK` spliced by canonical index (not tail-append); `workflow[]` is lookup not protocol; `availableSteps` = extras-bearing rows only; no pending parking hops.

Focus: `buildAxis` splice; `classifyAlong` omit-`implementing` retry = `backward`; `availableSteps` vs `validTransitions`; `TransitionChange` not defaulting `TRANSITION_BINDINGS`; schema miss throws.

---

## core:transition-checks

### Requirements Summary

Shared evaluation of one transition attempt (and archive as an operation): checks with stable `id` + gerund `label`, `kind` predicate|effect, self-sufficient `execute(ctx)`, bindings carrying `from`/`to`/`along` (or `archive`) plus effect `phase`/`onFailure`. Progress axis from known `workflow[]` names with missing delivery states **spliced** at `AXIS_FALLBACK` index. Classify `along` (`forward`/`backward`/`redesign`/`recovery`/`any`). Projections: `validTransitions` = protocol; `availableTransitions` = allowed predicates; no snapshot bag; no hop to `pending-*`.

### Implementation Status

| Area                                    | Status      | Evidence                                                                                                                                                       |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check ABI / `WorkflowCheck`             | Implemented | `packages/core/src/application/checks/workflow-check.ts`; factories in `create*`                                                                               |
| Self-sufficient `execute`               | Implemented | `CheckExecutionContext` has host fields only (`transition-checks.ts` ~336–355); I/O on constructors                                                            |
| `buildAxis` splice                      | Implemented | `transition-checks.ts` 106–156: omitted `AXIS_FALLBACK` inserted at first listed fallback with `listedIndex >= fallbackIndex`                                  |
| `classifyAlong` omit-implementing retry | Implemented | Same file 166–203; recovery/redesign first; unknown strings filtered (`step in VALID_TRANSITIONS`)                                                             |
| Bindings table                          | Implemented | `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`; `applyBindingSpecs`                                                               |
| Production bindings                     | Implemented | `createWorkflowCheckRegistry` composes `create*` onto specs; **not** domain `TRANSITION_BINDINGS`                                                              |
| `TransitionChange` constructor          | Implemented | Required 7th arg `transitionBindings`; no default (`transition-change.ts` 129–145). Composition: `resolveTransitionChangeDeps` → `registry.transitionBindings` |
| Schema miss (provider)                  | Implemented | `SchemaProvider.get()` throws `SchemaNotFoundError`; test `transition-change.spec.ts` “throws SchemaNotFoundError instead of skipping checks”                  |
| Protocol fail-fast                      | Implemented | `protocol.edge` first in specs; `executeMatchingPredicates(..., { failFast: true })` in `TransitionChange`                                                     |
| No pending rewrite                      | Implemented | Requested `to` is persist target; `_resolveTarget` is identity in engine                                                                                       |
| No `PredicateSnapshots`                 | Implemented | Test asserts exports absent                                                                                                                                    |

### Discrepancies (spec vs code)

**1. Domain stub `execute` still exists beside production `create*` (nit / spec-drift vs leftover)**

- **Spec:** Domain MAY export `run(facts)` + stub `Check`; stubs MUST NOT be the production `execute` path.
- **Code:** Production use cases wire `createWorkflowCheckRegistry`. Domain objects (e.g. `protocolEdge`, `workflowRequires`, `hookPre` which always `skip`) remain on `TRANSITION_BINDINGS` for matcher tests. `TRANSITION_BINDINGS` is **not** on `@specd/core` `public.ts`.
- **Interpretation A (spec right):** Any host importing `domain/index` `TRANSITION_BINDINGS` would skip hooks / skip I/O checks. **Interpretation B (code right):** Fixtures are explicitly documented as test/matcher materialization; production path is the factory.
- **Severity:** nit (production path complies).

**2. `applyBindingSpecs` throws generic `Error` (minor vs architecture)**

- **Spec / architecture:** Domain invalid operations throw `SpecdError` subclasses.
- **Code:** `throw new Error(\`No check instance for binding '${spec.id}'\`)` (`transition-checks.ts` 447–448).
- **Interpretation A:** Missing registry wiring should be a typed composition error. **Interpretation B:** This is an invariant of factory completeness, not a domain transition.
- **Severity:** minor.

**3. Dead `executeHookEffect` / `shouldExecuteHookEffect` (minor)**

- **Spec:** Skip/timing MUST NOT key off `check.id === 'hook.pre'|'hook.post'` in the use-case loop; skip uses binding `phase` **plus** pre/post selectors because both transition effects are `before-persist`.
- **Code:** Live path is `HookEffectCheck.execute` (`hook-effect.ts` 133–149): `all` / `target.pre` / `source.post` / archive `pre`/`post` — not `binding.phase` alone. `TransitionChange` iterates `matchingEffects(..., 'before-persist')` then `check.execute`.
- Dead helpers in `execute-hook-effect.ts` still map `checkId` → `RunStepHooks` phase and map `skipPre` to **entire** `before-persist` (would skip both pre and post). **No remaining callers** under `packages/`.
- **Interpretation A:** Dead helpers contradict the spec if treated as the model. **Interpretation B:** Dead code; live path complies.
- **Severity:** minor (cleanup), not a runtime bug.

### Test Coverage

- `packages/core/test/domain/services/transition-checks.spec.ts`: `ready→verifying` forward when `implementing` omitted; `verifying→implementing` **backward** when omitted; `ready` omitted still `ready→implementing` forward; unknown `reviewing` does not invert `ready→implementing`; impl bindings vs redesign; approval.spec vs `ready→designing`; no `PredicateSnapshots`.
- `transition-change.spec.ts`: constructor always passed `registry.transitionBindings`; schema `null` → `SchemaNotFoundError`; skip-hooks still fails tasks; skip `target.pre` vs `source.post` independently; no persist on pending.

### Missing Tests

- Direct unit test of `buildAxis` insertion index vs a crafted list that would **fail** under tail-append (e.g. `['verifying','implementing']` omitted middle) — currently covered only via `classifyAlong` outcomes.
- Constructor-level test that omitting `transitionBindings` is a type/runtime error (TypeScript already requires the arg).
- No test that `TRANSITION_BINDINGS` is unused by `createTransitionChange`.

### Spec Dependency Chain (depth 1)

- `core:change` — `VALID_TRANSITIONS`, approvals stay in `ready`/`done`. **Consistent.**
- `core:workflow-model` — lookup `workflow[]`, axis splice. **Consistent** with splice; **tension** on unknown step rejection site (see workflow-model).
- `core:schema-format` — YAML workflow shape. **Consistent** (axis language aligned).
- `default:_global/architecture` — domain purity vs application I/O. **Mostly consistent**; generic `Error` on missing check instance.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 2     |
| nit      | 1     |

---

## core:lifecycle-engine

### Requirements Summary

Sole authority for lifecycle interpretation: project from caller-supplied predicate `CheckResult`s (no I/O, no snapshot bag, no `check.run` fallback). `validTransitions` = `VALID_TRANSITIONS[state]`. `availableTransitions` = protocol targets whose injected predicates did not fail. `availableSteps` = extras-bearing `schema.workflow()` rows in declaration order (not protocol membership). `_resolveTarget` MUST NOT rewrite to pending. `isReady` from `workflow.requires` results when present — MUST NOT re-walk `requires` to emit a **different** blocker code (`INCOMPLETE_ARTIFACT` vs `MISSING_ARTIFACT`) for the same artifact. Next-action matrix; archiving recovery; `CompileContext` not an evaluate consumer.

### Implementation Status

| Area                         | Status      | Evidence                                                                                                                                |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Predicate-only evaluate      | Implemented | `evaluate` uses `options.checksByTarget`; no file I/O                                                                                   |
| `validTransitions`           | Implemented | `VALID_TRANSITIONS[change.state]` (`lifecycle-engine.ts` 131)                                                                           |
| `availableTransitions`       | Implemented | Only targets with **injected** checks and no `fail` (145–154). Omitted injections are **absent** from available, not treated as allowed |
| `availableSteps` extras-only | Implemented | `schema.workflow().map(...)` (156–194). Omitted `implementing` row cannot appear. `step` stored as schema string                        |
| `_resolveTarget`             | Implemented | Identity (309–311)                                                                                                                      |
| `isReady` from checks        | Partial     | When `evaluationChecks` present: `requiresFailed` from `workflow.requires` fail. Else DAG `blockingArtifacts`                           |
| Consumers                    | Implemented | `GetStatus` / `TransitionChange` inject checks; `ValidateArtifacts` empty `checksByTarget`; `CompileContext` does not call `evaluate`   |
| nextAction matrix            | Implemented | implementing→verify skill; ready approve spec; done backward hops not default nextAction (`lifecycle-engine.spec.ts`)                   |

### Discrepancies (spec vs code)

**1. `_requestedTargetBlockers` still re-walks `requires` (major)**

- **Spec:** When `workflow.requires` results are present, MUST NOT independently re-walk `requires` to emit a different blocker code than the check (`INCOMPLETE_ARTIFACT` vs `MISSING_ARTIFACT`).
- **Code:** `_requestedTargetBlockers` starts from `_blockersFromFailedChecks(requestedChecks)` then, unless `workflowStep === null` or archiving→archivable, **always** loops `workflowStep.requires` and `_artifactBlockers`, which maps `missing` → `MISSING_ARTIFACT` and `in-progress` → `INCOMPLETE_ARTIFACT` (537–605, 608–640).
- Domain `workflow.requires` `run()` always fails with **`INCOMPLETE_ARTIFACT`** even when status is `'missing'` (`workflow-requires.ts` 44–50).
- `evaluate(..., { requestedTarget })` therefore can attach **both** check-projected `INCOMPLETE_ARTIFACT` and DAG `MISSING_ARTIFACT` for the same hole. `TransitionChange` gates on `evaluation.allowed` / check id, not these blockers (blockers only logged). `GetStatus` typically omits `requestedTarget`, so status blockers come from `_mergeBlockers` of review + empty requested list + failed checks — **status path may not show the dual codes**.
- **Interpretation A (spec right):** Engine public `blockers` for a requested hop is a second algorithm; fix by projecting only from checks when `requestedChecks` is non-empty. **Interpretation B (code right / spec over-constrained):** Mandatory engine codes still list `MISSING_ARTIFACT` for absent artifacts; check code is a coarser `INCOMPLETE_ARTIFACT`. Dual codes are diagnostic richness.
- **Locked product:** Do not treat this as reopening snapshot-bag design. It is specifically **blocker-code dual-write**.
- **Severity:** major (spec vs engine contract when `requestedTarget` is set); execute path still uses the check.

**2. `availableSteps` not on `GetStatus` DTO (minor, consumer gap)**

- **Spec (engine):** MUST derive `AvailableStep` entries. **Spec (this batch) does not require GetStatus JSON to copy them.**
- **Code:** Verdict includes `availableSteps`. `GetStatusResult.lifecycle` exposes `validTransitions` / `availableTransitions` / `checksByTarget` only (`get-status.ts` 219–243). Comment still says available = “where workflow requires are satisfied” (stale vs full predicates).
- **Interpretation A:** Agents reading status never see extras-vs-protocol distinction except by comparing `workflow[]` vs `validTransitions`. **Interpretation B:** `availableTransitions` is the hop list; `availableSteps` is engine-internal extras display.
- **Severity:** minor (engine implements; status surface omits).

**3. `isPermitted` fallback still mentions pending gates (nit)**

- When `checksByTarget[step]` is missing (ValidateArtifacts empty map), `_isStepPermitted` still special-cases `pending-spec-approval` / `pending-signoff` against `approvals.*` (313–324). Drain states remain in `VALID_TRANSITIONS`. Not a parking hop for new work.
- **Severity:** nit.

### Test Coverage

- `lifecycle-engine.spec.ts`: approval does not rewrite `effectiveTarget`; incomplete tasks hide `verifying` from `availableTransitions` but keep it in `validTransitions`; nextAction implement vs verify; done lists backward hops without making them nextAction; archiving escapes.
- **No** assertion that `availableSteps` omits an extras-less `implementing` while `validTransitions` includes it (verify.md scenario “availableSteps is lookup rows not protocol membership”).

### Missing Tests

- GIVEN `workflow[]` omits `implementing`, WHEN `evaluate` with hop checks, THEN `validTransitions` includes `implementing` AND `availableSteps` has no `step: 'implementing'` extras row.
- GIVEN `requestedTarget` + missing required artifact, THEN `blockers` codes match the check (`INCOMPLETE_ARTIFACT`) and do not also add `MISSING_ARTIFACT`.
- Engine projects without I/O (scenario exists in verify.md; confirm in spec file vs tests).

### Spec Dependency Chain (depth 1)

- `core:change` — persisted facts. **Consistent** (no pending enter from ready/done).
- `core:workflow-model` — extras vs protocol. **Consistent** with `availableSteps` mapping `schema.workflow()`.
- `core:schema-format` — artifacts DAG. **Consistent** (`projectArtifacts`, topo `nextArtifact`).
- `core:transition-checks` — projections. **Tension** on MISSING vs INCOMPLETE (above).
- `default:_global/architecture` — `LifecycleEngine` is a domain **class** with state-less methods; architecture prefers plain functions for stateless domain services. Pre-existing pattern; not unique to this change. **nit** if scored.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 1     |
| minor    | 1     |
| nit      | 2     |

---

## core:workflow-model

### Requirements Summary

`workflow[]` looks up extras (`requires`, `requiresTaskCompletion`, hooks) onto existing `ChangeState`. Omitting a row MUST NOT delete protocol membership (`workflowStep` null). Unknown `step` MUST NOT occupy the progress axis. Verify scenario: hop **to** `reviewing` → `TransitionChange` throws `InvalidStateTransitionError`. Axis = declaration order + `AXIS_FALLBACK` splice via `buildAxis`. Availability from engine projections of check results. `CompileContext` MUST NOT evaluate hops. Task completion via `createWorkflowTaskCompletion` + `CountTasks`, not a second walk in the engine.

### Implementation Status

| Area                                | Status            | Evidence                                                                                               |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Lookup not protocol                 | Implemented       | `workflowStep` null when omitted; `VALID_TRANSITIONS` unchanged                                        |
| Axis / unknown names                | Implemented       | `buildAxis` filters `step in VALID_TRANSITIONS`; tests with `reviewing` in the list                    |
| Requires / taskCompletion as checks | Implemented       | Domain `run` + application factories; `TransitionChange` maps fail → `InvalidStateTransitionError`     |
| CompileContext                      | Implemented       | No `LifecycleEngine.evaluate`; test asserts no `availableSteps` on compile result                      |
| Unknown step at **schema load**     | Implemented extra | `buildSchema` throws `SchemaValidationError` if step ∉ `VALID_TRANSITIONS` (`build-schema.ts` 687–695) |

### Discrepancies (spec vs code)

**1. Unknown step: load-time `SchemaValidationError` vs runtime `InvalidStateTransitionError` (major — spec vs spec and spec vs code)**

- **workflow-model verify “Invalid step name rejected”:** GIVEN schema `workflow: [{ step: designing }, { step: reviewing }]`, WHEN transition **to** `reviewing`, THEN `TransitionChange` throws `InvalidStateTransitionError`.
- **schema-format:** `step` is a lookup key naming an existing lifecycle state; a non-`ChangeState` MUST NOT occupy an axis slot. It does **not** explicitly mandate `SchemaValidationError` at `buildSchema`.
- **Code:** Resolved schemas cannot contain `reviewing` (`buildSchema` throws). `TransitionChange.to` is typed `ChangeState`, so `reviewing` is not a legal target. Runtime defense is `protocol.edge` / `isValidTransition` for illegal **pairs**, not “unknown step name”.
- **Interpretation A (workflow-model verify right):** Tests should load an invalid schema (bypass `buildSchema`) and assert TransitionChange. **Interpretation B (schema-format + code right):** Unknown names never reach TransitionChange; reject at schema build. workflow-model verify is stale vs locked “lookup not protocol” + axis filter.
- **Do not re-litigate** allowing unknown names onto the axis; both spec and code agree they are not axis slots.
- **Severity:** major as **spec inconsistency** (workflow-model verify vs schema-format/buildSchema); **not** a production hop bug.

**2. Semantic routing “implementation-failure vs artifact-review-required” (nit)**

- Spec describes verification **outcomes** routing to implementing vs designing. Code exposes those as legal `VALID_TRANSITIONS` hops (`verifying → implementing` / `→ designing`); it does not encode outcome labels in `TransitionChange`. Skills choose `to`.
- **Severity:** nit (narrative vs mechanism).

### Test Coverage

- `build-schema.spec.ts`: accepts valid ChangeState steps; rejects `reviewing` with `SchemaValidationError`.
- `transition-checks.spec.ts`: unknown string in workflow list does not invert along.
- **No** TransitionChange test for `to: 'reviewing'` (impossible on `ChangeState` without cast).

### Missing Tests

- workflow-model verify scenario as written is untestable against `buildSchema`. Either update verify to SchemaValidationError at resolve, or add a bypass-schema test — **spec decision**, not an implementation hole for resolved schemas.
- Omitted `implementing`: `workflowStep('implementing') === null` **and** `ready → implementing` still protocol-legal (partially covered via classifyAlong + VALID_TRANSITIONS; not via Schema + TransitionChange together).

### Spec Dependency Chain (depth 1)

- `core:change` — states. **Consistent.**
- `core:schema-format` — YAML. **Tension** on unknown-step failure mode (above).
- `core:build-schema` — DAG + now ChangeState membership. **Code stricter than schema-format text.**
- `core:compile-context` / `core:get-status` / `core:transition-change` / `core:archive-change` / `core:hook-execution-model` / `core:transition-checks` — **aligned** on lookup, splice, no CompileContext hops.

### Counts

| Severity | Count                           |
| -------- | ------------------------------- |
| critical | 0                               |
| major    | 1 (spec-vs-spec / verify stale) |
| minor    | 0                               |
| nit      | 1                               |

---

## core:change

### Requirements Summary

Lifecycle states including drain-only pending/approved. New work: stay in `ready`/`done` until Approve\*; `VALID_TRANSITIONS['ready']` = implementing + designing only; `done` includes archivable, designing, implementing, verifying (no pending-signoff). Skill-aligned backward hops; entity still rejects pairs not in `VALID_TRANSITIONS`. Approvals are checks on delivery edges.

### Implementation Status

| Area                             | Status      | Evidence                                               |
| -------------------------------- | ----------- | ------------------------------------------------------ |
| `VALID_TRANSITIONS`              | Implemented | `change-state.ts` 30–43 matches spec                   |
| No pending enter from ready/done | Implemented | ready ↛ pending-spec-approval; done ↛ pending-signoff  |
| Drain                            | Implemented | pending-spec-approval → spec-approved \| designing     |
| Backward hops                    | Implemented | done/signed-off/archivable → implementing \| verifying |
| Entity reject                    | Implemented | `Change.transition` + `protocol.edge`                  |

### Discrepancies

None material vs this change’s locked product. Drain `nextAction` for `pending-spec-approval` still recommends `spec-approved` (`lifecycle-engine.ts` 847–854) — consistent with drain, not new parking hops.

### Test Coverage

Covered via `transition-change.spec.ts` (stay in ready on failed approval.spec) and `lifecycle-engine.spec.ts` / change entity tests (not exhaustively re-listed).

### Missing Tests

- None specific beyond existing approval/no-pending scenarios (present in transition-checks verify).

### Spec Dependency Chain (depth 1)

Dependencies of `core:change` are outside this batch except as provider to the others. **Consistent** with transition-checks / workflow-model / engine.

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| nit      | 0     |

---

## core:schema-format

### Requirements Summary (workflow slice relevant to this batch)

`workflow[]` attaches configuration to existing lifecycle states; MUST NOT define occupancy of the protocol. Order is display order **and** listed names on the `along` axis; missing delivery states spliced by canonical fallback index; omitted step MUST NOT delete protocol membership; non-`ChangeState` MUST NOT occupy an axis slot. Duplicate `workflow[].step` is a validation error. `requiresTaskCompletion` ⊂ `requires` and `hasTasks`.

### Implementation Status

| Area                 | Status                 | Evidence                                                          |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| Lookup semantics     | Implemented            | Schema value object + `workflowStep`                              |
| Duplicate steps      | Implemented            | `buildSchema` SchemaValidationError                               |
| Non-ChangeState step | Implemented (stricter) | `buildSchema` SchemaValidationError “not a valid lifecycle state” |
| Axis language        | Spec-aligned           | Matches transition-checks / workflow-model                        |

### Discrepancies

**1. Failure mode for non-ChangeState `step` underspecified vs code (minor — likely spec drift, code correct)**

- **Spec:** MUST NOT occupy an axis slot; does not say `buildSchema` SHALL throw.
- **Code:** Throws at schema build (`build-schema.ts` 687–695). Axis filter remains defense in depth for test helpers (`makeSchema`) that may not go through `buildSchema`.
- **Interpretation A:** Spec should require SchemaValidationError (code is the intended product). **Interpretation B:** Spec allows unknown strings in YAML if they are ignored on the axis; then `buildSchema` is overly strict.
- Locked product: unknown strings are not axis slots. Prefer interpretation A.
- **Severity:** minor (docs vs validator).

**2. schema-format verify.md** has no scenario for AXIS_FALLBACK splice or unknown-step validation (missing tests at spec level). Covered in core tests instead.

### Test Coverage

- `build-schema.spec.ts` rejects `reviewing`.
- `merge-schema-layers.spec.ts` / `resolve-schema.spec.ts` still mention `reviewing` as merge **payload** strings (layer merge may occur before semantic `buildSchema`). Confirm merge tests expect throw at resolve — `resolve-schema.spec.ts` around 758.

### Missing Tests

- schema-format verify scenarios for: omitted delivery state still protocol-legal; splice order; unknown step rejected at resolve with `SchemaValidationError`.

### Spec Dependency Chain (depth 1)

- `core:transition-checks` (referenced from Workflow requirement). **Consistent** on splice wording.
- `default:_global/architecture` — YAML validated at infrastructure/domain `buildSchema` boundary as `SchemaValidationError`. **Consistent.**

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 1     |
| nit      | 0     |

---

## core:hook-execution-model

### Requirements Summary

`instruction:` not in the check pipeline. `run:` effects selected with the same matcher; TransitionChange runs matching `before-persist` effects (pre + source.post on forward) via `check.execute`; ArchiveChange uses `phase`/`onFailure` (post collect after persist). `skipHookPhases` by selector, not `binding.phase` alone. Use cases MUST NOT launch `RunStepHooks` by check id. Change entity does not execute hooks.

### Implementation Status

| Area               | Status      | Evidence                                                                                                                                                |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect bindings    | Implemented | hook.post forward / before-persist / abort; hook.pre except recovery / before-persist / abort; archive post after-persist collect (`check-bindings.ts`) |
| Launch via execute | Implemented | `TransitionChange._executeEffect` → `executeCheckWithProgress(binding.check, ctx)`                                                                      |
| Skip selectors     | Implemented | `HookEffectCheck.execute`                                                                                                                               |
| instruction:       | Implemented | Not registered as checks                                                                                                                                |
| Entity             | Implemented | No hook runner on `Change`                                                                                                                              |

### Discrepancies

**1. Dead id-keyed helpers (minor)** — same as transition-checks #3. `executeHookEffect(checkId, ...)` still exists; unused by TransitionChange/ArchiveChange live path.

**2. Skip `source.pre` / `target.post` (nit)**

- **Spec:** MAY be no-ops until a binding uses those slots. Code accepts the selector type on `TransitionChange` but `HookEffectCheck` only honors `target.pre` / `source.post` / `all`. Matches “MAY be no-ops”.

### Test Coverage

- `transition-change.spec.ts`: skip target.pre only; skip source.post only; skip all still runs task predicates; source.post skipped on redesign; order post then pre; HookFailedError aborts persist.
- Archive phase/onFailure covered in archive-change tests (out of this file’s primary reads; bindings declared).

### Missing Tests

- Skip mapping must not treat `binding.phase === before-persist` as skipping both effects (the dead helper would; live path tested independently).
- Plugin/future non-hook effect still runs if bound to the slot (spec: MUST NOT filter matching effects to hook ids). Live `matchingEffects` filters by `isEffectCheck` + phase + matcher, not id — **no test** for a third effect id.

### Spec Dependency Chain (depth 1)

- `core:workflow-model`, `core:schema-format`, `core:transition-checks` — **Consistent** on matcher, phase, skip selectors.
- `core:transition-change` / `core:archive-change` / `core:run-step-hooks` — live path consistent; dead helpers not.
- Architecture: `RunStepHooks` is application; hook checks take it as constructor dep. **Consistent.**

### Counts

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| major    | 0     |
| minor    | 1     |
| nit      | 1     |

---

## Consistency with `default:_global/architecture`

- Domain `classifyAlong` / `buildAxis` / pure `run(facts)`: **compliant** (no I/O).
- Application `WorkflowCheck` + ports (`CountTasks`, `RunStepHooks`, ready-facts): **compliant**.
- Composition `createTransitionChange(deps)` requires `transitionBindings`; kernel resolver uses registry: **compliant** (manual DI).
- `applyBindingSpecs` generic `Error`: **minor** vs typed `SpecdError`.
- `LifecycleEngine` as class: pre-existing vs “stateless domain services are functions”; **nit**.
- Schema YAML → `SchemaValidationError` at `buildSchema`: **compliant** (schema miss / invalid step at boundary).
- `SchemaNotFoundError` when provider cannot resolve: **compliant** (TransitionChange does not skip checks).

---

## Focus recap

| Focus                                                        | Verdict                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildAxis` splice                                           | **Compliant.** Insert-by-canonical-index; tests prove omit-implementing retry stays `backward` (tail-append would invert).                                                                                                                                                                                             |
| `classifyAlong` omit-implementing `verifying → implementing` | **Compliant** (`backward`).                                                                                                                                                                                                                                                                                            |
| `availableSteps` vs `validTransitions`                       | **Engine compliant** (extras rows vs protocol array). **Untested** extras-omit scenario. GetStatus does not expose `availableSteps`.                                                                                                                                                                                   |
| `TransitionChange` not defaulting `TRANSITION_BINDINGS`      | **Compliant.** Required constructor arg; composition injects `createWorkflowCheckRegistry` bindings; domain `TRANSITION_BINDINGS` is test fixture, not public `.` export.                                                                                                                                              |
| Schema miss throws                                           | **Compliant** for unresolved schema (`SchemaNotFoundError`, does not skip checks). Unknown workflow **name** throws at `buildSchema` (`SchemaValidationError`), not as TransitionChange `InvalidStateTransitionError` (workflow-model verify stale). Omitted extras row does **not** throw (skip `workflow.requires`). |

---

## Batch totals (this partial)

| Severity | Count                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------- |
| critical | 0                                                                                                         |
| major    | 2 (engine dual blocker codes on `requestedTarget`; workflow-model verify vs buildSchema for unknown step) |
| minor    | 5                                                                                                         |
| nit      | 5                                                                                                         |

Highest-impact implementation gap: `LifecycleEngine._requestedTargetBlockers` re-walk. Highest-impact spec gap: workflow-model “Invalid step name” scenario vs schema load rejection.
