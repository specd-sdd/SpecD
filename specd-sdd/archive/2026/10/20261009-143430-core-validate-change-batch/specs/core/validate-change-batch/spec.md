# ValidateChangeBatch

## Purpose

Single canonical orchestration for batch change validation (`specd changes validate --all`): load the change aggregate, verify schema compatibility, walk the schema's artifact DAG in topological order, delegate each step to `ValidateArtifacts` with exactly one `artifactId`, and aggregate per-step results without early abort. External hosts and CLI adapters MUST NOT reimplement this loop.

## Requirements

### Requirement: Constructor and dependencies

`ValidateChangeBatch` MUST receive `ChangeRepository`, `SchemaProvider`, and `ValidateArtifacts` at construction time.

### Requirement: Input

`ValidateChangeBatchInput` MUST include:

- `name` — change name to validate.
- `artifactId` — optional; when provided, only DAG steps for that artifact id are executed.

### Requirement: Change existence and schema compatibility guard

`execute` MUST load the change via `ChangeRepository.get(input.name)`.

- If the change does not exist, `execute` MUST throw `ChangeNotFoundError`.
- `execute` MUST resolve the schema via `SchemaProvider.get()`.
- If `schema.name() !== change.schemaName`, `execute` MUST throw `SchemaMismatchError` before running validation steps.

### Requirement: Empty scope

When the change has no `specIds` (`change.specIds.length === 0`), `execute` MUST return `{ passed: true, total: 0, results: [] }` without invoking `ValidateArtifacts`.

### Requirement: DAG walk

`execute` MUST iterate `schema.artifactDag().topologicalOrder()`.

For each artifact in topological order:

- If `input.artifactId` is specified and does not match the artifact ID, the step MUST be skipped.
- `scope: change` — invoke `ValidateArtifacts.execute({ name: input.name, artifactId })` without a `specPath` argument exactly once.
- `scope: spec` — invoke `ValidateArtifacts.execute({ name: input.name, specPath: specId, artifactId })` once per entry in `change.specIds`.

### Requirement: Aggregated result

`ValidateChangeBatchResult` MUST expose:

- `passed` — `true` only if every scheduled step passed (`result.failures.length === 0`).
- `total` — total number of executed steps.
- `results` — readonly list of `ValidateChangeBatchStepResult`, each containing:
  - `spec` — `null` for change-scoped artifacts, or the target `specId` for spec-scoped artifacts.
  - `artifact` — artifact ID of the step.
  - `passed` — boolean indicating whether the step had zero failures.
  - `failures` — array of validation failures from `ValidateArtifacts`.
  - `warnings` — array of validation warnings from `ValidateArtifacts`.
  - `files` — array of expected file status entries from `ValidateArtifacts`.

The use case MUST run all scheduled steps even if one or more steps fail.

### Requirement: Not a substitute for ValidateSpecs

`ValidateChangeBatch` validates change artifacts only. Canonical workspace spec validation remains `ValidateSpecs`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — change entity and lifecycle aggregate loaded through `ChangeRepository`
- [`core:validate-artifacts`](../validate-artifacts/spec.md) — per-step artifact validation engine
- [`core:schema-format`](../schema-format/spec.md) — schema artifact DAG and artifact scopes
