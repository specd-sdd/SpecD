# Proposal: core-validate-change-batch

## Motivation

`specd changes validate --all` currently implements its batch orchestration directly inside a private helper (`executeBatch`) in `packages/cli/src/commands/change/validate.ts`. External hosts such as SpecD Studio (HTTP API and Desktop IPC) or future IDE extensions cannot execute batch change validation without duplicating this scheduling and aggregation logic. Moving this orchestration to a canonical use case in `@specd/core` keeps the CLI thin, satisfies Hexagonal Architecture boundaries, and makes batch validation accessible to all host integrations.

## Current behaviour

Today, `packages/cli/src/commands/change/validate.ts` contains `executeBatch()`, which loads the change, checks whether it has `specIds`, loads the project's active schema using `kernel.specs.getActiveSchema.execute()`, and walks `schema.artifactDag().topologicalOrder()`. For each artifact, it branches on scope (`scope: change` runs once without `specPath`; `scope: spec` runs once per `specId` in `change.specIds`), repeatedly invoking `kernel.changes.validate.execute()`. Because this lives in the CLI adapter, no other host can reuse it, and the CLI was inspecting the project's active schema without verifying compatibility against `change.schemaName`.

## Proposed solution

Extract the batch validation workflow into a canonical application use case in `@specd/core`: `ValidateChangeBatch`.

The use case will:

1. Accept `{ name: string, artifactId?: string }`.
2. Load the change aggregate via `ChangeRepository`. If not found, throw `ChangeNotFoundError`.
3. Resolve the active schema via `SchemaProvider`. Verify that `schema.name() === change.schemaName`, throwing `SchemaMismatchError` upon mismatch.
4. If `change.specIds` is empty, return `{ passed: true, total: 0, results: [] }` immediately without invoking `ValidateArtifacts`.
5. Walk `schema.artifactDag().topologicalOrder()`. If `artifactId` is specified, filter only matching artifact steps while preserving topological order.
6. For each artifact in order:
   - If `scope: change`, invoke `ValidateArtifacts` once with `{ name, artifactId }` and no `specPath`.
   - If `scope: spec`, invoke `ValidateArtifacts` once per `specId` in `change.specIds` with `{ name, specPath, artifactId }`.
7. Execute all scheduled steps without early termination, accumulating step results (`spec`, `artifact`, `passed`, `failures`, `warnings`, `files`).
8. Return `{ passed: boolean, total: number, results: readonly ValidateChangeBatchStepResult[] }`.

Expose this use case on `kernel.changes.validateBatch` and refactor `packages/cli/src/commands/change/validate.ts` so `executeBatch()` delegates directly to `kernel.changes.validateBatch.execute()`.

## Specs affected

### New specs

- `core:validate-change-batch`: Defines the application use case that orchestrates batch validation over the schema's artifact DAG for an active change.
  - Depends on: `core:change`, `core:validate-artifacts`, `core:schema-format`

### Modified specs

- `cli:change-validate`: Refine `--all` batch validation requirements to specify delegation to `ValidateChangeBatch` in core rather than local CLI orchestration.
  - Depends on (added): `core:validate-change-batch`
  - Depends on (removed): none

## Impact

- **Core Application Layer**: `packages/core/src/application/use-cases/validate-change-batch.ts` (new use case and types).
- **Core Composition Layer**: `packages/core/src/composition/use-cases/validate-change-batch.ts` (factory) and `packages/core/src/composition/kernel.ts` (kernel interface and assembly).
- **Core Public Barrels**: `packages/core/src/index.ts`, `packages/core/src/public.ts`, and `@specd/sdk` re-exports.
- **CLI Adapter**: `packages/cli/src/commands/change/validate.ts` (`executeBatch` refactored to delegate to `kernel.changes.validateBatch.execute()`).
- **Tests**:
  - `packages/core/test/application/use-cases/validate-change-batch.spec.ts` (unit tests covering DAG ordering, scope branching, empty specIds, filter, error handling).
  - `packages/core/test/composition/use-cases/validate-change-batch.spec.ts` (composition tests).
  - `packages/cli/test/commands/change-validate.spec.ts` (CLI command tests verifying delegation and output formatting).

## Technical context

- **Schema Name Guard**: During discovery, we confirmed that `ValidateChangeBatch` must receive `SchemaProvider` and enforce `if (schema.name() !== change.schemaName) throw new SchemaMismatchError(change.name, change.schemaName, schema.name())`. This aligns with `ValidateArtifacts`, `CompileContext`, and `GetArtifactInstruction`.
- **Fault-Tolerant Loop**: The use case must not abort when an individual step fails; it must run all scheduled steps to ensure complete diagnostic reporting.
- **Empty Scope**: If a change has no `specIds`, the batch terminates cleanly with `passed: true, total: 0, results: []` without invoking `ValidateArtifacts`.
- **Artifact Filter**: When `artifactId` is passed, it acts as a selective filter over the topological DAG steps.

## Open questions

None. The schema resolution strategy, use-case contract, and wiring points were settled during discovery.
