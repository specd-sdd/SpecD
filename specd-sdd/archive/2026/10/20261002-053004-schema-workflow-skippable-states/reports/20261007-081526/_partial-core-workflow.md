# Compliance Audit Partial: Core Workflow & Topology

## Scope

- `core:workflow-model`
- `core:workflow-topology`
- `core:lifecycle-engine`
- `core:transition-change`
- `core:change-manifest`

## Requirements Summary & Implementation Status

### 1. `core:workflow-topology`

- **Pipeline Reflection & Order**: Pipeline reflects declared order and excludes disabled steps. Implemented in `WorkflowTopology.buildPipeline()`.
- **Bedrock State Protection**: `drafting`, `designing`, `archiving`, and `archivable` cannot be disabled; throws `SchemaValidationError`. Implemented in `WorkflowTopology.validate()`.
- **Approval Gate Anchors**: `ready` cannot be disabled if `approvals.spec` is enabled; `done` cannot be disabled if `approvals.signoff` is enabled; throws `SchemaValidationError`. Implemented in `WorkflowTopology.validate()`.
- **Forward Reachability**: Unbroken forward progression path from `designing` to `archivable` is required; throws `SchemaValidationError` on disconnection. Implemented in `WorkflowTopology.validateReachability()`.
- **Shortcut & Step Skipping**: Bypassed intermediate optional steps are detected via `WorkflowTopology.detectBypassedSteps()`. Transitions to disabled steps are prohibited.
- **Next Forward Step**: Next forward step skips disabled states; returns `null` on terminal states. Implemented in `WorkflowTopology.getNextForwardStep()`.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified by 21 unit tests in `packages/core/test/domain/services/workflow-topology.spec.ts`.

### 2. `core:workflow-model`

- **Optional & Disabled Declarations**: Schema parses `optional` (boolean, default false) and `disabled` (boolean, default false) per workflow step. Implemented in `packages/core/src/domain/entities/schema.ts`.
- **Sovereign Change Schema Authority**: Manifest records `schema` (name and optional version). Changes remain bound to their sovereign schema rather than dynamically rebinding to workspace default.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified in `packages/core/test/domain/entities/schema.spec.ts` and `workflow-topology.spec.ts`.

### 3. `core:lifecycle-engine`

- **Skipping & Available Transitions**: `evaluateLifecycleVerdict` accounts for skippable and disabled steps. When a step is optional and its step-skip checks are satisfied, transition past it is offered.
- **Recommendations**: If `verifying` is disabled or bypassed, `done` or `archivable` is recommended accordingly.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified in `packages/core/test/domain/services/lifecycle-engine.spec.ts`.

### 4. `core:transition-change`

- **Target Resolution**: Resolves `to: 'next'` dynamically using `WorkflowTopology.getNextForwardStep()`.
- **Step-Skip Evaluation**: When skipping optional intermediate steps, executes registered step-skip checks for the bypassed steps. Transition aborts if any step-skip check fails.
- **Sovereign Schema Usage**: Loads schema via sovereign `change.schemaName`.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified by 115 tests in `packages/core/test/application/use-cases/transition-change.spec.ts` and 4 integration tests in `packages/core/test/composition/use-cases/transition-change.spec.ts`.

### 5. `core:change-manifest`

- **Schema Identity**: Manifest stores and preserves sovereign schema identity. Handles version bumps and mismatches with workspace default gracefully.
- **Status**: FULLY IMPLEMENTED.
- **Tests**: Verified in `packages/core/test/application/use-cases/manifest-schema.spec.ts`.

## Discrepancies

- None detected. Implementation and specs are fully aligned.

## Test Coverage

- Comprehensive coverage across domain, application, and composition layers. All 140+ unit/integration tests passing.
