# Partial compliance audit — topology and checks

- Change: `schema-workflow-skippable-states`
- Verification attempt: `verification-attempt-9`
- Mode: delegated (the caller owns attempt completion)
- Scope: `core:workflow-model`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`, `core:lifecycle-engine`, `schema-std:standard-schema`, their direct dependencies, the global architecture constraints, and the change proposal/design intent.

## Requirements Summary

### Workflow topology

The merged specifications require one authoritative progression axis with four protocol-owned bedrock anchors (`drafting`, `designing`, `archivable`, `archiving`), an author-ordered delivery segment, canonical insertion of omitted delivery states, removal of disabled rows, and preservation of optional metadata. Forward shortcuts may cross only optional or disabled intermediate states; disabled states are absent from the active graph. Backward/redesign edges remain constrained by the protocol transition table.

### Optional, disabled, and skip checks

The merged `core:workflow-model` contract is unambiguous:

- `optional: true` means that Core may expose a shortcut across the still-active step.
- Core evaluates every effective `step-skip` predicate for the bypassed step.
- If the effective `step-skip` set is empty, bypass is unconditionally permitted.
- `disabled: true` removes the step from the active axis and legal graph.
- Schema authors decide optionality; Core decides whether a concrete bypass passes; skills consume Core projections and do not decide either policy.

Therefore `optional: true` plus an empty effective skip-check set is **not** equivalent to disabled. The optional step remains a legal explicit destination and appears in the active pipeline; only its shortcut is unconditional. This resolves the documentation concern without semantic contradiction.

### Registry and binding governance

The specs require a dedicated `step-skip` attempt/applicability scope, coordinate uniqueness, registry existence checks, confinement/policy/config/disablement locks, and dynamic composition of base plus schema bindings. Built-in implementing-bypass policy must include `workflow.tasksEmpty`, `impl.filesResolved`, and `impl.linksInScope`.

### Lifecycle and standard schema

Lifecycle projections must derive legal targets and preferred guidance from the shared topology and predicate results. A disabled verification step removes the verification boundary. The standard schema must retain the canonical delivery rows, support `optional`/`disabled`, keep approval gates as checks, and prohibit disabling bedrock states.

## Implementation Status

### Compliant: canonical bedrock normalization and author order

`WorkflowTopology.rawActivePipeline` validates disabled bedrock/approval anchors, removes bedrock rows from the author segment, inserts omitted canonical delivery rows without moving declared delivery rows, then wraps the delivery segment in canonical bedrock positions (`packages/core/src/domain/services/workflow-topology.ts:241-318`). This matches both the merged topology spec and the corrected design algorithm.

Evidence:

- Bedrock constants and canonical delivery states: `workflow-topology.ts:22-48`.
- Author delivery order and deterministic omitted-state insertion: `workflow-topology.ts:280-299`.
- Canonical bedrock wrapping and disabled filtering: `workflow-topology.ts:301-318`.
- Tests normalize explicitly misordered bedrock rows and preserve noncanonical delivery order: `packages/core/test/domain/services/workflow-topology.spec.ts:57-105`.

This is also coherent with `core:workflow-model`: workflow-array order remains the progress axis for configurable delivery rows, while `core:workflow-topology` explicitly owns normalization of protocol bedrock anchors. The two specs describe different layers of the same rule and no longer contradict each other.

### Compliant: legal edges, bypass detection, and reachability

Forward candidates are derived from the active pipeline; a farther candidate is admitted only while every active intermediate step is optional (`workflow-topology.ts:334-380`). Disabled intermediates have already been filtered, so they neither block nor appear in `bypassedSteps`. Canonical entry boundaries for `archivable` and `archiving` remain enforced. Backward/redesign destinations are admitted only through `VALID_TRANSITIONS`, not merely because of pipeline position.

Tests cover optional shortcut admission, disabled target exclusion, protocol-only backward edges, bypass lists, disabled bypass exclusion, approval-snapshot propagation, terminal next-step behavior, and disconnected topology (`workflow-topology.spec.ts:136-143`, `190-318`).

### Compliant: optional versus disabled behavior

The implementation preserves `optional` on active pipeline rows and filters only `disabled` rows (`workflow-topology.ts:274-318`). It consequently retains the immediate optional step as an explicit target while allowing a farther checked target. `recommendedForwardTarget` only selects among predicate-filtered `availableTransitions`; it prefers the furthest candidate across a consecutive optional run and falls back to entering the optional step when the shortcut is unavailable (`packages/core/src/domain/services/lifecycle-verdict.ts:971-999`).

Tests exercise both paths and the empty-effective-set rule (`packages/core/test/domain/services/lifecycle-verdict.spec.ts:53-110`). The empty-set test supplies the already filtered target set, so it verifies the intended verdict-level contract: no failed or missing predicate prevents the shortcut.

### Compliant: `step-skip` registry and effective binding composition

`resolveEffectiveBindings` overlays target transition checks and bypassed-step skip checks, applies disabled filtering, cascades registry/binding/step config, preserves policy flags, and synthesizes bindings for known registered checks (`packages/core/src/domain/services/transition-checks.ts:556-711`).

`buildSchema` validates skip-check registration, coordinate uniqueness, confinement, policy, disablement, and configuration locks (`packages/core/src/domain/services/build-schema.ts:864-930`). CheckRegistry uses a step-sensitive coordinate for `step-skip`, preventing duplicate binding coordinates while allowing the same check on different steps.

Built-in bindings match proposal and design intent:

- `workflow.tasksEmpty` on implementing bypass, non-skippable and non-disableable (`packages/core/src/domain/services/check-bindings.ts:51-56`).
- `impl.filesResolved` on implementing bypass, non-skippable (`check-bindings.ts:67-76`).
- `impl.linksInScope` on implementing bypass, CLI-skippable (`check-bindings.ts:77-85`).

This means an optional `implementing` row with no schema-local `skipChecks` is not necessarily an empty effective set: kernel bindings still apply. An empty **schema array** and an empty **effective binding set** are intentionally different concepts.

### Compliant: disabled verification boundary and lifecycle guidance

Lifecycle renewal logic first asks `WorkflowTopology.isStepEnabled('verifying', schema)` and removes the verification boundary when disabled (`packages/core/src/domain/services/lifecycle-verdict.ts:936-948`). Guidance uses the ordered topology and predicate-filtered transitions rather than hardcoded single-step progression (`lifecycle-verdict.ts:971-999`). This implements the proposal's no-verification and no-guidance-loop intent.

### Compliant: architecture and dependency constraints

`WorkflowTopology` remains a pure domain service: its imports are domain error/value objects only and it performs no I/O. The dependency direction is consistent with `default:_global/architecture`. `schema-std:standard-schema` depends on `core:workflow-model` contractually but the package implementation remains distribution-only and does not create a workspace dependency cycle.

## Discrepancies

No blocking or non-blocking spec/code discrepancy was found in the assigned scope.

The initially suspected contradiction between `core:workflow-model` (“workflow array order is the progress axis”) and `core:workflow-topology` (canonical bedrock normalization) is resolved by the merged wording and implementation:

- **Spec interpretation:** author order governs configurable delivery rows; protocol-owned bedrock rows cannot relocate the anchors.
- **Code interpretation:** `deliverySteps` preserves declared delivery relative order, while bedrock declarations contribute attributes through `declaredMap` and are reinserted canonically.

These interpretations agree. There is no basis to classify either spec drift or implementation defect.

## Test Coverage

The relevant implementation is covered across:

- `workflow-topology.spec.ts`: canonical defaults, optional flags, disabled filtering, bedrock normalization, author delivery order, approval anchors, reachability, legal shortcuts, backward-edge protection, bypass detection, and next-step behavior.
- `transition-checks.spec.ts`: `step-skip` matching, built-in bindings, governance preservation, config cascade, disabled filtering, and synthesized bindings.
- `build-schema.spec.ts`: unknown and duplicate skip checks, confinement and monotonic locks, disabled-step incompatibility, and valid parsing/storage.
- `check-registry.spec.ts`: step-sensitive duplicate coordinates and per-step registrations.
- `lifecycle-verdict.spec.ts`: immediate optional entry, checked shortcut, fallback when shortcut predicates fail, empty effective skip-check set, and consecutive optional runs.
- `lifecycle-engine.spec.ts`: disabled verification behavior and forward archive guidance.
- Schema parser and schema-std tests cover `optional`/`disabled` parsing and standard workflow shape.

Fresh delegated evidence: `pnpm --filter @specd/core test -- workflow-topology transition-checks lifecycle-verdict build-schema check-registry` completed successfully with **236 test files and 3000 tests passed**. Vitest executed the full core suite under the package script.

## Missing Tests

No missing test blocks compliance. Two low-risk improvements would make the intent more explicit:

1. Add an integration-style status/transition fixture for an optional step other than `implementing`, with no kernel or schema `step-skip` bindings, proving end-to-end that both explicit entry and unconditional shortcut remain available. Current coverage proves the rule at verdict level, while implementing has intentional kernel bindings.
2. Add one topology fixture combining misordered explicit bedrock rows with a noncanonical but reachable delivery order in the same schema. Existing tests cover these independently, which is adequate but less regression-resistant than the combined case.

## Dependency Chain

```text
schema-std:standard-schema
  -> core:workflow-model
       -> core:workflow-topology
            -> ChangeState / VALID_TRANSITIONS
            -> core:schema-format
            -> default:_global/architecture

core:check-registry
  -> core:transition-checks
       -> resolveEffectiveBindings
       -> step-skip applicability/attempt

core:lifecycle-engine
  -> core:workflow-topology
  -> core:transition-checks predicate projections
  -> lifecycle verdict and guidance
```

The proposal/design intent is represented across this chain: schema authors declare policy, Core validates topology/governance and evaluates checks, and lifecycle consumers/skills consume Core-owned projections.

## Summary counts

- Assigned merged specs audited: **6**
- Direct/global dependency families checked: **3** (`core:schema-format`, lifecycle/change state protocol, global architecture)
- Proposal/design intent areas checked: **5** (topology, optional/disabled semantics, step-skip grammar, governance/effective bindings, lifecycle guidance/boundary)
- Blocking discrepancies: **0**
- Non-blocking discrepancies: **0**
- Missing-test recommendations: **2 low-risk**
- Fresh tests: **3000 passed, 0 failed**
- Result: **PASS for the assigned topology/checks scope**
