# Delegated compliance audit — workflow model and check semantics

- Change: `schema-workflow-skippable-states`
- Outer verification attempt: `verification-attempt-8`
- Audit scope: `core:workflow-model`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`, `core:lifecycle-engine`, `core:change`
- Evidence basis: merged change previews, dependency declarations, graph-first symbol discovery, direct implementation inspection, and focused Vitest execution.

## Summary

| Result                                     | Count |
| ------------------------------------------ | ----: |
| Specs audited                              |     6 |
| Requirements materially covered            |    23 |
| Confirmed implementation discrepancies     |     1 |
| High/Critical discrepancies                |     0 |
| Medium discrepancies                       |     1 |
| Low discrepancies                          |     0 |
| Focused test files passed                  |     6 |
| Focused tests passed                       |   143 |
| Missing/insufficient test cases identified |     2 |

Overall result: **audit does not pass cleanly**. Optional/disabled semantics, check governance, step-skip composition, topology-based direction, lifecycle recommendation, and sovereign schema usage are substantially implemented and tested. However, `WorkflowTopology.orderedPipeline` does not guarantee the spec's canonical ordering invariant for bedrock states when those states are explicitly declared in a noncanonical order.

## Requirements Summary

### `core:workflow-model`

- Workflow rows configure existing `ChangeState` values and do not create protocol states.
- `optional: true` permits topology shortcuts; effective `step-skip` predicates decide whether a concrete shortcut is available. An empty effective skip-check set permits an unconditional bypass.
- `disabled: true` removes a step from the active graph. Bedrock and active approval anchors are protected.
- `checks` and `skipChecks` are schema-composed bindings with coordinate uniqueness and check/binding governance locks.
- The progress axis is delegated to `WorkflowTopology.orderedPipeline(schema, approvals)`; omitted canonical states remain enabled.
- Existing changes use their recorded sovereign schema.

### `core:workflow-topology`

- Builds the active ordered pipeline, including omitted canonical states and excluding disabled states.
- Enforces bedrock/approval-anchor restrictions and forward reachability.
- Computes legal forward shortcuts only across optional/disabled intermediates; backward edges remain constrained by `VALID_TRANSITIONS`.
- Computes bypassed active optional steps and the immediate next enabled step.
- Disabled verification removes verification as a lifecycle boundary.

### `core:check-registry`

- Namespaces plugin checks with the documented `[A-Za-z0-9_-]+` plugin-name grammar.
- Uses distinct coordinate identity for transition, archive, operation, and step-skip bindings.
- Enforces check-level and binding-level locks for embedding, binding override, configuration override, and disablement.
- Preserves built-in identifiers and prevents duplicate checks/binding coordinates.

### `core:transition-checks`

- Classifies direction using the authoritative topology axis and supplied approval snapshot.
- Supports isolated `step-skip` attempts/applicability.
- Dynamically overlays or synthesizes step transition and skip bindings, deep-merging config and preserving restrictive governance.
- Uses topology legal transitions for `protocol.edge`.
- Defines non-skippable implementation/task skip checks and governed policy checks.

### `core:lifecycle-engine`

- Projects valid versus available transitions from topology and predicate results.
- Recommends the furthest passing shortcut across consecutive optional steps; falls back to entering the nearest optional step when shortcut predicates fail.
- Treats optional steps with no effective skip predicates as unconditionally bypassable.
- Keeps disabled steps out of recommendations and uses the selected domain `nextHop` for application command guidance.

### `core:change`

- `StartVerification` resolves `SchemaProvider.get(change.schemaName)` before operation-specific readiness checks.
- Validity fingerprints resolve the recorded change schema and derive artifact selection/task exclusions exclusively from it.
- Schema resolution failures propagate rather than falling back to the workspace default.

## Implementation Status

| Area                                                | Status                                 | Evidence                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional/disabled model                             | Implemented                            | `workflow-step.ts`, `build-schema.ts`, `workflow-topology.ts`                                                                                               |
| Empty skip-check set means unconditional bypass     | Implemented                            | Candidate transition evaluation has no failing step-skip predicate when the effective set is empty; lifecycle recommendation selects the available shortcut |
| Bedrock and approval-anchor locks                   | Implemented                            | `WorkflowTopology.rawActivePipeline`; build-time bedrock validation; focused tests                                                                          |
| Reachability validation                             | Implemented                            | `orderedPipeline` calls `isReachable`; tests cover disabled `done` disconnect                                                                               |
| Topology legal transitions and bypass discovery     | Implemented with ordering defect below | `workflow-topology.ts`                                                                                                                                      |
| Plugin grammar and coordinate identity              | Implemented                            | `PLUGIN_NAME_REGEX = /^[a-zA-Z0-9_-]+$/`; step-skip coordinate key includes step                                                                            |
| Governance locks                                    | Implemented                            | `check-registry.ts`, `build-schema.ts`, `resolveEffectiveBindings`                                                                                          |
| Topology-based `along`                              | Implemented                            | `classifyAlong` calls `WorkflowTopology.orderedPipeline(schema, approvals)`; no local fallback axis                                                         |
| Dynamic transition/step-skip composition            | Implemented                            | `resolveEffectiveBindings`; synthesized bindings inherit governance rather than relaxing it                                                                 |
| Optional-step default recommendation                | Implemented                            | `recommendedForwardTarget` and `resolveLifecycleNextHop`                                                                                                    |
| Sovereign schema in verification/fingerprints       | Implemented                            | `start-verification.ts:117`; `validity-fingerprint-service.ts:115`                                                                                          |
| Change-scoped use cases in audited dependency chain | Implemented                            | Search confirms change-operating use cases use `change.schemaName`; project/spec-only use cases retain default-schema lookup by design                      |

## Discrepancies

### MEDIUM — Explicitly declared bedrock states can lose canonical progression order

**Spec expectation**

`core:workflow-topology` requires canonical bedrock states (`drafting`, `designing`, `archivable`, `archiving`) to be present **in canonical progression order**, while enabled schema rows retain declared relative order only for a valid reachable declaration. The merged verification artifact also contains a scenario requiring noncanonical declared rows to remain authoritative while protocol-owned anchors are inserted safely.

**Implementation evidence**

`WorkflowTopology.rawActivePipeline` initializes `stepList` directly from `schema.workflow()` and only inserts canonical states that are missing. An explicitly declared canonical/bedrock state is never repositioned or rejected. Therefore a declaration such as `archiving, designing, archivable` preserves `archiving` before `designing`; omitted states are inserted around that already-invalid sequence. `isReachable` checks only `designing -> archivable`, so it does not necessarily reject a misplaced `drafting` or `archiving` anchor.

This also leaks into `classifyAlong`, `legalTransitions`, `bypassedSteps`, and `nextForwardStep`, all of which consume the resulting axis.

**If the spec is correct and code is wrong**

The topology builder must either normalize protocol-owned bedrock anchors to canonical positions while preserving the relative order of configurable delivery rows, or reject declared orders that cannot satisfy both invariants. Tests must cover explicitly declared bedrock rows in a noncanonical order, not only omitted anchors.

**If the code is intentional and spec is wrong**

The spec must explicitly state that every declared row—including bedrock anchors—retains author order, and define the semantics of `archiving` appearing before `designing` or `archivable`. That interpretation conflicts with the stated canonical progression and with archive entry/recovery semantics, so it is the less plausible reading.

**Impact**

Custom schemas can produce an axis where direction classification and next-step guidance are semantically inconsistent even though the schema passes the current reachability check. Severity is Medium because it requires unusual but currently accepted schema ordering; it does not affect the standard schema.

## Test Coverage

Focused command:

```text
pnpm --filter @specd/core exec vitest run \
  test/domain/services/workflow-topology.spec.ts \
  test/domain/services/check-registry.spec.ts \
  test/domain/services/transition-checks.spec.ts \
  test/domain/services/lifecycle-verdict.spec.ts \
  test/application/use-cases/start-verification.spec.ts \
  test/application/services/validity-fingerprint-service.spec.ts
```

Result: **6 files passed, 143 tests passed**.

Strong coverage exists for:

- omitted canonical states, optional flags, disabled steps, bedrock disable rejection, active approval anchors, and reachability;
- legal shortcuts, disabled destinations, backward protocol restrictions, bypassed-step detection, and next enabled step;
- plugin names, duplicate coordinates, check/binding governance, config cascade, disabled binding removal, and restrictive synthesized governance;
- topology-derived direction and step-skip applicability;
- mandatory/optional recommendation, passing/failing/empty/consecutive optional shortcut cases;
- sovereign schema resolution by `StartVerification` and validity fingerprints, including failure behavior.

## Missing Tests

1. **Required by merged verification scenario:** no `workflow-topology.spec.ts` test supplies enabled workflow rows in a noncanonical but valid/reachable order and asserts that configurable rows retain their relative order while bedrock anchors remain canonical.
2. **Invariant regression:** no test explicitly declares bedrock rows in a noncanonical order and asserts normalization or `SchemaValidationError`. This omission permits the confirmed discrepancy above.

## Spec Dependency Chain

```text
default:_global/architecture
  -> core:check-registry
  -> core:transition-checks
  -> core:lifecycle-engine

core:change
  -> core:workflow-model
  -> core:workflow-topology
  -> core:transition-checks
  -> core:lifecycle-engine

core:schema-format
  -> core:workflow-model
  -> core:workflow-topology
  -> core:transition-checks

core:build-schema
  -> core:workflow-model/check governance validation

core:workflow-topology
  -> transition direction (`classifyAlong`)
  -> protocol edge evaluation
  -> lifecycle valid transitions
  -> optional-step recommendation

core:change sovereign schema identity
  -> StartVerification readiness context
  -> ValidityFingerprintService artifact selection
  -> approval/verification/signoff/archive/reconciliation evidence
```

Dependency consistency is otherwise sound: topology and registry are pure domain services; I/O remains in application ports/use cases; lifecycle command strings remain in application guidance; the audited change-schema consumers resolve by `change.schemaName`.

## Final Assessment

The implementation captures the proposal's intended authority split: schema authors declare optionality/disablement, Core evaluates the active graph and effective skip checks, and skills consume projected routing. The empty effective skip-check case is coherently implemented as unconditional permission rather than a disabled step. The audit is blocked only by the pipeline-order invariant above; correcting it and adding the two missing topology tests should make this six-spec batch compliant.
