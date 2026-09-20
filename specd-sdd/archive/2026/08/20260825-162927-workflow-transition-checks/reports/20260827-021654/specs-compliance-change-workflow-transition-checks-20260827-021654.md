# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260827-021654
- **Graph:** indexed this session (`stale: false`)
- **CLI:** `node packages/cli/dist/index.js`

## Aggregated counts

| Source                                 | critical | major |  minor |    nit |
| -------------------------------------- | -------: | ----: | -----: | -----: |
| core-checks                            |        0 |     2 |      5 |      5 |
| core-usecases                          |        0 |     4 |     14 |     10 |
| cli-skills                             |        0 |     3 |      5 |      5 |
| **Sum (partials, may overlap themes)** |    **0** | **9** | **24** | **20** |

No critical runtime defects. Majors are engine dual blocker codes on `requestedTarget`, workflow-model verify vs `buildSchema` for unknown steps, test/docs lag (draft DAG cascade, empty `checksByTarget` spies, CLI reference / archive help / archive verify JSON stream).

Locked product remains implemented: splice axis, lookup `workflow[]`, stay-in-`ready`/`done`, check bus, archive `stream: change-archive`.

## Detailed findings

Verbatim partial reports follow.

---

## Partial: core-checks

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

---

## Partial: core-usecases

# Spec compliance — core use cases (partial)

Change: `workflow-transition-checks`  
Scope: `core:get-status`, `core:transition-change`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:config`  
Source of truth for this audit: `specd changes spec-preview workflow-transition-checks <specId>` (merged spec + verify).  
Code: `packages/core` (read-only). Graph: `GetStatus` (`get-status.ts:278`), `TransitionChange` (`transition-change.ts:109`), `ArchiveChange` (`archive-change.ts:275`), `ApproveSpec` (`approve-spec.ts:30`), `ApproveSignoff` (`approve-signoff.ts:30`), `ValidateArtifacts` (`validate-artifacts.ts:114`), `GetArtifactInstruction` (`get-artifact-instruction.ts:52`).

Focus checks requested by the parent audit:

| Check                                                                    | Verdict                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GetStatus paints `taskCompletion` from checks                            | **Implemented** — `taskCompletionFromChecks(checksByTarget)` after `executeChecksByLegalTargets`; CountTasks is not a GetStatus constructor port |
| Drafts use `projectArtifacts` not `evaluate`                             | **Implemented** — `_buildDraftedResult` calls `this._lifecycle.projectArtifacts(source, schema)` only                                            |
| ArchiveChange has no unused stored `RunStepHooks` field                  | **Implemented** — ctor param used only for `defaultArchiveBindings`; instance fields do not include `_runStepHooks`                              |
| Validate / GetArtifactInstruction `evaluate` with empty `checksByTarget` | **Implemented** — both pass `{ checksByTarget: {} }`                                                                                             |
| Approvals stay in `ready` / `done`                                       | **Implemented** — record history; transition only on drain pending states                                                                        |
| Config spec gate is any **forward** leave of `ready`                     | **Implemented** — `approval.spec` binding `from=ready, to=*, along=forward`; redesign `ready → designing` does not match                         |

Neither merged spec nor code is assumed always right. Where they diverge, both interpretations are listed.

---

## core:get-status

### Requirements Summary

Merged requirements (workspace spec + change deltas):

1. Accepts a change name as input
2. Returns the change and its artifact statuses
3. Revision evaluation for conditional status queries (`ifModifiedSince`)
4. Drafted change read-only status (`getDraft`; DAG via `projectArtifacts`; empty transitions)
5. Implementation status projection
6. Optional pre-read implementation tracking refresh (active changes only)
7. Drift-aware display status
8. Reports task completion counts for task-capable artifacts **from `workflow.taskCompletion` details; no second CountTasks; no global snapshot bag**
9. **Execute matching predicates then project** (added)
10. Throws `ChangeNotFoundError` for unknown changes
11. Constructor dependencies (`transitionBindings` / `create*`; **must not** take `CountTasks`)
12. Config-based factory preserves complete repository bootstrap
13. Reports effective status for every artifact
14. Returns lifecycle context (check-derived `availableTransitions` / `nextAction`)
15. Identifies blockers (failed predicates + review codes; `impl.filesResolved` vs `impl.linksInScope` bypass)
16. Graceful degradation when schema resolution fails
17. Config-based factory delegates through `resolveGetStatusDeps`

### Implementation Status

**Implemented** against merged spec.

- Active path (`get-status.ts` `_buildActiveResult`): `projectArtifacts` → `executeChecksByLegalTargets` → `lifecycle.evaluate(..., { checksByTarget })` → paint `taskCompletion` from `workflow.taskCompletion` details (`taskCompletionFromChecks`). CountTasks is composed inside `createWorkflowTaskCompletion` / registry, not a GetStatus field.
- Draft path (`_buildDraftedResult`): `getDraft` only; **`projectArtifacts`, not `evaluate`**; `availableTransitions`/`validTransitions` empty; `nextAction.command` null; no `change` on result (`draftView` instead); no refresh.
- Constructor: `changes`, `schemaProvider`, `approvals`, `refresh`, `lifecycle`, `transitionBindings` — no `CountTasks`.
- Schema miss: catch around `schemaProvider.get()` only; check `execute` is not inside that catch.
- Blocker merge: failed predicates flattened; `--allow-out-of-scope` only when `IMPLEMENTATION_STATE` **and** `impl.linksInScope`.

### Discrepancies

None **critical/major** vs merged spec.

- **nit — naming:** Tests still say “delegates task projection to CountTasks for artifact painting.” Code paints from check details; CountTasks runs inside the check `execute`. Spec forbids a second CountTasks after evaluate; tests assert `countTasks.execute` once **before** `evaluate`. Behaviour matches; comments/test titles lag.

### Test Coverage

Covered in `packages/core/test/application/use-cases/get-status.spec.ts` (and composition factory tests):

- Task counts painted; CountTasks once before `evaluate`; incomplete implementing tasks omit `verifying` and emit `INCOMPLETE_TASKS`
- Check rows / `checksByTarget`
- `impl.linksInScope` vs `impl.filesResolved` bypass
- Predicate blocker `label` / `checkId`
- Draft empty transitions; skip refresh on drafts
- Schema provider failure → empty checks
- `ifModifiedSince` short-circuit
- Composition: `resolveGetStatusDeps` includes `transitionBindings`

### Missing Tests

- **major (verify gap):** Merged verify scenario “Drafted status DAG-projects effective status” (`pending-parent-artifact-review` on a dependent artifact when parent is `pending-review`). Existing draft test only asserts empty transitions / `draftView`. Implementation uses `projectArtifacts`, which is the specified cascade, but the parent-review outcome is unasserted.
- **minor:** No explicit assert that draft path **does not** call `evaluate` (only that transitions are empty).
- **minor:** No assert that GetStatus does not gather a typed global snapshot bag (covered indirectly by constructor/registry tests).

### Spec dependency chain

`core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`, `core:drafted-change-view`.

No contradiction with those deps for the status projection model. Workspace `core:config` Approvals section is still pending-hop language until this change is archived (see `core:config`).

### Counts

|                       | n                |
| --------------------- | ---------------- |
| Requirements reviewed | 17               |
| Implemented           | 17               |
| Partial               | 0                |
| Missing               | 0                |
| Discrepancies         | 1 nit            |
| Test gaps             | 1 major, 2 minor |

---

## core:transition-change

### Requirements Summary

Merged (rename + add from deltas):

1. Input contract (requested target is persist target; `allowOutOfScope`; skip effects only)
2. Approval gates baked at construction
3. Change must exist
4. Optional pre-transition implementation tracking refresh
5. **Spec approval is a check not a pending hop** (was routing to `pending-spec-approval`)
6. **Signoff is a check not a pending hop**
7. Human-approval pending states drain-only
8. Direct transition when gates inactive (persist requested target)
9. Workflow requires = `workflow.requires` predicate (no second walk)
10. Task completion = `workflow.taskCompletion` in same evaluation
11. Artifact validation clearing on `verifying → implementing`
12. **Skill-aligned backward hop invalidation** (added)
13. Transition to designing from any state
14. `archiving → archivable` is `along=recovery` (skip requires/taskCompletion/source.post)
15. Pre-hook = target `hook.pre` after predicates (`RunStepHooks` inside check)
16. Transition delegation / entity `transition`
17. Transition event
18. Post-hook = source `hook.post` only `along=forward`
19. Persistence via `mutate`
20. Result type
21. Progress callback
22. Dependencies: bindings, **not** `RunStepHooks`/`CountTasks` on the use case
23. Config factory via `resolveTransitionChangeDeps`

### Implementation Status

**Implemented.**

- `effectiveTarget = requestedTarget` — no rewrite to pending states (`transition-change.ts` ~203).
- Predicates: `executeMatchingPredicates` then `evaluate` with `{ [requestedTarget]: evaluation.checks }`.
- Failed `approval.spec` → `InvalidStateTransitionError` `{ type: 'approval-required', gate: 'spec' }`; change left in `ready` (test + `expect(change.state).toBe('ready')`).
- Signoff analog for `done → archivable`.
- `_assertDrainAndGateTargets`: `gate-not-required` if targeting pending/`spec-approved`/`signed-off` when gate off; drain hops from pending still allowed.
- `VALID_TRANSITIONS` already forbids `ready → pending-spec-approval` / `done → pending-signoff` (`change-state.spec.ts`).
- Constructor: no `RunStepHooks` / `CountTasks`; `transitionBindings` only.
- Skill hops: `invalidateSignoff` when source in `{done,signed-off,archivable}` and target in `{implementing,verifying}`.

### Discrepancies

None critical/major vs merged spec.

- **nit:** Constraints still mention “Approval-gate routing is configuration-driven… centralized through LifecycleEngine.” Routing is gone; engine **projects** check results. Copy leftover in merged constraints, not a code bug.
- **minor (use-case vs binding):** `ready → verifying` with spec gate is matched by bindings (`transition-checks.spec.ts` “approval.spec wildcard, when ready to verifying, then matches”). `TransitionChange` tests cover `ready → implementing` + drain, not a dedicated `ready → verifying` execute with `approvals.spec: true`. Behaviour should follow the same predicate path; unproven at this use case.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`:

- Stays in `ready` / `done` on approval-required
- Consent then `ready → implementing`
- Drain pending → spec-approved / signed-off
- Reject explicit `to: pending-spec-approval` from ready (protocol / gate)

`packages/core/test/domain/services/transition-checks.spec.ts`:

- `approval.spec` matches `ready → verifying` forward; does not match `ready → designing`

### Missing Tests

- **minor:** `TransitionChange.execute({ to: 'verifying' })` from `ready` with spec gate on, no consent — should stay in `ready` with `approval-required` (config “any forward leave”).
- **minor:** Skill-aligned hop: `done → implementing` invalidates signoff only (no mass artifact invalidate) — if not already asserted in this file, add it (delta-added requirement).

### Spec dependency chain

`core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

Aligned with in-place approval checks.

### Counts

|                       | n                             |
| --------------------- | ----------------------------- |
| Requirements reviewed | 23                            |
| Implemented           | 23                            |
| Partial               | 0                             |
| Missing               | 0                             |
| Discrepancies         | 1 nit, 1 minor (untested hop) |
| Test gaps             | 2 minor                       |

---

## core:archive-change

### Requirements Summary

Large archival use case (schema guard, archivable, readonly, overlap, hooks, snapshots, merge, publication, impl guards, etc.) plus change deltas:

- Schema name guard = `schema.nameMatch` on operation archive
- Archivable = `archive.archivable`; **not** a lifecycle hop; `approval.signoff` not bound
- `workspace.readOnly` / `deps.consistent` same runners as enter-`ready`
- `impl.filesResolved` / `impl.linksInScope` same runners as **forward** exit `implementing`
- Overlap = `spec.overlap` archive-only
- Effects selected by binding `phase`, not `check.id`
- **Archive checks share runners…** remaining publication preflight stays inside ArchiveChange; no `archive.publication` binding
- **Archive bindings not RunStepHooks on the use case** — inject `archiveBindings`; **must not keep unused `RunStepHooks` instance field**; ctor param OK for default bindings

### Implementation Status

**Implemented** for the delta-focused items.

- Fields (`archive-change.ts` 275–287): `_changes`, `_listWorkspaces`, `_archive`, `_actor`, `_parsers`, `_schemaProvider`, `_materializeMetadata`, `_extractorTransforms`, `_workspaceRoutes`, `_projectRoot`, `_batchSnapshot`, `_archiveBindings`. **No `_runStepHooks`.**
- Ctor still takes `runStepHooks: RunStepHooks` and uses it **only** when `archiveBindings` is omitted (`defaultArchiveBindings` → `createWorkflowCheckRegistry({ runStepHooks })`). Matches “ctor param OK for default bindings.”
- Composition always injects `archiveBindings: registry.archiveBindings` **and** still passes `runStepHooks` through (unused when bindings present). Spec forbids a **stored unused field**, not an unused ctor argument.

### Discrepancies

- **nit:** `ArchiveChangeDeps.runStepHooks` remains **required** even when `archiveBindings` is provided (`composition/use-cases/archive-change.ts`). Spec: RunStepHooks is a dep of hook `create*` only. Possible readings: (a) leftover wiring for defaults — acceptable; (b) factory still reconstructs a use-case-level hook port — spec drift. Prefer (a); no stored field.

No unused instance field found (the requested check **passes**).

### Test Coverage

`archive-change.spec.ts` still constructs with `makeRunStepHooks()` everywhere (needed for default bindings / ctor). Overlap, readonly, impl, hooks, rollback covered historically.

No test that `ArchiveChange` instance has no `runStepHooks` own property / that injected `archiveBindings` skip calling the ctor `runStepHooks` mock.

### Missing Tests

- **minor:** Construct with explicit `archiveBindings` and a throwing/unused `runStepHooks` mock — archive predicates/effects must not invoke that mock.
- **minor:** Assert `approval.signoff` is not in `ARCHIVE_BINDING_SPECS` (exists in `check-bindings.ts`; could be a bindings test rather than ArchiveChange).

### Spec dependency chain

Includes `core:transition-checks` for named archive checks. Consistent with registry `ARCHIVE_BINDING_SPECS`.

### Counts

|                           | n                       |
| ------------------------- | ----------------------- |
| Requirements reviewed     | 31 (base ~29 + 2 added) |
| Implemented (delta focus) | yes                     |
| Discrepancies             | 1 nit                   |
| Test gaps                 | 2 minor                 |

---

## core:approve-spec

### Requirements Summary

1. Gate guard (disabled → `ApprovalGateDisabledError`; no I/O)
2. Change lookup
3. Artifact hash computation (schema once for cleanup map; skip missing/skipped/null)
4. Approval recording: **stay in `approval.spec` `from` states (`ready`); drain `pending-spec-approval` → `spec-approved`**
5. Persistence via `mutate`; no transition on `ready`
6. Input: `name` + `reason` only
7. Gates baked at construction
8. Factory via `resolveApproveSpecDeps` (`contentHasher`)

### Implementation Status

**Implemented.** `approve-spec.ts`: gate first; `boundFromStates('approval.spec')` plus drain; `recordSpecApproval`; `transition('spec-approved')` **only if** `pending-spec-approval`. Happy path from `ready` stays `ready`.

### Discrepancies

- **nit:** Use-case ctor parameter still named `hasher`; composition field is `contentHasher` as spec requires. Mapping is correct.
- **nit:** Test suite describe “given the change is not in pending-spec-approval state” still uses default (drafting) change; merged verify says “not in ready or pending-spec-approval” / drafting. Behaviour matches; title is stale.

### Test Coverage

`approve-spec.spec.ts`: stays in `ready`; drain pending → `spec-approved`; gate disabled; not-found; schema mismatch before mutate; drafting throws `InvalidStateTransitionError`.  
Composition tests assert `contentHasher` on deps.

### Missing Tests

- **minor:** Explicit “MUST NOT call `transition('pending-spec-approval')`” spy (implied by stay-in-ready).
- **minor:** Hash skip for `missing`/`skipped`/null load (may exist in shared hash tests).

### Spec dependency chain

Adds `core:transition-checks` for `from` states. `boundFromStates('approval.spec')` → `['ready']` (tested).

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 minor |

---

## core:approve-signoff

### Requirements Summary

Symmetric to ApproveSpec: stay in `done`; drain `pending-signoff` → `signed-off`; factory `contentHasher`.

### Implementation Status

**Implemented.** Same structure as ApproveSpec (`approve-signoff.ts`).

### Discrepancies

Same nits as ApproveSpec (`hasher` vs `contentHasher`; stale describe “not in pending-signoff”).

### Test Coverage

Stay in `done`; drain pending; gate/lookup/mismatch. Composition `contentHasher`.

### Missing Tests

Same pattern as ApproveSpec (minor).

### Spec dependency chain

`core:transition-checks` — `boundFromStates('approval.signoff')` → `['done']`.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 8       |
| Implemented           | 8       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 minor |

---

## core:validate-artifacts

### Requirements Summary

Full validation pipeline (guards, required artifacts, DAG order, deltas, structural/cross-artifact rules, hashes, persist, invalidation) plus:

- **DAG lifecycle from engine `projectArtifacts`:** when DAG status / next-artifact order is needed, **`LifecycleEngine.evaluate` with empty `checksByTarget`**. Must not run hop predicates / `executeChecksByLegalTargets`. Must not gather a global snapshot bag. `gatherPredicateSnapshots` must not exist.

### Implementation Status

**Implemented** for the added requirement.

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Empty `checksByTarget` means `evaluate` skips injecting hop rows (`injected === undefined` → `continue`), so `availableTransitions` stays empty and **no check `execute`**. Artifact DAG still comes from `projectArtifacts` inside `evaluate`. No `gatherPredicateSnapshots` in this file.

### Discrepancies

- **nit:** Spec title says “from engine projectArtifacts” while body mandates `evaluate` with empty `checksByTarget`. Code follows the body (`evaluate` → internal `projectArtifacts`). GetStatus **drafts** call `projectArtifacts` directly; Validate calls `evaluate`. Both are specified that way — not a bug, but two call shapes for the same DAG.

### Test Coverage

Large `validate-artifacts.spec.ts` covers validation behaviour. **No** spy that `evaluate` is invoked with `checksByTarget: {}` or that hop predicates are not run.

### Missing Tests

- **major (verify gap):** Merged verify “GetArtifactInstruction/Validate uses empty `checksByTarget`” analog for ValidateArtifacts — spy `lifecycle.evaluate` third arg `{ checksByTarget: {} }` and assert no `executeChecksByLegalTargets`.
- **minor:** Next-artifact / parent-blockage selection during validate traversal vs persisted `complete` (if still required by dependency-order requirement).

### Spec dependency chain

Adds `core:transition-checks` (“no snapshot bag; hop predicates are not this use case”). Consistent.

### Counts

|                       | n                          |
| --------------------- | -------------------------- |
| Requirements reviewed | 24                         |
| Implemented           | 24                         |
| Discrepancies         | 1 nit (spec title vs body) |
| Test gaps             | 1 major, 1 minor           |

---

## core:get-artifact-instruction

### Requirements Summary

Ports, input (optional `artifactId` → engine next artifact), lookup, schema guard, artifact resolution, instruction/template/delta/rules, result shape, factory (`templateExpander`), plus:

- **Effective status from DAG evaluate:** `evaluate` with empty `checksByTarget` (`nextArtifact` / `projectArtifacts`). Not GetStatus hop path. No snapshot bag.

Constraints: MUST NOT evaluate hop availability (`availableTransitions`); MUST NOT run hop predicates.

### Implementation Status

**Implemented.**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

Uses `nextArtifact` only. Empty checks ⇒ no predicate `execute`. Engine still computes `nextAction`/`availableTransitions` from an empty injected map (transitions stay empty). Use case does not return those fields.

Factory: `templateExpander` on deps; ctor param still named `templates`.

### Discrepancies

- **nit:** Ctor `templates` vs spec/factory `templateExpander`.
- **nit:** Constraint “MUST NOT evaluate hop availability” vs calling full `evaluate` (which still walks `validTransitions` but skips missing injections). Alternative: `projectArtifacts` + `_nextArtifact` only. Code matches the **requirement** that names `evaluate` with empty `checksByTarget`. Treat as wording tension, not a fail.

### Test Coverage

`get-artifact-instruction.spec.ts`: omitted `artifactId` picks first incomplete in topo order; all complete → `ArtifactNotFoundError`; instruction/delta/templates; no `change.workspace`. **No** `evaluate` spy / empty `checksByTarget`.

Missing merged verify: “GetArtifactInstruction uses empty `checksByTarget`”; “omitted artifactId ignores persisted complete when engine reports dependency blockage”.

### Missing Tests

- **major:** Spy `evaluate(..., { checksByTarget: {} })`.
- **major:** Persisted `complete` but effective `pending-parent-artifact-review` must not be treated as resolved for auto-select (verify scenario exists; test file has topo-order only).

### Spec dependency chain

`core:lifecycle-engine`, `core:transition-checks` (no gather bag). Consistent.

### Counts

|                       | n       |
| --------------------- | ------- |
| Requirements reviewed | 9       |
| Implemented           | 9       |
| Discrepancies         | 2 nits  |
| Test gaps             | 2 major |

---

## core:config

### Requirements Summary

Many config surface requirements; **this change only rewrites Approvals**:

- `approvals.spec: true` → cannot take any **forward** leave of `ready` (`approval.spec`: `from=ready`, `to=*`, `along=forward`) until `ApproveSpec` records consent; stay in `ready`. Includes `ready → implementing` and `ready → verifying` when `implementing` omitted. Redesign `ready → designing` MUST NOT require the spec gate.
- `approvals.signoff: true` → `done` cannot go to `archivable` until signoff; stay in `done`.
- New work MUST NOT enter pending states via `change transition`.
- Defaults false.

Loader still only parses booleans (`config-schema.ts` / `config-loader.ts`). Semantics live in bindings + use cases.

### Implementation Status

**Implemented** relative to **merged** Approvals:

- Binding: `check-bindings.ts` `approval.spec` `{ from: 'ready', to: '*', along: 'forward' }`.
- Matcher tests: `ready → verifying` matches; `ready → designing` does not.
- Loader: `approvals.spec/signoff` default false.

### Discrepancies

- **major — workspace spec vs change (intentional until archive):** On-disk `specs/core/config/spec.md` **Approvals** still documents `pending-spec-approval` / `pending-signoff` hops. Merged preview + code follow in-place checks.
  - If reviewer treats **workspace specs/** as current product docs: **spec drift** (docs wrong).
  - If reviewer treats **change merged spec** as truth: **expected**; archive will replace the section.  
    This audit scores implementation against **merged** spec → not an implementation defect.

No code that still rewrites `implementing` → `pending-spec-approval` in TransitionChange.

### Test Coverage

`config-loader.spec.ts` parses booleans. Semantic gate tests live in `transition-checks.spec.ts` / `transition-change.spec.ts` / `lifecycle-engine.spec.ts`, not in config-loader.

Merged verify: “Spec gate on does not require pending-spec-approval in the graph” — **not** a config-loader test; covered by bindings + `isValidTransition('ready', 'pending-spec-approval') === false`.

### Missing Tests

- **minor:** Config-package or docs test that comments/examples do not mention pending hops (documentation contract). Enforcement tests belong with bindings (already present for verifying vs designing).

### Spec dependency chain

Adds `core:transition-checks`. Merged Approvals consistent with bindings. **Unmerged workspace spec contradicts** the change.

### Counts

|                            | n                                                                |
| -------------------------- | ---------------------------------------------------------------- |
| Requirements reviewed      | 1 delta (Approvals) + rest of config not re-audited line-by-line |
| Approvals (merged) vs code | Implemented                                                      |
| Discrepancies              | 1 major **base-spec vs change** (docs), 0 implementation         |
| Test gaps                  | 1 minor (docs/config layer)                                      |

---

## Batch summary

| Spec                     | Reqs    | Impl           | Disc.                                | Missing tests                           |
| ------------------------ | ------- | -------------- | ------------------------------------ | --------------------------------------- |
| get-status               | 17      | 17             | 1 nit                                | 1 major (draft parent cascade), 2 minor |
| transition-change        | 23      | 23             | 1 nit + 1 untested hop               | 2 minor                                 |
| archive-change           | 31      | delta OK       | 1 nit (deps still list runStepHooks) | 2 minor                                 |
| approve-spec             | 8       | 8              | 2 nits                               | 2 minor                                 |
| approve-signoff          | 8       | 8              | 2 nits                               | 2 minor                                 |
| validate-artifacts       | 24      | 24             | 1 nit                                | 1 major (empty checks spy)              |
| get-artifact-instruction | 9       | 9              | 2 nits                               | 2 major                                 |
| config (Approvals)       | 1 delta | matches merged | 1 major workspace-doc lag            | 1 minor                                 |

**Focus checks:** all **code-compliant** with merged specs. Highest-value gaps are **tests**, not missing implementation.

**Severity rollup (this batch):** critical 0; major 4 (3 test gaps + 1 unarchived workspace config docs); minor 14; nit 10.

---

## Partial: cli-skills

# Spec compliance partial: CLI + skills

- **Mode:** change `workflow-transition-checks` (read-only)
- **Batch:** `cli-skills`
- **Graph:** fresh (`stale: false`, indexed `2026-08-27T00:09:49.894Z`)
- **Sources:** `specd changes spec-preview workflow-transition-checks <specId>` (merged), `specd graph search` / `graph impact`, CLI/skills source + tests, `default:_global/docs`
- **Code not modified.** Specs not modified.

Consistency anchors (not fully audited here): `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending states drain-only; generic check bus `check-start` / `check-progress` / `check-done`; gerund labels; no `Executing:` prefix; `HookFailedError` for aborting effects) and `default:_global/docs` (CLI output-contract docs must update in the same change).

---

## Spec: `cli:change-status`

### Requirements Summary

| #   | Requirement                                      | Intent                                                                             |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | Command signature                                | `change status <name> [--format text\|json\|toon]`                                 |
| 2   | Drafted change status is read-only               | `draftView` → drafted marker; no mutating transition suggestions                   |
| 3   | Output format                                    | `artifactDag[].hasTasks`; DAG `state` is display (e.g. `complete-with-drift`)      |
| 4   | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                   |
| 5   | Display-state rendering                          | Text prefers display; JSON has canonical + display                                 |
| 6   | Lifecycle projections come from GetStatus checks | No local `VALID_TRANSITIONS` union that contradicts execute                        |
| 7   | Text omits duplicated review file lists          | No `review:` header; overlap peers still print                                     |
| 8   | Text blockers include check labels               | `! CODE — <gerund>: message`; JSON `label`/`checkId`                               |
| 9   | Schema version warning                           | stderr from `lifecycle.schemaInfo`, exit 0                                         |
| 10  | Change not found                                 | exit 1, `error:`                                                                   |
| 11  | Schema-derived fields                            | nested `schema.artifactDag` via `schema.artifactDag()` when Schema instance exists |
| 12  | Delegates refresh policy to GetStatus            | no direct Refresh/Detector                                                         |
| 13  | Implementation section                           | `--implementation` uses SDK projection only                                        |
| 14  | Task completion in details                       | `tasks: N/M`                                                                       |
| 15  | Basic info                                       | name/state; no standalone `specs:` line                                            |
| 16  | Specs and dependencies                           | text section + JSON `specDependsOn`                                                |

**Dependencies:** `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`.

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/status.ts` (`registerChangeStatus`).

- Active path serializes `lifecycle.availableTransitions` / `nextAction` / blockers from `GetStatus` (`optionalCheckFields` for `checks` / `checksByTarget`).
- Text blockers: `! ${code} — ${label}: ${message}` when `label` present.
- DAG uses `displayStatus`; JSON `artifactDag[].state` uses display; artifacts include `state` + `displayStatus`.
- Draft path: `(drafted)` in text; JSON `isDrafted: true`; transitions line is `(none — change is drafted)`.
- Status handler calls `kernel.changes.status.execute({ name })` only (no Refresh/Detector). `--implementation` goes through `enrichImplementationTracking` (SDK), not graph matching in the command.

Consistent with `core:transition-checks` projections (CLI does not recompute allowed edges).

### Discrepancies

1. **nit — spec Examples vs requirements.** `## Examples` still shows a `specs:` line and a `blockers: → ready: requires — …` shape that the merged requirements forbid (no standalone `specs:`; check-label blocker format). Spec example drift vs spec body. Code follows the requirements, not the example.

2. **minor — drafted status tests missing in CLI package.** Code implements `draftView`. Grep of `packages/cli/test` found **no** `draftView` / `isDrafted` assertions on `change status`. Verify scenarios “Drafted change does not list transition commands” / “JSON includes isDrafted” are uncovered at CLI.

### Test Coverage

Covered (non-exhaustive): `packages/cli/test/commands/change-status.spec.ts`, `packages/cli/test/commands/change/change-status.spec.ts`.

- DAG `hasTasks - 3/10 done`, `complete-with-drift` DAG state, availableTransitions passthrough without protocol union, DEPS_INCONSISTENT gerund label, overlap without `review:` header, schema warning, not-found, specDependsOn, no standalone `specs:`.

### Missing Tests

- Drafted `draftView` text + JSON (`isDrafted`, no `change transition` next action).
- Explicit assertion that CLI does not union `verifying` from protocol when GetStatus omits it (partially covered by “without unioning protocol edges”).

### Spec Dependency Chain

`cli:change-status` → `core:get-status` / `core:transition-checks`. CLI correctly treats projections as opaque. No contradiction with in-place gates (status does not advertise pending hops).

### Counts (`cli:change-status`)

- Requirements: **16**
- Implemented: **16**
- Partial: **0**
- Missing: **0**
- Discrepancies: **2** (0 critical, 0 major, 1 minor, 1 nit)
- Test gaps: **2**

---

## Spec: `cli:change-transition`

### Requirements Summary

| #   | Requirement                       | Intent                                                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                 | `<name> [step]` XOR `--next`; `--skip-hooks` phase set                                                                    |
| 2   | Next-transition resolution        | Fixed map; pending/archivable/archiving refuse `--next`; **from `signed-off`, `--next` → `archivable`**                   |
| 3   | Delegates refresh                 | GetStatus `refreshImplementationTracking: false` before and on repair                                                     |
| 4   | Approval-gate routing             | No rewrite to pending; user names delivery target                                                                         |
| 5   | Hook execution                    | map `--skip-hooks` → `skipHookPhases`                                                                                     |
| 6   | Progress output                   | Generic check bus; **`stream: "change-transition"`**; must not emit `stream: "hook-progress"`                             |
| 7   | Transition hook observability     | Progress before failure                                                                                                   |
| 8   | Shared hook progress presentation | Transition uses **check-progress presenter**; `run-hooks` may keep hook presenter; **different public JSON stream names** |
| 9   | Output on success                 | text stdout confirmation; JSON/TOON terminal `stream: change-transition` `event.type: complete`                           |
| 10  | Post-hook failure                 | **HookFailedError → exit 2**; no separate warning                                                                         |
| 11  | Invalid transition error          | **Repair Guide on stderr**; HookFailedError **must not** render repair; `--next` from signed-off → archivable             |
| 12  | Incomplete tasks                  | exit 1; status already omitted verifying                                                                                  |
| 13  | Check progress rendering          | gerund `(id)` / `✓`/`✗`; no `Executing:`                                                                                  |
| 14  | Unsatisfied requires              | exit 1                                                                                                                    |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/transition.ts`.

- `makeProgressRenderer` uses `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`.
- **Does not import** `_hook-progress-presenter` (graph + source).
- `isRepairGuideError` = `InvalidStateTransitionError` \| `ReadOnlyWorkspaceError` \| `ArchiveDependencyMismatchError` \| `ArchiveImplementationStateError`. **`HookFailedError` is not included** → falls through to `handleError` → **exit 2**.
- `writeTextRepairGuide` writes **only `process.stderr`**.
- JSON failure/success: `writeStructuredRecord` with `stream: 'change-transition'`, `event.type: 'complete'`.
- `resolveNextTarget('signed-off')` returns `'archivable'`.
- GetStatus calls pass `refreshImplementationTracking: false`.
- Execute input: `{ name, to, skipHookPhases }` — no approval flags.

Consistent with `core:transition-checks` check bus and no pending rewrite.

### Discrepancies

1. **major — `docs/cli/cli-reference.md` contradicts merged spec + code (also `default:_global/docs`).**
   - Line ~124: Repair Guide rendered **to stdout**. Spec + code: **stderr**.
   - Lines ~144–155: transition uses the **same hook-progress presentation** as `run-hooks`; JSON hook events use **`stream: "hook-progress"`**, lifecycle uses `change-transition`. Spec: transition MUST use check bus only; MUST NOT emit `hook-progress`; commands MUST NOT advertise the same public JSON stream name.
   - `--next` table omits **`signed-off → archivable`** (required in spec “Invalid transition error” / verify).
   - `default:_global/docs`: “Changes to a command's documented output contract MUST update `docs/cli/` in the same change.” Docs still describe the old contract. **Spec/code correct; docs wrong.**

2. **minor — spec internal: Purpose vs requirements.** Purpose still says transitions “transparently **routing through approval gates**”. Requirements forbid CLI rewrite to `pending-*`. Spec body vs purpose. Code matches requirements.

3. **minor — Next-transition resolution list incomplete.** The bullet map under that requirement lists `done → archivable` but not `signed-off → archivable`. The later Invalid-transition requirement does. Code implements signed-off. **Spec incomplete in the first list; later requirement + code correct.**

4. **minor — verify vs code: execute call shape.** Verify “Transition execute omits approval flags” says `TransitionChange.execute` is called with `{ name, to }` **only**. Implementation always passes `skipHookPhases` (empty set by default). Approval flags are correctly omitted. **Verify over-constrained; code correct.**

5. **nit — Commander description** still reads `designing → ready → implementing → verifying` and does not mention in-place gates. Help JSON schema for the stream is accurate.

### Test Coverage

`packages/cli/test/commands/change-transition.spec.ts`, `packages/cli/test/commands/change/change-transition.spec.ts`, `packages/cli/test/handle-error.spec.ts`, plus overlapping cases in `change.spec.ts`.

Covered:

- `--next` from ready stays ready / no pending; **signed-off → archivable**.
- JSON NDJSON `stream: 'change-transition'` including check-start/progress/done + complete.
- Repair guide **on stderr** for InvalidStateTransitionError and other typed errors; refresh skipped.
- Hook fail: check bus `✗ Running pre hooks`, **exit 2**, no `Executing:`.
- `handleError(HookFailedError)` → exit 2.

### Missing Tests

- Verify: “stdout does not contain the repair guide” — tests never `expect(stdout()).not.toContain('repair guide:')`.
- Verify: HookFailedError **stderr does not contain `repair guide:`** — exit 2 + check bus covered; explicit negative assertion missing.
- `--next` from `archiving` (spec mentions it; verify lists pending/archivable only).

### Spec Dependency Chain

Aligns with `core:transition-checks` (no pending rewrite; check bus; HookFailedError not a repair-guide error). Conflicts with **published** `docs/cli/cli-reference.md` (see discrepancy 1).

### Counts (`cli:change-transition`)

- Requirements: **14**
- Implemented: **14**
- Partial: **0**
- Missing: **0**
- Discrepancies: **5** (0 critical, **1 major**, 3 minor, 1 nit)
- Test gaps: **3**

---

## Spec: `cli:change-approve`

### Requirements Summary

| #   | Requirement                    | Intent                                                                                                                                      |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + format                                                                                            |
| 2   | Delegates gate state to kernel | only `{ name, reason }`; `kernel.changes.approve*`                                                                                          |
| 3   | Artifact hash computation      | CLI must not hash                                                                                                                           |
| 4   | Approve spec behaviour         | binding `from` currently `ready`; drain `pending-spec-approval`; stay in ready; no print of hop to pending; help uses bound-`from` language |
| 5   | Approve signoff behaviour      | `done` / drain `pending-signoff`; stay in done                                                                                              |
| 6   | Output on success              | text `approved <gate> for <name>`; JSON `{ result, gate, name }`                                                                            |
| 7   | Error cases                    | missing reason / wrong state / not found → exit 1                                                                                           |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/approve.ts`.

- Help: “Record spec-gate consent for a change in **ready** (pending-spec-approval remains valid for **drain**)” and analogous signoff/`done`.
- `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` — no hashes, no gate flags.
- Success text/JSON as specified; does not print `pending-*` on success.

Consistent with `core:transition-checks` in-place consent.

### Discrepancies

None between merged spec and CLI implementation.

**nit — hash scenario is owned by core.** CLI tests cannot see `artifactHashes` on disk events without a real use case; verify “Hashes computed by use case from disk” is a core concern. CLI correctly does not pass hashes.

### Test Coverage

`packages/cli/test/commands/change-approve.spec.ts`, `packages/cli/test/commands/change/change-approve.spec.ts`.

- `{ name, reason }` only; stay-in-ready copy (no pending in stdout); drain from pending still invoked; missing reason / unknown sub-verb; JSON success; not found.

### Missing Tests

- Explicit signoff-from-`done` stay-in-done stdout assertion (signoff tests exist; weaker than spec-from-ready).
- Help-text assertion for bound-`from` language (implemented; not asserted).

### Spec Dependency Chain

Matches `core:transition-checks` / `core:change` (approvals as records, not parking hops).

### Counts (`cli:change-approve`)

- Requirements: **7**
- Implemented: **7**
- Partial: **0**
- Missing: **0**
- Discrepancies: **1** (nit)
- Test gaps: **2**

---

## Spec: `cli:change-archive`

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                                                                                                                             |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Command signature            | `changes archive` + singular alias; skip-hooks pre/post/all; allow-overlap                                                                                                                                         |
| 2   | Prerequisites                | must be `archivable`; else exit 1 + current state                                                                                                                                                                  |
| 3   | Behaviour                    | delegate ArchiveChange                                                                                                                                                                                             |
| 4   | Hook execution               | skip-hooks → ArchiveChangeInput                                                                                                                                                                                    |
| 5   | Check progress rendering     | gerund bus; hooks on same bus; no `Executing:`                                                                                                                                                                     |
| 6   | Post-archive hooks           | post-hook failures → **exit 2**                                                                                                                                                                                    |
| 7   | Output on success            | text path + optional invalidated section                                                                                                                                                                           |
| 8   | Output on success (extended) | overlap listing                                                                                                                                                                                                    |
| 9   | JSON output on success       | **`stream: "change-archive"`**, `event.type: "complete"`, `event.result` with `result/ok`, `name`, `archivePath`, `invalidatedChanges`; progress records **precede** complete; **no second unwrapped JSON object** |
| 10  | Error cases                  | not found / not archivable / merge fail → 1                                                                                                                                                                        |

### Implementation Status

**Implemented** in `packages/cli/src/commands/change/archive.ts`.

- `createCheckProgressPresenter({ streamName: 'change-archive', … })` — **not** `_hook-progress-presenter`.
- JSON success: `writeStructuredRecord({ stream: 'change-archive', event: { type: 'complete', result: { result: 'ok', name, archivePath, invalidatedChanges } } })`.
- `postHookFailures.length > 0` → `cliError(..., 2)`.
- Text progress on stderr; success line on stdout.

Aligned with `core:transition-checks` generic progress bus.

### Discrepancies

1. **major — Commander `--help` JSON schema vs merged spec + code.** `addHelpText` still documents:

   ```
   Terminal record:
     { result: "ok", name: string, archivePath: string }
   ```

   Spec requires a **stream envelope** (`stream: "change-archive"`, `event.type: "complete"`). Code emits the envelope. **Help is stale (spec/code correct; help wrong).** Also violates `default:_global/docs` CLI contract-in-same-change if this help is treated as the operator contract (help is in-binary, not `docs/cli/`, but same class of drift).

2. **major — merged `verify.md` not updated to the stream complete record.** Scenario “JSON output on success” still: “stdout is valid JSON with `result` equal to `"ok"`, `name`, `archivePath`” with **no** `stream` / `event.type`. Implementation + unit test parse `parsed.stream === 'change-archive'` / `parsed.event.result`. **Spec.md vs verify.md: spec.md + code correct; verify.md stale.** Callers using verify literally would reject compliant NDJSON.

3. **minor — spec.md “Output on success” still has placeholder fragments** (“prints to stdout: The invalidated changes section is omitted…”, “outputs the following… where `<archive-path>`”). Incomplete sentences in the merged spec body. Code implements the intended behaviour.

4. **nit — JSON unit test uses `JSON.parse(stdout())` as a single object.** That only works when **no** progress records were emitted. Spec says progress MUST precede complete. Implementation is NDJSON when progress exists; the happy-path JSON test never emits progress, so it does not lock the “no second unwrapped object / NDJSON” contract.

### Test Coverage

`packages/cli/test/commands/change-archive.spec.ts`.

- Stream complete record (no progress).
- Text path; invalidated listing; skip-hooks mapping; post-hook **exit 2**; gerund progress + hook lines on stderr; no `Executing:`.

### Missing Tests

- JSON/TOON **NDJSON**: progress `stream: change-archive` records **then** `complete` (parse line-by-line, not whole stdout).
- Verify-aligned assertion that callers must not expect a trailing unwrapped `{ result: "ok" }` after the stream.
- `toon` format complete record (json covered).

### Spec Dependency Chain

Depends on `core:transition-checks` for the bus. CLI rendering matches. Archive JSON contract is internally inconsistent (spec.md vs verify.md vs help).

### Counts (`cli:change-archive`)

- Requirements: **10**
- Implemented: **10**
- Partial: **0**
- Missing: **0**
- Discrepancies: **4** (0 critical, **2 major**, 1 minor, 1 nit)
- Test gaps: **3**

---

## Spec: `skills:skill-templates-source`

### Requirements Summary (lifecycle-relevant + rest)

Focus of this change: **In-place approval gates in workflow templates**. Other requirements (template layout, Handlebars, graph impact wording, frontmatter, metadata self-healing, optimizer gating, command roles) remain in the merged spec.

**In-place gates (binding):**

- Templates MUST describe gates on `ready` / `done`; MUST NOT teach `change transition` into `pending-*` as happy path.
- `shared.md.tpl`: agents NEVER `changes approve`; stay in ready/done; pending = **drain only**; hooks MUST NOT list pending as happy-path intermediates.
- `specd-design`: stay in `ready`; no hop to `pending-spec-approval`.
- `specd-implement`: must not `transition implementing` from ready while spec gate unsatisfied.
- **`specd-verify`: stay in `done`; MUST NOT say transition “routes to `pending-signoff`”; still owns `done → archivable` after consent.**
- `specd-new`: pending rows drain-only; ready/done + unsatisfied gate → approve, not parking.
- `specd` / `specd-archive`: in-place mention; no parking hops.

### Implementation Status

**Focus requirement: implemented** in templates:

| Template                       | Evidence                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `specd-verify/SKILL.md.tpl`    | “If signoff=on: **stay in `done`**”; “Do not `change transition` into `pending-signoff`”; **no** “routes to `pending-signoff`” |
| `specd-design/SKILL.md.tpl`    | Stay in `ready`; do not transition into pending-spec-approval                                                                  |
| `specd-implement/SKILL.md.tpl` | stay in `ready`; do not `transition implementing` while gated                                                                  |
| `specd-new/SKILL.md.tpl`       | table: `pending-spec-approval` / `pending-signoff` **Drain only**                                                              |
| `specd/SKILL.md.tpl`           | in-place on ready/done; do not transition into pending                                                                         |
| `specd-archive/SKILL.md.tpl`   | in-place on `done`; not a transition into pending-signoff                                                                      |
| `shared.md.tpl`                | **stays** in ready/done; pending MAY appear as drain; do not list pending as happy-path intermediates                          |

`packages/skills/test/template-workflow.spec.ts` `does not teach pending parking as the happy-path wait` asserts verify `not.toMatch(/routes to \`pending-signoff\`)`, stay in done, drain-only table, design stay in ready, shared stay-in-state, archive in-place.

**Remainder of the spec** (layout, graph `--direction`, `--snippet`, frontmatter, optimizer gating, command roles): not fully re-walked file-by-file in this batch. Existing `template-workflow.spec.ts` still covers command-role and optimizer/metadata gating scenarios in verify.md.

### Discrepancies

None for the in-place-gates requirement vs templates vs `core:transition-checks`.

**nit:** `specd/SKILL.md.tpl` still says “This skill … **routes to** the right skill” (skill dispatcher, not signoff). Harmless; the forbidden phrase is specifically “routes to `pending-signoff`”.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts` — in-place gates + several other template contracts.

### Missing Tests

- Positive assertion that verify still owns **`done → archivable`** after signoff (template contains `transition … archivable`; test does not assert that ownership sentence).
- Shared “MUST NOT run `source.post` on `along` backward” is asserted; good.

### Spec Dependency Chain

Matches `core:transition-checks` (in-place gates; pending drain-only). No CLI/skills contradiction on parking hops.

### Counts (`skills:skill-templates-source`)

- Requirements (merged spec headings): **16** (including In-place approval gates)
- Focus requirement implemented: **yes**
- Remainder: **not exhaustively re-audited this batch** (no additional lifecycle discrepancies found in templates searched for `pending-signoff` / `pending-spec-approval` / `routes to`)
- Discrepancies (lifecycle): **1 nit**
- Test gaps (lifecycle): **1**

---

## Consistency: `core:transition-checks` (previewed, not counted as this batch’s primary spec)

CLI/skills behaviour checked against merged core:

| Core rule                                                     | CLI/skills                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| No `change transition` into pending                           | CLI does not rewrite targets; skills forbid parking hops                  |
| Stay in ready/done until Approve\*                            | approve CLI + skill copy                                                  |
| Check bus + gerund labels                                     | `_check-progress-presenter`; status/repair labels                         |
| Hooks on same bus                                             | transition/archive map hook events to check-progress                      |
| `_hook-progress-presenter` not the transition public contract | **only `run-hooks.ts` + unit tests import `createHookProgressPresenter`** |
| `HookFailedError` abort                                       | `handleError` exit 2; transition does not attach repair guide             |

No CLI/skills contradiction with core on these points. **Docs** still describe the pre-check-bus hook-progress stream for `change transition`.

---

## Consistency: `default:_global/docs`

Requirement: command output-contract changes MUST update `docs/cli/` in the same change.

**Failing artifacts:**

- `docs/cli/cli-reference.md` — Repair Guide **stdout**; transition JSON **`stream: "hook-progress"`** for hooks; `--next` map missing `signed-off → archivable`.
- `docs/cli/cli-reference.md` run-hooks section saying it **shares the same live presentation as change transition** is now only true at a high level (both show live output) and **false** as a public stream contract.

Guide/core docs (`docs/guide/workflow.md`, `docs/core/use-cases.md`) correctly describe drain-only pending and in-place approve. Drift is concentrated in **CLI reference output contract**.

---

## Focus checklist (requested)

| Focus                                                   | Result                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repair on stderr                                        | **Code + unit tests: stderr.** Docs still say stdout. Missing stdout-negative test.                                                        |
| Check bus `stream: change-transition`                   | **Implemented + tested.** Docs still mention `hook-progress` for transition hooks.                                                         |
| HookFailedError exit 2                                  | **`handleError` + transition tests.** Missing “no repair guide” assertion.                                                                 |
| `--next` signed-off → archivable                        | **Code + test.** Spec first `--next` list omits it; docs omit it.                                                                          |
| Archive JSON success = stream `change-archive` complete | **Code + test.** Help + **verify.md** still describe unwrapped JSON.                                                                       |
| Skills stay-in-ready/done                               | **Templates + contract test.**                                                                                                             |
| Pending drain-only                                      | **specd-new table + shared.md.tpl.**                                                                                                       |
| specd-verify MUST NOT say routes to pending-signoff     | **Absent in template; test forbids the phrase.**                                                                                           |
| `_hook-progress-presenter` is run-hooks only            | **Confirmed:** importers are `run-hooks.ts` and `_hook-progress-presenter.spec.ts`. Transition/archive use `_check-progress-presenter.ts`. |

---

## Batch totals (this partial)

| Spec                          | Reqs   | Impl                                               | Disc. (crit/maj/min/nit) | Test gaps |
| ----------------------------- | ------ | -------------------------------------------------- | ------------------------ | --------- |
| cli:change-status             | 16     | 16                                                 | 0/0/1/1                  | 2         |
| cli:change-transition         | 14     | 14                                                 | 0/1/3/1                  | 3         |
| cli:change-approve            | 7      | 7                                                  | 0/0/0/1                  | 2         |
| cli:change-archive            | 10     | 10                                                 | 0/2/1/1                  | 3         |
| skills:skill-templates-source | 16     | focus yes                                          | 0/0/0/1                  | 1         |
| **Sum**                       | **63** | **63 impl (skills remainder not fully re-walked)** | **0 / 3 / 5 / 5**        | **11**    |

Highest-severity: **docs + archive help + archive verify.md** lag the implemented stream/stderr contracts. Runtime CLI/skills match `core:transition-checks` for the focus items.
