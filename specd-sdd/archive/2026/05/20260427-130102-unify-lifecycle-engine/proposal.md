# Proposal: unify-lifecycle-engine

## Motivation

The `specd change context` output currently reports workflow steps as "available" based solely on artifact presence, ignoring the domain's state machine protocol and internal task completion status. This results in a "liar context" where AI agents are guided toward steps that the CLI will ultimately reject.

## Current behaviour

Lifecycle interpretation is currently split across the codebase. `CompileContext` performs a shallow check of `workflowStep.requires` to determine step availability. `GetStatus` contains sophisticated but private lifecycle validation logic (`_computeLifecycleContext`). `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction` also derive dependency-aware behavior independently.

This split has a deeper architectural flaw: the `Change` entity currently exposes effective-status helpers even though effective status depends on schema-defined artifact dependencies and workflow semantics that the entity does not own. The entity persists facts; it does not know the schema DAG.

In practice, the duplicated logic is concrete rather than hypothetical:

- `change.effectiveStatus()` and `change.findBlockingParent()` are consumed directly by `CompileContext`, `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction`.
- `GetStatus` computes similar lifecycle answers privately instead of reusing those helpers.
- CLI commands then serialize whatever each use case decided, which means the user-facing story only stays coherent if every caller keeps re-implementing the same rules identically.

## Proposed solution

Introduce a shared **`LifecycleEngine`** service within `@specd/core` to unify the "triple validation" of change state:

1. **Protocol Validation**: Ensuring transitions follow the `VALID_TRANSITIONS` state graph.
2. **Artifact Validation**: Verifying that all schema-defined `requires` artifacts are complete.
3. **Content Validation**: Checking `requiresTaskCompletion` for outstanding checklist items.

This engine will become the single source of truth for lifecycle interpretation across `GetStatus`, `CompileContext`, `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction`, ensuring that what the user sees, what the agent sees, and what the system enforces are always identical. Because the CLI commands are mostly thin serializers/delegators over these use cases, the corresponding `cli:*` specs also need to be updated so their documented output and delegation contracts remain accurate.

The design boundary is explicit:

- `Change` remains the owner of persisted facts: current state, artifact files, aggregate persisted artifact statuses, history, and approvals.
- `LifecycleEngine` owns derived interpretation: effective artifact status, recursive dependency blocking, review/blocker derivation, step availability, next action, and approval-gate routing.
- Callers that need DAG-aware answers must ask the engine rather than asking the entity to infer schema semantics.

## Specs affected

### New specs

- `core:lifecycle-engine`: Centralized domain service for lifecycle validation. Defines how protocol, artifact, and task completion rules are combined to derive the effective state and machine-readable blockers.
  - Depends on: `core:change`, `core:workflow-model`, `core:schema-format`

### Modified specs

- `core:change`: Clarify that the entity persists lifecycle and artifact facts, while schema-aware effective lifecycle interpretation belongs to the shared engine.
  - Depends on (added): `core:lifecycle-engine`
- `core:get-status`: Update to delegate lifecycle status, effective artifact status, and diagnostic blocker computation to the `LifecycleEngine`.
  - Depends on (added): `core:lifecycle-engine`
- `core:compile-context`: Update to filter `availableSteps` and populate lifecycle instructions using the `LifecycleEngine` to ensure context accuracy.
  - Depends on (added): `core:lifecycle-engine`
- `core:transition-change`: Update to use the `LifecycleEngine` for authoritative pre-transition validation and repair guide generation.
  - Depends on (added): `core:lifecycle-engine`
- `core:validate-artifacts`: Update dependency-order validation to use engine-derived effective statuses and recursive blockers instead of entity-owned DAG logic.
  - Depends on (added): `core:lifecycle-engine`
- `core:get-artifact-instruction`: Update auto-resolution of the next artifact to use engine-derived effective statuses instead of entity-owned DAG logic.
  - Depends on (added): `core:lifecycle-engine`
- `cli:change-status`: Update command-level output/serialization contract to reflect the lifecycle interpretation now produced by `GetStatus` through the engine.
  - Depends on (added): `core:get-status`
- `cli:change-context`: Update step-availability command contract to reflect engine-derived availability and blocking information returned by `CompileContext`.
  - Depends on (added): `core:compile-context`
- `cli:change-transition`: Update transition command contract to reflect engine-derived routing/blockers exposed through `TransitionChange` and repair guidance.
  - Depends on (added): `core:transition-change`, `core:get-status`
- `cli:change-validate`: Update validation command contract to reflect engine-derived dependency blocking returned by `ValidateArtifacts`.
  - Depends on (added): `core:validate-artifacts`
- `cli:change-artifact-instruction`: Update instruction-command contract to reflect engine-derived auto-selection from `GetArtifactInstruction`.
  - Depends on (added): `core:get-artifact-instruction`

## Impact

- **@specd/core**: Centralized lifecycle interpretation in a new domain service; refactored use cases for status, context, transitions, validation, and artifact authoring guidance.
- **@specd/core composition**: Kernel/use-case wiring updated so all affected consumers receive the same shared `LifecycleEngine` dependency instead of ad hoc local logic.
- **@specd/cli**: Serialization and command contracts updated so status/context/transition/validate/instruction commands remain aligned with the core semantics they expose, with more consistent blocker and next-action reporting.
- **Agents/MCP**: Agents will receive a truthful set of available steps, reducing failed transition attempts.

## Technical context

- **Persisted vs effective state**: Persisted artifact/file states remain on `Change`; effective artifact status is schema/DAG interpretation and therefore belongs outside the entity.
- **Review Summary Integration**: The engine will handle the detection of **Drift** (disk vs validation) and **Overlap** (conflict with archived changes), returning them as high-visibility `Blockers`.
- **Validation consumers**: `ValidateArtifacts` still needs dependency-aware ordering and recursive blocker context, but those answers should come from the engine rather than from `Change.effectiveStatus()` or similar entity helpers.
- **Instruction consumers**: `GetArtifactInstruction` still needs to auto-resolve the next artifact, but that readiness decision should come from the same engine used by status and transitions.
- **CLI passthrough contracts**: `change status`, `change context`, `change transition`, `change validate`, and `change artifact-instruction` all document structured behavior inherited from the affected core use cases, so their specs must track the same semantics.
- **Enriched AvailableSteps**: The context output for `availableSteps` will distinguish between `isReady` (structural requirements met) and `isPermitted` (lifecycle protocol allows the move).
- **Machine-Readable Blockers**: The engine must provide unique error codes for every blocking condition to support automated Repair Guides.
- **Architecture**: Domain-layer stateless service following the Hexagonal pattern; schema-aware interpretation stays out of entities.

## Open questions

_All questions resolved._
