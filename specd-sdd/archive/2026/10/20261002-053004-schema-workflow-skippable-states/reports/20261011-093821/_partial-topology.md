# Partial Compliance Audit — Topology and Check Governance

## Scope

`core:workflow-model`, `core:check-registry`, `core:transition-checks`, `core:transition-change`, `core:lifecycle-engine`, and `core:workflow-topology`, including their merged verification artifacts, direct dependencies, proposal/design intent, implementation, and tests.

## Requirements summary

The batch defines optional and disabled workflow states, a topology-owned progress axis, shortcut transitions over optional states, `step-skip` predicates, dynamic schema-declared check composition, governance locks, `next` resolution, and lifecycle/status projections. The intended architecture is a pure domain topology service consumed by Core use cases, with adapters delegating inward.

## Implementation status

- The domain service, dynamic bindings, step-skip scope, schema parsing/validation, lifecycle projections, and `TransitionChange` integration are implemented.
- The Core suite passed after verification attempt `verification-attempt-5`: 236 files / 2980 tests.
- Relevant topology, transition-check, lifecycle-engine, transition-change, schema-build, and registry tests are present and passing.
- Global architecture, strict TypeScript/ESM, and Vitest conventions are respected.

## Discrepancies

### T-01 — HIGH — Approval configuration is omitted from most `WorkflowTopology` APIs and callers

The proposal, design, merged `core:workflow-topology` spec, and verification scenarios declare `legalTransitions(from, schema, approvals)`, `isLegalTransition(from, to, schema, approvals)`, `bypassedSteps(from, to, schema, approvals)`, and `nextForwardStep(from, schema, approvals)`. The implementation exposes only the schema arguments for these methods and callers such as `TransitionChange` and lifecycle verdict omit approvals.

Evidence:

- `proposal.md` lines 120-125 and `design.md` lines 227-235 explicitly include `approvals`.
- `specs/core/workflow-topology/spec.md` lines 30-54 and `verify.md` lines 36-76 use those signatures.
- `packages/core/src/domain/services/workflow-topology.ts` lines 166-279 omit approvals except on `orderedPipeline`.
- `packages/core/src/application/use-cases/transition-change.ts` calls `nextForwardStep` and `bypassedSteps` without the baked approval configuration.

Impact: approval-anchor validation is guaranteed only through `orderedPipeline`; topology consumers do not conform to the public contract expressed by proposal/design/spec. Decide whether approvals are semantically required in these APIs. Given the explicit proposal and design, this currently reads as an implementation/API gap, not merely documentation shorthand. Existing tests assert the two/three-argument implementation and therefore do not cover the declared API.

### T-02 — MEDIUM — The topology verification artifact reverses `archivable` and `archiving`

`core:workflow-topology/verify.md` line 11 expects the pipeline to end `done, archiving, archivable`. The canonical lifecycle and implementation are `done, archivable, archiving`, because archive execution starts only after a change becomes archivable. `workflow-topology.spec.ts` asserts the latter.

Impact: the merged verification scenario cannot pass as written even though the implementation and lifecycle protocol are coherent. This is artifact drift and must be corrected in design.

### T-03 — MEDIUM — “Any preceding state” conflicts with the canonical transition table

The merged topology spec says legal transitions include backward transitions to “any preceding non-terminal active step.” The implementation correctly intersects backward/redesign behavior with `VALID_TRANSITIONS`, and `core:workflow-model` explicitly states that legal protocol membership comes from `ChangeState` / `VALID_TRANSITIONS`.

Impact: interpreted literally, the topology spec would advertise hops such as arbitrary returns to `ready` that the canonical protocol forbids. The topology requirement should say that backward/redesign candidates remain constrained by `VALID_TRANSITIONS`.

## Test coverage

Coverage is strong for implemented behavior: topology construction, disabled/optional flags, reachability, shortcuts, bypass detection, next resolution, step-skip matching, binding governance, dynamic config, CLI projections, and transition failures. Missing/incorrect coverage corresponds to the findings:

- No test exercises the proposal/design API with approvals passed through the non-`orderedPipeline` methods.
- The verification artifact’s terminal ordering is contradicted by the passing unit test.
- No test should implement “any preceding state” until the spec is reconciled with `VALID_TRANSITIONS`.

## Dependency/global compliance

No hexagonal-boundary, ESM, logging, or test-structure violation was found. The topology service remains pure domain code. The main dependency-compliance issue is the topology spec’s conflict with `core:workflow-model` over transition authority.

## Counts

- Specs audited: 6
- Findings: 3 (1 high, 2 medium)
- Implementation areas substantially conformant: 6
- Missing/incorrect scenario groups: 3
