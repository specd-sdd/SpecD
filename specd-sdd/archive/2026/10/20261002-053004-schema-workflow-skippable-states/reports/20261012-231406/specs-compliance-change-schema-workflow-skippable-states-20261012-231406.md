# Specs compliance — change schema-workflow-skippable-states

- Verification mode: `full`
- Verification attempt: `verification-attempt-7`
- Change state: `verifying`
- Audit scope: proposal and design intent, merged specs, dependency/global contracts, implementation, and tests
- Overall verdict: **FAIL — issues found**
- Specs audited: **25**
- Findings: **7** — **2 HIGH**, **5 MEDIUM**, **0 LOW**
- Missing or insufficient test areas: **11**
- Focused automated evidence: **2,087 passing tests**, **0 failures** across the delegated suites
- Repository gates: lint passed; typecheck passed (25/25 tasks)

## Executive conclusion

The implementation materially realizes optional and disabled workflow topology, sovereign `change.schemaName` resolution, dynamic checks, bypass handling, and Core/CLI next-step routing. It is not fully faithful to the proposal yet: lifecycle skill recipes still hard-code canonical targets and hooks after declaring dynamic routing, one directly affected standard-schema requirement still demands obsolete approval parking states, and several medium contract/test gaps remain.

Because the full audit found issues, this report leaves `verification-attempt-7` active and does not complete verification or advance the lifecycle.

## Detailed findings

The following delegated partial reports are reproduced verbatim and remain the source evidence for this consolidated verdict.

---

<!-- BEGIN VERBATIM _partial-foundation.md -->

# Partial compliance audit — foundation

Change: `schema-workflow-skippable-states`  
Verification attempt: `verification-attempt-7` (delegated; this audit did not start or complete it)  
Scope: `core:workflow-model`, `core:check-registry`, `core:transition-checks`, `core:workflow-topology`, `core:lifecycle-engine`, `schema-std:standard-schema`, their direct dependencies, proposal/design intent, implementation, and focused tests.

## Requirements Summary

The six merged specs contain 69 requirement groups and 184 verification scenarios:

| Spec                         | Requirements | Scenarios | Overall result                                                                                                                  |
| ---------------------------- | -----------: | --------: | ------------------------------------------------------------------------------------------------------------------------------- |
| `core:workflow-model`        |           14 |        50 | Mostly implemented; one centralization deviation inherited through transition classification                                    |
| `core:check-registry`        |            7 |        24 | Mostly implemented; plugin-name contract mismatch and effective-binding governance metadata issue                               |
| `core:transition-checks`     |           19 |        50 | Mostly implemented; progress-axis authority is duplicated instead of topology-owned                                             |
| `core:workflow-topology`     |            6 |        13 | Implemented for tested canonical/optional/disabled paths; order-edge coverage is incomplete                                     |
| `core:lifecycle-engine`      |           12 |        34 | Implemented for the audited topology/routing surface                                                                            |
| `schema-std:standard-schema` |           11 |        13 | Implementation and proposal align, but the merged spec/verify artifact still contradicts them on legacy approval parking states |

The proposal's central intent is visible in code: workflow steps support `optional`/`disabled`, bypass checks have their own `step-skip` scope, topology queries require approval snapshots, verification can be disabled, schema-declared checks are parsed and composed dynamically, change schema identity is treated as sovereign by the changed consumers, and lifecycle guidance can route around disabled steps.

## Implementation Status

### Implemented and evidenced

- `WorkflowStep` exposes `optional`, `disabled`, `checks`, and `skipChecks`; the YAML parser preserves both check blocks.
- `buildSchema` rejects unknown and duplicate check coordinates and enforces check-level/binding-level `allowBindingOverride`, `allowConfigOverride`, and `allowDisable` restrictions for both transition and step-skip declarations.
- `mergeSchemaLayers` collision-safely appends `checks` and `skipChecks`; collisions cannot silently replace prior declarations, and removal does not expose an erasure path for these arrays.
- `WorkflowTopology` is a pure domain service with approval-aware `orderedPipeline`, `legalTransitions`, `isLegalTransition`, `bypassedSteps`, and `nextForwardStep` signatures.
- Bedrock disablement and active approval-anchor disablement throw `SchemaValidationError`.
- Optional intermediate steps produce shortcut targets; disabled destinations are removed; bypass detection excludes disabled steps.
- `CheckAttempt`/`CheckApplicability` model `scope: 'step-skip'`; built-in implementation-bypass bindings exist.
- `resolveEffectiveBindings` overlays destination `checks`, bypassed-step `skipChecks`, disabled declarations, and deep-merged config.
- Lifecycle verdict/guidance consumes topology-derived legal/forward targets and includes disabled-verification routing tests.
- `schema-std/schema.yaml` explicitly carries `optional: false` and `disabled: false` on its declared workflow steps and remains backward-compatible in default behavior.

### Focused execution evidence

Executed:

```text
pnpm --filter @specd/core exec vitest run \
  test/domain/services/workflow-topology.spec.ts \
  test/domain/services/transition-checks.spec.ts \
  test/domain/services/check-registry.spec.ts \
  test/domain/services/build-schema.spec.ts \
  test/infrastructure/schema-yaml-parser.spec.ts \
  test/domain/services/lifecycle-verdict.spec.ts
```

Result: **6 files passed, 243 tests passed**.

## Discrepancies

### HIGH — `schema-std:standard-schema` still requires obsolete approval states as workflow rows

The merged `schema-std:standard-schema` requirement and its verification scenario say the standard workflow SHALL contain `pending-signoff` and `signed-off` (and describe explicit transitions for them). The merged `core:workflow-model` explicitly says approval states are drain-only historical states and **MUST NOT** be introduced as `workflow[]` entries. The proposal repeats that approval gates remain checks on `ready`/`done`, not workflow parking steps. The actual standard schema declares only `designing`, `ready`, `implementing`, `verifying`, and `archiving` (`packages/schema-std/schema.yaml:643-725`), which is consistent with proposal/core intent and inconsistent with its own merged standard-schema artifact.

Impact:

- Specs are mutually contradictory, so no implementation can satisfy both literally.
- The standard-schema scenario “Standard lifecycle steps and transitions are defined” is not represented by a test that asserts its stated list; such a literal test would currently fail.
- Archiving this change would preserve a knowingly false requirement/scenario in a directly affected spec.

Interpretation: code is likely correct and `schema-std:standard-schema` is stale, because the proposal/design and the newer workflow-model contract consistently establish delivery-edge approvals. This requires artifact correction, not a code change alone.

### MEDIUM — plugin namespace validation is stricter than the merged registry contract

`core:check-registry` requires plugin names to match `^[a-zA-Z0-9_-]+$`. Implementation uses `const PLUGIN_NAME_REGEX = /^[a-z][a-z0-9-]*$/` at `packages/core/src/domain/services/check-registry.ts:18`.

Observable mismatches:

- Spec-valid names starting with an uppercase letter or digit are rejected.
- Spec-valid names containing `_` are rejected.
- Existing tests cover ordinary lowercase names and invalid punctuation, but do not exercise uppercase, leading-digit, or underscore names.

Either the implementation must accept the documented grammar or the spec must deliberately narrow the grammar. The proposal does not justify this narrowing.

### MEDIUM — transition direction still has a second topology implementation

The merged `core:transition-checks` contract says the progress axis and `along` classification SHALL be derived directly from `WorkflowTopology.orderedPipeline(schema, approvals)`. Instead, `transition-checks.ts` retains a private `buildAxis(workflowSteps, disabledSteps)` with its own fallback insertion (`packages/core/src/domain/services/transition-checks.ts:149-184`), and `classifyAlong` calls that helper (`:195-225`). Callers pass projected workflow names/disabled lists rather than the sovereign schema plus approval snapshot.

Current focused tests show compatible behavior for the covered canonical omissions and disabled steps, so this is not presently demonstrated as a failing transition. It nevertheless violates the explicit single-authority design and leaves two algorithms capable of drifting on declared order, approval-anchor validation, or future topology changes—the exact architectural failure this proposal intended to remove.

### MEDIUM — synthesized effective bindings advertise relaxed governance locks

When `resolveEffectiveBindings` synthesizes a binding for an unbound registered check, it hardcodes `allowBindingOverride: true`, `allowConfigOverride: true`, and `allowDisable: true` for transition bindings (`packages/core/src/domain/services/transition-checks.ts:668-689`) and step-skip bindings (`:730-749`). Those values do not come from `registry.getGovernance(checkId)`.

`buildSchema` currently prevents a forbidden declaration before runtime, which limits immediate exploitability. However, the returned effective binding no longer faithfully represents check-level governance. This conflicts with the merged monotonic-lock requirement (“once false, cannot be erased or relaxed”) and creates a future bypass risk for any downstream composition or inspection that trusts effective binding metadata.

Recommended correction: propagate the most restrictive values from check governance and any matching coordinate rather than stamping all three capabilities `true`; add assertions on synthesized binding governance, not only execution/config behavior.

## Test Coverage

Strong coverage exists for:

- parsing all `checks`/`skipChecks` fields and rejecting malformed enums;
- semantic governance failures (`UnknownCheckError`, duplicate coordinate, embedding/policy/config/disable locks);
- step-skip matching/isolation and standard built-in bindings;
- cascaded configuration and disabled check omission;
- optional and disabled topology, approval snapshots, bypass detection, and next-forward behavior;
- disabled-verification lifecycle routing;
- schema layer collision preservation;
- validity/lifecycle projection scenarios in the audited foundation.

Focused suite status is green (243/243). This proves the existing test contract, but not the contradictory or absent cases below.

## Missing Tests

1. `CheckRegistry.register` accepts every plugin name allowed by the merged regex: uppercase, leading digit, and underscore; or, if intentionally narrowed, a revised spec plus explicit rejection tests.
2. A standard-schema conformance test that compares the actual `workflow[].step` list to the merged scenario. Today it would expose the stale `pending-signoff`/`signed-off` expectation.
3. A test proving `classifyAlong` obtains its axis from `WorkflowTopology.orderedPipeline` (including the exact approval snapshot) rather than a parallel fallback algorithm.
4. A test asserting synthesized transition and step-skip bindings preserve check-level `allowBindingOverride`, `allowConfigOverride`, and `allowDisable` false values.
5. Noncanonical declared-order tests for `WorkflowTopology.orderedPipeline`. The implementation starts from declaration order and only splices missing canonical states (`workflow-topology.ts:272-299`); the current suite does not resolve the tension between “declared order” and “bedrock states in canonical progression order.”
6. Invalid `checks[].from` lifecycle-name coverage. The parser accepts any string and the semantic validator does not visibly reject unknown source states; the public type promises `ChangeState | '*'`.

## Dependency and Intent Conformity

- **Architecture:** The audited services remain in the domain/application layers without new infrastructure I/O. Registry/topology services are pure, consistent with `default:_global/architecture`.
- **Workflow model dependency:** Topology consumes `Schema` and canonical `ChangeState`; approval snapshots are threaded through all pipeline-derived public queries as required by the corrective design.
- **Check registry dependency:** Runtime composition uses registry catalog/default config and build-time governance. The hardcoded synthesized lock values are the main dependency-contract leak.
- **Schema-format dependency:** Parser/build pipeline preserves new fields and rejects major semantic violations.
- **Proposal intent:** Optional/disabled topology, separated bypass checks, sovereign schema authority, and routing around skipped phases are materially implemented. The retained local axis algorithm only partially fulfills the stated centralization objective.
- **Standard schema intent:** Default runtime behavior remains conservative (`optional: false`, `disabled: false`). The standard-schema artifact's legacy parking-state wording contradicts both the proposal and the implemented schema.

## Counts and Verdict

- Specs audited: **6**
- Requirement groups audited: **69**
- Scenarios reviewed: **184**
- Focused tests executed: **243 passed, 0 failed**
- Discrepancies: **4 total** — **1 HIGH**, **3 MEDIUM**, **0 LOW**
- Missing/insufficient test areas: **6**

**Delegated compliance result: FAIL / issues found.** The foundation is broadly implemented, but full compliance should not be declared while the directly affected standard-schema spec contradicts the proposal/core model and while the three implementation-contract deviations above remain unresolved.

<!-- END VERBATIM _partial-foundation.md -->

---

<!-- BEGIN VERBATIM _partial-usecases.md -->

# Compliance audit — change-scoped Core use cases

## Scope and method

- Change: `schema-workflow-skippable-states`
- Delegated verification attempt: `verification-attempt-7` (this audit did not start or complete the attempt)
- Specs audited: `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, and the sovereign-schema additions to `core:change`
- Sources of intent: the change proposal, design, merged spec previews/deltas, implementation, and tests
- Navigation: fresh code graph (`stale: false`, `fingerprintMismatch: false`, coverage complete) followed by targeted source/test inspection
- Executed evidence: 16 targeted Core test files, **560 tests passed**

## Executive result

The production implementation is compliant with the proposal's central intent: an existing change is governed by the immutable schema identity recorded in its manifest, not by the workspace default. All assigned change-scoped use cases resolve the schema with `SchemaProvider.get(change.schemaName)` (or the archived/draft equivalent), and the schema-dependent decisions consume the resolved value.

The previous legacy branch in `EditChange` is gone: scope edits use one compatibility lookup before mutation, `replaceSpecIds()` inside the serialized reconciler mutation, and `ctx.reconcileAfter()` as the single owner of artifact-DAG and validity synchronization. No second direct schema lookup or `updateSpecIds()` call remains in the use case.

One **MEDIUM test-compliance finding** remains: the test named as EditChange reconciliation-failure atomicity rejects before invoking the mutation callback, so it does not exercise the specified failure point after `replaceSpecIds()` and during `ctx.reconcileAfter()`. Production structure appears atomic by construction, but the required scenario is not proven by that test.

## Findings

### MEDIUM — EditChange atomicity scenario does not reach reconciliation after the scope mutation

**Spec/intent**

`core:edit-change` requires that a reconciliation error prevent persistence of a partial scope edit. The merged verification scenario says that when reconciliation fails after replacing the fresh change's spec scope, the persisted scope remains unchanged. The corrective design likewise calls for explicit reconciliation-failure atomicity coverage.

**Evidence**

- Production path in `packages/core/src/application/use-cases/edit-change.ts` is structurally correct: `_executeScopeEdit()` calls `_reconcile.mutate(...)`; its callback calls `freshChange.replaceSpecIds(specIds)` and then awaits `ctx.reconcileAfter(...)`.
- The test `keeps the persisted scope atomic when reconciliation rejects` in `packages/core/test/application/use-cases/edit-change.spec.ts` replaces the whole reconciler with `mutate: vi.fn(async () => Promise.reject(failure))`.
- Consequently, the callback supplied by `EditChange` is never invoked. The test proves only that an error before mutation leaves the repository unchanged; it does **not** prove rollback when `ctx.reconcileAfter()` rejects after `replaceSpecIds()` has modified the fresh aggregate.

**Risk**

The repository/reconciler transaction may already provide the correct rollback semantics, and no production defect was observed. However, a regression that persisted the mutated aggregate before a failed `reconcileAfter()` would not be caught by the current test, contrary to the explicit scenario and corrective-pass intent.

**Recommended correction**

Use a real or transaction-faithful `ReconcileChangeValidity.mutate` fixture that invokes the callback against a fresh aggregate, makes `ctx.reconcileAfter()` reject, and then asserts both persisted `specIds` and relevant history/artifact state are unchanged. Also assert the callback reached `replaceSpecIds()` before the injected failure.

## Per-spec compliance matrix

| Spec                                  | Production implementation                                                                                                                                                                   | Test evidence                                                                                                                      | Result           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `core:change-manifest`                | `FsChangeRepository` hydrates `manifest.schema` into `Change`; name mismatch with active workspace schema is no longer rejected; version warning is only emitted for the same schema name   | Explicit hydration test with a different active schema name; version-warning coverage                                              | PASS             |
| `core:validate-artifacts`             | Resolves `this._schemaProvider.get(change.schemaName)` before schema-driven validation                                                                                                      | Success path asserts the recorded schema reference; failure propagation covered                                                    | PASS             |
| `core:run-step-hooks`                 | Active and archived paths resolve the recorded `schemaName`; hook lookup uses that schema                                                                                                   | Active sovereign-reference success and missing-schema failure covered                                                              | PASS             |
| `core:preview-spec`                   | Resolves `change.schemaName`; parser/delta behavior uses the returned schema                                                                                                                | Custom-schema success asserts the sovereign reference                                                                              | PASS             |
| `core:get-status`                     | Active and draft paths resolve their recorded schema names; active failure degrades read-only; lifecycle projection uses resolved schema                                                    | Positive two-schema test proves disabled `verifying` comes from `custom-workflow`, not workspace default; failure behavior covered | PASS             |
| `core:archive-change`                 | Resolves `loadedChange.schemaName` before reconciliation/archive checks; returned-schema mismatch remains a deliberate `schema.nameMatch` predicate failure, not a workspace-default lookup | Positive two-schema successful archive, mismatch defense, and failure coverage                                                     | PASS             |
| `core:approve-spec`                   | Gate guard resolves `change.schemaName` and propagates lookup failures                                                                                                                      | Sovereign-reference success plus guard/failure scenarios                                                                           | PASS             |
| `core:approve-signoff`                | Gate guard resolves `change.schemaName` and propagates lookup failures                                                                                                                      | Sovereign-reference success plus guard/failure scenarios                                                                           | PASS             |
| `core:compile-context`                | Resolves `change.schemaName`; instructions/artifact context use the resulting schema                                                                                                        | Sovereign-reference success and missing-schema behavior                                                                            | PASS             |
| `core:get-artifact-instruction`       | Resolves `change.schemaName`; artifact rules/instructions come from that schema                                                                                                             | Custom-schema reference asserted on success                                                                                        | PASS             |
| `core:get-hook-instructions`          | Uses active or archived record's `schemaName` before reading workflow hooks                                                                                                                 | Positive two-schema test proves both active and archived results return only the sovereign hook                                    | PASS             |
| `core:edit-change`                    | Single pre-mutation compatibility lookup; fresh aggregate uses `replaceSpecIds()`; `ctx.reconcileAfter()` owns DAG/validity sync; no dead second lookup/update branch                       | Sovereign compatibility and single-lookup coverage pass, but reconciliation-failure atomicity test does not invoke the callback    | PARTIAL — MEDIUM |
| `core:invalidate-change`              | Loads change, resolves `change.schemaName`, and derives focused/downstream/global targets from `schema.artifacts()`; resolution precedes persistence                                        | Sovereign-reference and no-persistence-on-resolution-failure tests pass                                                            | PASS             |
| `core:count-tasks`                    | Resolves `input.change.schemaName`; task artifacts/patterns come only from that schema                                                                                                      | Two-schema task-pattern test and no-fallback failure test                                                                          | PASS             |
| `core:change` (`StartVerification`)   | Resolves `change.schemaName` before readiness checks; failure cannot create an attempt                                                                                                      | Sovereign readiness and no-attempt-on-failure tests                                                                                | PASS             |
| `core:change` (validity fingerprints) | Every artifact-bearing fingerprint API resolves `change.schemaName`; there is no fallback                                                                                                   | Cross-API sovereign artifact selection and failure-without-evidence tests                                                          | PASS             |

## Intent traceability

The proposal's concern 10 and proposed solution 12 are materially realized, rather than merely mirrored in method signatures:

1. The manifest retains immutable schema identity and repository hydration permits a workspace-default name mismatch.
2. Operational use cases fetch by the change/archived/draft schema name.
3. Schema-dependent outputs are demonstrably different in strong positive tests: GetStatus topology, ArchiveChange success, GetHookInstructions hook selection, CountTasks task pattern selection, StartVerification readiness, and validity fingerprint artifact selection.
4. Failure paths do not retry with the default schema or persist cross-schema decisions/evidence.
5. `InvalidateChange` threads the sovereign artifact DAG into direct, downstream, and global target construction.
6. `EditChange` delegates post-scope artifact topology and validity to canonical reconciliation, eliminating the duplicated synchronization path identified by the full-compliance corrective pass.

No contradiction was found between these change specs and their declared dependency/global contracts. The sovereign-schema rule strengthens, rather than violates, the global architecture boundary: schema lookup remains behind `SchemaProvider`, repositories preserve manifest facts, and application use cases orchestrate domain behavior without importing infrastructure.

## Test execution

Command scope: the 16 relevant Core suites for the assigned specs and supporting sovereign-schema services/repository.

- Test files: **16 passed / 16**
- Tests: **560 passed / 560**
- Failures: **0**

Passing tests do not clear the MEDIUM finding because the deficient atomicity test never exercises its stated failure point.

## Counts

- Specs audited: **15**
- Fully compliant specs: **14**
- Partially compliant specs: **1** (`core:edit-change`, test evidence only)
- Production implementation defects found: **0**
- Findings: **1 MEDIUM**, **0 HIGH**, **0 LOW**
- Assigned change verification scenarios inspected: **30**
- Targeted automated tests executed: **560**, all passing

## Verdict

**COMPLIANT WITH ONE MEDIUM TEST GAP.** The code realizes the proposal/design intent and the sovereign-schema contracts across the assigned use cases. Full compliance should remain blocked until the EditChange atomic rollback scenario is exercised at the real post-`replaceSpecIds()` reconciliation failure boundary.

<!-- END VERBATIM _partial-usecases.md -->

---

<!-- BEGIN VERBATIM _partial-delivery.md -->

# Partial compliance audit — delivery topology surfaces

- Change: `schema-workflow-skippable-states`
- Delegated attempt: `verification-attempt-7`
- Scope: `core:transition-change`, `cli:change-status`, `cli:change-transition`, `skills:workflow-automation`
- Method: merged change previews, depth-1 dependency declarations, global architecture/testing/conventions context, graph-first symbol discovery, direct implementation/test inspection, and focused test execution.
- Lifecycle ownership: delegated/read-only; this audit did not start or complete the attempt and did not mutate lifecycle, code, or specs.

## Executive result

**Not fully compliant.** Core and CLI implement the schema-driven topology correctly in the audited paths, including sovereign schema resolution, `to: 'next'`, bypass checks, and hook suppression. The lifecycle skill templates and generated copies contain new schema-aware routing prose, but their executable instructions still encode fixed targets in multiple later steps. Their tests mostly assert phrase presence and therefore do not prove the representative disabled/bypassed flows required by the design. A second, pre-existing merged-contract inconsistency remains around the deprecated `allowOutOfScope` / `allowOverlap` input booleans.

Severity counts: **1 HIGH, 1 MEDIUM**. No LOW findings.

## Requirements summary and implementation status

| Spec / requirement cluster                                                                                                             | Status             | Evidence                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-change` — `to: 'next'` uses the change's sovereign schema and `WorkflowTopology.nextForwardStep`                      | PASS               | `TransitionChange.execute` calls `SchemaProvider.get(change.schemaName)` and passes the resulting schema plus configured approvals to `nextForwardStep`; `HappyPathNextUnavailableError` covers no-hop states. Focused test proves disabled `verifying` resolves directly from `implementing` to `done` and asserts the requested schema name. |
| `core:transition-change` — bypassed-step checks, dynamic schema bindings, and no hooks for bypassed steps                              | PASS               | `bypassedSteps(...)`, `resolveEffectiveBindings(...)`, separate `step-skip` predicate evaluation, and effect matching only for the actual transition attempt implement the merged contract. Tests cover optional-step rejection/pass, custom schema `skipChecks`, target checks, and absence of `implementing` hooks on `ready -> verifying`.  |
| `cli:change-status` — project GetStatus topology without local re-filtering; optional annotation, disabled exclusion, shortcut display | PASS               | The command renders the lifecycle projection returned by Core. CLI tests prove `[optional]` rendering and `availableTransitions` preservation. No separate CLI protocol graph is used to replace Core's projection.                                                                                                                            |
| `cli:change-transition` — no target or `--next` passes `to: 'next'`; Core owns routing; typed failure is surfaced                      | PASS               | Command constructs `to: explicitTarget ?? 'next'` and delegates to `TransitionChange`; tests cover `to: 'next'` and explanatory failures for no-hop pending states.                                                                                                                                                                            |
| `skills:workflow-automation` — consume `nextAction.command` and `lifecycle.availableTransitions` dynamically                           | **PARTIAL / FAIL** | All four templates and `.agents` / `.codex` copies now contain a schema-aware routing section, but later operational steps still name fixed lifecycle targets (`ready`, `implementing`, `verifying`, `done`, `archivable`) and fixed target hooks without a concrete variable/branch derived from the refreshed status. See Finding D-1.       |
| `skills:workflow-automation` — never run hooks for bypassed/disabled intermediate steps                                                | **PARTIAL / FAIL** | Prose forbids skipped-step hooks, but the verify/design execution recipes still explicitly run hooks for canonical intermediate steps. There is no executable worked branch proving direct target hook selection. Existing tests cannot detect this contradiction. See Finding D-1.                                                            |
| Dependency/global conformance                                                                                                          | PASS with caveat   | Dependencies name `core:workflow-topology`, `core:transition-checks`, `core:get-status`, CLI status/transition and global architecture. Business routing remains in Core; CLI and skills delegate inward. The caveat is the contradictory transition input contract in Finding D-2.                                                            |

Requirement cluster counts: **5 PASS, 2 PARTIAL/FAIL** (7 audited clusters).

## Discrepancies

### D-1 — HIGH — Lifecycle skills state dynamic routing but still prescribe fixed-target hops and hooks

**Spec/design expectation**

The merged `skills:workflow-automation` contract requires skills to consume `nextAction.command` and `lifecycle.availableTransitions` dynamically, advance directly along the advertised legal path, and never execute hooks for a bypassed or disabled intermediate. The corrective design is more explicit: refresh status before advancement, select the actual target from `availableTransitions`, run hooks only for the actual source/target, transition with `--skip-hooks all`, and test disabled-`verifying` plus optional-`implementing` representative flows.

**Implementation evidence**

The four templates have a good introductory routing rule and the generated `.agents` / `.codex` copies carry it. However, later imperative recipes remain static:

- `specd-design` always runs `ready` pre-hooks and transitions to `ready` after artifacts.
- `specd-implement` always enters `implementing` from `ready` and, on completion, always tells the user to invoke verify; it does not show a direct selected-target transition for an optional implementation bypass.
- `specd-verify` explicitly runs `verifying` hooks/transition from `implementing`, then fixed `done` hooks/transition, then fixed `archivable` hooks/transition. If `verifying` or `done` is disabled/bypassed, these later commands contradict the opening rule.
- `specd-archive` is less exposed because it is intentionally entered only at `archivable`/`archiving`, but its routing section is still only a guard; it provides no common actual-target algorithm shared with the other lifecycle skills.

The result depends on an agent reconciling contradictory prose rather than on an unambiguous executable protocol. This is precisely the failure mode the proposal intended to remove (hardcoded topology causing stalls/loops or hooks on non-visited phases).

**Test evidence**

- `generated-skill-protocol.spec.ts` checks only that each file contains the strings `nextAction.command`, `lifecycle.availableTransitions`, and `bypassed`.
- `template-workflow.spec.ts` checks only two phrases in verify/implement. It does not render or model a disabled-`verifying` route or an optional-`implementing` bypass, does not assert the chosen direct target receives hooks, and does not assert intermediate hook commands are absent.
- Therefore the tests described in design § Testing and validation items 1–2 were not implemented in substance, despite passing.

**Two-sided assessment**

- Implementation-bug interpretation: templates must replace fixed target recipes with an explicit actual-target branch/placeholder derived from fresh structured status, and tests must exercise representative topology snapshots.
- Spec-drift interpretation: if the intended guarantee is merely “place a warning paragraph in each skill and trust the agent to override later recipes,” the merged MUST language and corrective design/tests are too strong and must be weakened. This would conflict with the proposal's stated goal, so implementation correction is the better fit.

### D-2 — MEDIUM — Merged TransitionChange input contract rejects ad-hoc booleans, but Core still accepts and executes them

**Spec evidence**

The merged `core:transition-change` input requirement says the use case MUST NOT accept `allowOutOfScope` or `allowOverlap`; bypasses must be supplied uniformly through `skipChecks`. The same merged spec later retains an older statement that `allowOutOfScope` may skip `impl.linksInScope`, so the spec is internally inconsistent.

**Implementation evidence**

`TransitionChangeInput` still exports both deprecated booleans, and `execute` translates them into `skipChecks`. The CLI correctly translates legacy flags to `skipChecks`, so it does not need to pass these booleans into Core.

**Two-sided assessment**

- Implementation-bug interpretation: remove the deprecated fields and translation from Core, retaining CLI compatibility solely at the adapter boundary.
- Spec-drift interpretation: if public Core API compatibility is intentionally retained, revise the input requirement to explicitly permit deprecated aliases and remove the contradictory MUST NOT. The proposal emphasizes uniform check bypasses and adapter translation, which favors removing them from the use case contract.

## Test coverage

Executed evidence:

- Focused Core: `transition-change.spec.ts` — **1 file, 119 tests passed**.
- CLI suite invoked for status/transition evidence — **86 files, 1101 tests passed**.
- Skills suite invoked for generated protocol/template evidence — **9 files, 64 tests passed**.

Coverage strengths:

- Sovereign `change.schemaName` resolution and disabled next-step routing.
- Optional-step bypass predicates and custom declarative `skipChecks`.
- Suppression of Core hook effects for bypassed `implementing`.
- CLI delegation of `to: 'next'`, repair/error paths, and status projection rendering.
- Presence of routing language in templates and both generated trees.

## Missing or insufficient tests

1. A behavioral/template-model test for **disabled `verifying`** that supplies a structured routing snapshot, proves the direct target (for example `done`) receives its hooks/transition, and proves no `verifying` pre/post hook command is selected.
2. A behavioral/template-model test for **optional `implementing` bypass** that proves routing follows `nextAction.command`, the direct target is in `availableTransitions`, and no implementing hook/transition is executed.
3. A test that fails when a lifecycle template contains an unconditional canonical target recipe inconsistent with the dynamic routing contract; phrase-presence assertions are insufficient.
4. A compile/API contract test (or removal test) ensuring `TransitionChangeInput` no longer exposes `allowOutOfScope` / `allowOverlap`, if the merged MUST NOT remains authoritative.

## Template/generated parity

The routing clauses are present in all four source templates and in both installed trees (`.agents`, `.codex`). The generated-protocol suite passes, so no missing-copy drift was observed for the added clauses. This does **not** cure D-1: source and generated outputs are consistently incomplete in the same way.

## Dependency and global-spec review

- `core:transition-change` depends on topology, transition checks, check registry, lifecycle engine, hook execution, change and architecture as required.
- CLI status/transition remain adapters: Core supplies projections and performs topology/check evaluation.
- `skills:workflow-automation` declares the status and transition dependencies needed for dynamic routing.
- Global architecture is respected in Core/CLI placement; global testing is met for the existing tests, but the missing behavioral skill cases leave the new MUST semantics under-tested.
- No contradiction found with global conventions or error-handling for `HappyPathNextUnavailableError` and CLI stderr/exit behavior.

## Fidelity to proposal and design intent

Core and CLI faithfully implement the proposal's central intent: schemas control active steps; disabled steps disappear; optional steps are bypassable only through skip predicates; sovereign change schema wins; and Core suppresses hooks for skipped states. The delivery-agent layer is not yet faithful to the corrective design. It adds the desired vocabulary but retains the fixed recipes that the proposal identified as a source of guidance loops and invalid intermediate execution. The test implementation similarly falls short of the expressly requested representative-flow assertions.

## Counts

- Audited specs: **4**
- Audited requirement clusters: **7**
- Fully compliant clusters: **5**
- Partial/non-compliant clusters: **2**
- Findings: **2** (`1 HIGH`, `1 MEDIUM`)
- Missing/insufficient test cases: **4**
- Focused Core tests passed: **119**
- CLI tests passed: **1101**
- Skills tests passed: **64**

## Brief summary

Core and CLI topology behavior is compliant and well covered. Full compliance fails because the four lifecycle skills only add dynamic-routing guard prose while retaining fixed-target operational recipes, and the tests check phrases rather than the required disabled/bypass execution flows. A separate medium contract inconsistency remains because Core still accepts deprecated bypass booleans that the merged input requirement forbids.

<!-- END VERBATIM _partial-delivery.md -->
