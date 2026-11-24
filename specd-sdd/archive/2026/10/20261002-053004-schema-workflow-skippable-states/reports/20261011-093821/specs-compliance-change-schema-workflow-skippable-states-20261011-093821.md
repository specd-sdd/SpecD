# Spec Compliance Report — schema-workflow-skippable-states

## Audit metadata

- Mode: delegated change audit
- Outer verification attempt: `verification-attempt-5`
- Lifecycle state audited: `verifying`
- Specs in change: 25
- Graph: indexed, `stale: false`, complete coverage; health reason `CONTENT_UNKNOWN`
- Automated evidence after attempt start: Core 236 files / 2980 tests; targeted CLI 2 files / 89 tests; generated skills protocol 1 file / 2 tests
- Delegated subagents were launched as required but all three were stopped by an external usage-limit error before writing output. The same batches were therefore completed inline and persisted below.

## Executive summary

The implementation is broadly functional and all executed tests pass, but the change is not spec-compliant yet. Four material discrepancies remain:

1. **High:** the `core:edit-change` merged spec and verification scenario still mandate the superseded `updateSpecIds`/second-schema-lookup path, while the corrected design and implementation intentionally use one named compatibility lookup followed by `replaceSpecIds()` and reconciler-owned consequences.
2. **High:** most public `WorkflowTopology` methods and callers omit the `approvals` parameter that proposal, design, spec, and scenarios explicitly define.
3. **Medium:** the new topology verification scenario reverses `archivable` and `archiving`.
4. **Medium:** the topology spec permits backward transitions to “any preceding” state, conflicting with `core:workflow-model` and `VALID_TRANSITIONS` as protocol authority.

Because at least one merged scenario contradicts intended implementation and the topology API contract is unresolved, delegated compliance fails. Verification attempt `verification-attempt-5` must remain active and must not be completed from this audit.

## Aggregate counts

- Specs audited: 25
- Findings: 4
- High severity: 2
- Medium severity: 2
- Adapter-local findings: 0
- Automated test failures: 0
- Verification/compliance result: **fail — artifact review and topology contract decision required**

## Detailed findings

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

# Partial Compliance Audit — Core Change-Bound Use Cases

## Scope

`core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, and `core:change`.

## Requirements summary

This batch makes the schema recorded by each change sovereign across validation, hooks, preview, status, archive, approvals, context/instructions, scope edits, invalidation, verification readiness, task counting, and evidence fingerprints. Workspace/spec operations without a change identity retain the project-default lookup.

## Implementation status

- Change-bound production paths resolve `SchemaProvider.get(change.schemaName)` (or archived/draft equivalent).
- `EditChange` resolves the named schema once for added-spec compatibility, then uses `replaceSpecIds()` plus `reconcileAfter()` inside the active serialized mutation.
- `InvalidateChange`, `StartVerification`, `CountTasks`, and `ValidityFingerprintService` use the named schema and propagate resolution errors.
- The post-attempt Core suite passed: 236 files / 2980 tests.
- Focused sovereign-schema tests cover named lookup, observably different schemas, exclusion of workspace-default artifacts, and failure atomicity/no fallback evidence.
- An audit of unnamed lookups found only workspace/spec-level operations: `ValidateSpecs`, initial persisted dependency resolution, spec context/outline/metadata, and project context.

## Discrepancies

### C-01 — HIGH — `core:edit-change` merged spec and verify artifacts still require the rejected `updateSpecIds` design

The merged requirement says artifact-DAG synchronization during `updateSpecIds` must perform a second named schema lookup from the fresh change. Its verification scenario explicitly expects `EditChange` to apply `updateSpecIds` and obtain the DAG from `SchemaProvider.get('custom-workflow')`.

That contradicts the corrected design and actual implementation:

- `design.md` lines 457, 473, 479, and 513 explicitly require `replaceSpecIds()` plus `ctx.reconcileAfter()` and reject `updateSpecIds()` because it duplicates validity ownership and prematurely invalidates projections.
- `packages/core/src/application/use-cases/edit-change.ts` lines 138-150 resolve the sovereign schema once before mutation; lines 253-292 use `replaceSpecIds()` and `reconcileAfter()` in the active scope path.
- `edit-change.spec.ts` correctly asserts one named lookup and preserves reconciler ownership.
- The stale delta text is at `deltas/core/edit-change/spec.md.delta.yaml` lines 13-17 and `verify.md.delta.yaml` lines 21-27.

Impact: one merged requirement and one verification scenario fail against the intended, tested implementation. This is an artifact-review-required failure. The spec/verify deltas must be revised to describe the single compatibility lookup and reconciler-owned DAG/validity consequences.

## Test coverage

Coverage is strong across the batch. Tests verify sovereign schema selection for validation, hooks, preview/status, archive, approvals, compile/instruction APIs, EditChange, invalidation, task counting, verification start, and all fingerprint APIs. Failure paths ensure no partial scope mutation, invalidation, attempt, or fallback evidence.

The only material mismatch is that the `EditChange` tests correctly verify the revised design while its merged spec/verify artifact still describes the superseded two-lookup/updateSpecIds behavior.

## Dependency/global compliance

The use cases remain in the application layer behind `SchemaProvider` and repository ports; no domain I/O or dependency-direction violation was found. Error propagation and testing conventions conform to global specs.

## Counts

- Specs audited: 15
- Findings: 1 high artifact/spec inconsistency
- Sovereign-schema production paths verified: 15 spec areas
- Relevant Core tests passed: 2980

# Partial Compliance Audit — Schema, CLI, and Skills

## Scope

`schema-std:standard-schema`, `cli:change-status`, `cli:change-transition`, and `skills:workflow-automation`, plus relevant global constraints and direct dependencies.

## Requirements summary

The batch exposes optional/disabled lifecycle configuration in the standard schema, renders dynamic pipeline/status projections, delegates `--next` to Core topology, and defines attempt ownership so full verification shares one attempt with delegated compliance.

## Implementation status

- Standard schema declares the workflow/check structures consumed by Core.
- CLI status displays Core-owned availability/next action and annotates optional steps while omitting disabled ones.
- CLI transition delegates `next` target resolution and check execution to Core rather than retaining a separate next-state table.
- Skills protocol requires independent verify to own one attempt and delegated compliance to reuse it without starting/completing another.
- After attempt `verification-attempt-5`, targeted CLI tests passed: 2 files / 89 tests; the generated skill protocol test passed: 1 file / 2 tests.
- The compliance invocation honored delegated ownership: it did not start or complete another attempt.

## Discrepancies

No additional adapter-specific discrepancy was found. Adapter behavior is affected by topology findings T-01 through T-03, but the CLI and skills themselves delegate consistently to the currently implemented Core contracts.

## Test coverage

Coverage exists for incomplete-task availability, dynamic next action, optional/disabled pipeline rendering, drafted hop suppression, `--next` success/failure paths, disabled-step skipping, pending-state behavior, and attempt ownership text generation.

## Dependency/global compliance

Adapters delegate inward to Core, preserve ESM/TypeScript conventions, and use Vitest. No project-wide architecture or convention violation was found.

## Counts

- Specs audited: 4
- Findings: 0 adapter-local
- Relevant tests passed: 91
