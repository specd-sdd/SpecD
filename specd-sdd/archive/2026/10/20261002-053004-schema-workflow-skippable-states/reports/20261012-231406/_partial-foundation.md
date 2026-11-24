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
