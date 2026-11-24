# Workflow Topology

## Purpose

SpecD lifecycles and transitions require an authoritative, centralized domain model to compute workflow pipelines, legal hops, bypassed states, and forward progression from schema definitions and project configurations. Scattering transition rules, hardcoded state arrays, and bypass checks across multiple CLI commands, use cases, and check predicates leads to drift, broken custom workflows, and invalid bypass paths. The `workflow-topology` domain module provides the single source of truth for constructing the active lifecycle graph and validating transition semantics.

## Requirements

### Requirement: Module of pure workflow functions

The topology SHALL be exposed as pure exported functions of the `workflow-topology` domain module, not as a class with static methods, in line with the global rule that stateless domain services are plain functions. Every exported function name SHALL carry the `workflow` qualifier so call sites are self-describing:

- `resolveWorkflowPipeline(schema, approvals)`
- `isWorkflowStepEnabled(step, schema)`
- `listWorkflowTransitions(from, schema, approvals)`
- `isWorkflowTransitionLegal(from, to, schema, approvals)`
- `listBypassedWorkflowSteps(from, to, schema, approvals)`
- `nextWorkflowStep(from, schema, approvals)`

Consumers SHALL import these functions by name. Internal helpers SHALL NOT be exported.

### Requirement: Ordered pipeline construction

`resolveWorkflowPipeline(schema, approvals)` SHALL construct the deterministic, ordered progression of active lifecycle steps:

1. The pipeline order SHALL always be the canonical lifecycle order: `drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`.
2. The order in which rows appear in `schema.workflow()` carries no meaning. Rows only carry per-step properties (`optional`, `disabled`, `requires`, `requiresTaskCompletion`, `hooks`, `checks`, `skipChecks`). Rows declared in a noncanonical order SHALL be normalized silently to the canonical order and SHALL NOT raise an error.
3. Canonical states omitted from `schema.workflow()` default to enabled (`disabled: false`, `optional: false`).
4. Steps explicitly declared `disabled: true` in `schema.workflow()` SHALL be excluded from the pipeline.
5. Steps explicitly declared `optional: true` in `schema.workflow()` SHALL be included in the pipeline with an `optional` attribute.
6. Bedrock states (`drafting`, `designing`, `done`, `archiving`, `archivable`) CANNOT be optional or disabled. If any bedrock state is declared `optional: true` or `disabled: true`, topology construction SHALL throw `SchemaValidationError`.
7. `ready` cannot be disabled while `approvals.spec` is enabled. `done` is not conditional on `approvals.signoff`: it always remains the mandatory completed-delivery boundary. When signoff is disabled, only the `approval.signoff` predicate skips on `done -> archivable`.
8. Drain-only compatibility states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) are never pipeline steps.

### Requirement: Forward connectivity by construction

The active topology SHALL always form a connected, forward-reachable path from `designing` through `done` to `archivable`. Connectivity is guaranteed by construction: bedrock anchors cannot be disabled, disabled steps are removed from the pipeline, and each active step can always reach the next active step. No separate reachability guard SHALL exist.

Disabling every configurable delivery step (`ready` while the spec gate is off, `implementing`, and `verifying`) is valid and SHALL produce a connected pipeline in which `designing` advances directly to `done`.

### Requirement: Dynamic legal transitions

`listWorkflowTransitions(from, schema, approvals)` SHALL return the complete set of valid destination states from a given state `from`:

1. Forward transition to the next active step in the pipeline.
2. Shortcut/bypass transitions to a later active step if and only if EVERY active step strictly between `from` and that destination is `optional: true`. Disabled steps are not in the pipeline and therefore never block a shortcut.
3. Backward transitions only when the edge is admitted by the canonical `VALID_TRANSITIONS` protocol table AND the destination precedes `from` in the pipeline. Redesign (`to = designing`) is admitted whenever `VALID_TRANSITIONS` admits it for the exact source, including the `designing → designing` re-entry, independent of pipeline position. Pipeline position alone MUST NOT invent a backward edge, and a `VALID_TRANSITIONS` edge MUST NOT be admitted as a forward move that bypasses a non-optional active step.
4. Archive-boundary rules: `archivable` is entered only from `done`, and `archiving` only from `archivable`. Archiving escape transitions admitted by `VALID_TRANSITIONS` remain legal.
5. Drain-only compatibility states SHALL only expose the exits that `VALID_TRANSITIONS` defines for that exact source state. Drain states SHALL NOT be normalized onto a pipeline position to gain forward shortcuts (for example, `pending-signoff → archivable` and `pending-spec-approval → implementing` are not legal by normalization).
6. If a destination step is disabled in the active schema, it SHALL NOT appear in legal transitions, and `isWorkflowTransitionLegal(from, to, schema, approvals)` SHALL return `false`.
7. If `from` is a disabled step, the result is empty.

`isWorkflowTransitionLegal(from, to, schema, approvals)` SHALL return `true` exactly when `to` is in `listWorkflowTransitions(from, schema, approvals)`.

### Requirement: Bypassed step detection

`listBypassedWorkflowSteps(from, to, schema, approvals)` SHALL compute all intermediate pipeline steps strictly between `from` and `to` along the ordered progression axis:

1. If `to` is the immediate next active step, the result is an empty array.
2. If `to` jumps over one or more active optional steps, the result is the ordered list of those bypassed steps.
3. Steps that are disabled are excluded from the result because they are inactive in the graph.
4. For non-forward transitions (backward or self), the result is an empty array.

### Requirement: Topological forward progression

`nextWorkflowStep(from, schema, approvals)` SHALL return the closest subsequent active step in the ordered pipeline:

1. If `from` is `archivable` or `archiving`, the result is `null`.
2. If `from` is a drain-only state (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`), the result is the forward exit that `listWorkflowTransitions(from, schema, approvals)` admits for that exact state (`spec-approved → implementing`, `signed-off → archivable`), or `null` when no forward exit is legal (for example `pending-*` states, or `spec-approved` when `implementing` is disabled). Drain states SHALL NOT be mapped onto a pipeline anchor to compute a successor.
3. Otherwise, it returns the immediately following active step in the pipeline, including an enabled optional step.
4. Disabled steps are skipped automatically when resolving the next forward step.
5. Whenever the result is not `null`, `isWorkflowTransitionLegal(from, result, schema, approvals)` SHALL be `true`.

### Requirement: Step enablement and verification boundary

`isWorkflowStepEnabled(step, schema)` SHALL return `true` if `step` is active in the pipeline (not declared `disabled: true`), and `false` otherwise. Bedrock states always return `true`.

1. When `verifying` is disabled, verification is not a required lifecycle boundary. Every consumer that decides whether verification evidence is required — validity reconciliation, lifecycle verdict, sign-off, and archive — SHALL consult `isWorkflowStepEnabled('verifying', schema)` on the change's schema, so that `done`, sign-off, `archivable`, and archive never require verification evidence for that change.
2. When `implementing` is disabled, the implementation phase is excluded from the active lifecycle graph.

## Constraints

- The module is a pure domain service in `@specd/core/domain/services/` with zero I/O and zero infrastructure dependencies.
- It receives the change's sovereign `Schema` and project approvals.
- All evaluation is deterministic and stateless.

## Spec Dependencies

- [`core:workflow-model`](../workflow-model/spec.md) — defines schema workflow step model, optional/disabled declarations, and schema validation
- [`core:schema-format`](../schema-format/spec.md) — YAML schema structure and schema configuration
- [`default:_global/architecture`](../../_global/architecture/spec.md) — architectural boundaries, domain purity, and plain functions for stateless services
