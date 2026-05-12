# Proposal: schema-artifact-hastasks

## Motivation

The current mechanism for determining if an artifact produces task checkboxes is derived implicitly from hardcoded rules or specific artifact types. This lack of explicitness makes the schema harder to understand and maintain, as the "has tasks" capability is a structural property that should be declared alongside other artifact attributes.

## Current behaviour

The system derives `hasTaskCompletionCheck` (and thus the requirement for task completion before transitions) implicitly. There is no explicit field in the `schema.yaml` artifact definition to control this behavior, leading to a "magic" derivation that is opaque to both users and agents.

## Proposed solution

1. **Explicit Schema Property**: Add an optional `hasTasks` boolean field to the artifact definition in the schema (`schema.yaml`).
   - The field will be added to the `artifacts` array entries.
   - Example: `hasTasks: true`
2. **Explicit Derivation**: Update the core domain (`ArtifactType`) and infrastructure layers to respect this field. An artifact is considered to have tasks ONLY if `hasTasks` is `true`. If `hasTasks` is `false` (default), task completion checks are disabled even if `taskCompletionCheck` patterns are defined.
3. **Semantic Validation**: Update the schema loader to enforce that any artifact ID listed in `workflow[].requiresTaskCompletion` MUST have `hasTasks: true`. Referencing an artifact without tasks in a completion-gated step is a `SchemaValidationError`.
4. **Runtime Gating**: Update `TransitionChange` to use `hasTasks` as the master switch. Implement a defensive check that fails if an artifact in `requiresTaskCompletion` does not support tasks.
5. **Standard Schema Update**: Update `@specd/schema-std` to explicitly use `hasTasks: true` for the `tasks` artifact.
6. **UX Feedback**: Update the `specd change status` command to display a `[hasTasks]` indicator in the DAG visualization for any artifact where the resolved `hasTasks` property is `true`.

## Specs affected

### New specs

- none

### Modified specs

- `core:core/schema-format`: Add the `hasTasks` property, define the semantic invariant for `requiresTaskCompletion`, and update validation scenarios.
  - Depends on (added): none
- `core:core/transition-change`: Define the task-capability defensive check and add the `missing-task-capability` failure reason.
  - Depends on (added): none
- `cli:cli/change-status`: Update the DAG visualization requirements to include the `[hasTasks]` tag for artifacts that have tasks enabled.
  - Depends on (added): none

## Impact

- **Schema Definition**: `packages/schema-std/schema.yaml` will be updated to include `hasTasks: true` for relevant artifacts.
- **Core Domain**: `ArtifactYaml` (Zod schema), `ArtifactType` value object (adding `hasTasks`), and `TransitionChange` use case (defensive checks).
- **Core Errors**: `InvalidStateTransitionError` updated with `missing-task-capability` reason.
- **CLI**: Updates to the `change status` output formatter.

## Technical context

- The Zod schema for artifacts is defined in `packages/core/src/infrastructure/schema-yaml-parser.ts` as `ArtifactYaml`.
- The `ArtifactType` value object in `packages/core/src/domain/value-objects/artifact-type.ts` will hold the derived `hasTasks` state.
- Semantic validation will be implemented in `packages/core/src/domain/services/build-schema.ts`.
- `TransitionChange` in `packages/core/src/application/use-cases/transition-change.ts` will implement the defensive check.
- `InvalidStateTransitionError` in `packages/core/src/domain/errors/invalid-state-transition-error.ts` will be extended.

## Open questions

- Should we strictly enforce `hasTasks` for all future schemas, or keep it as an optional override for current implicit logic? (Initial plan is to keep it optional for backward compatibility but encourage its use).
