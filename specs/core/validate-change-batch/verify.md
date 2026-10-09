# Verification: ValidateChangeBatch

## Requirements

### Requirement: Constructor and dependencies

#### Scenario: Constructor receives batch orchestration dependencies

- **WHEN** `ValidateChangeBatch` is constructed
- **THEN** it accepts `ChangeRepository`, `SchemaProvider`, and `ValidateArtifacts`
- **AND** it stores these dependencies for orchestration execution

### Requirement: Input

#### Scenario: Artifact filter narrows executed steps

- **GIVEN** a change with multiple artifact types in the schema DAG
- **WHEN** `ValidateChangeBatch.execute` is called with `artifactId: "specs"`
- **THEN** only steps targeting the `specs` artifact type are executed
- **AND** all other artifact types are omitted from scheduled execution

### Requirement: Change existence and schema compatibility guard

#### Scenario: Nonexistent change throws ChangeNotFoundError

- **GIVEN** no change named `missing-change` exists in `ChangeRepository`
- **WHEN** `ValidateChangeBatch.execute({ name: "missing-change" })` is invoked
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Incompatible schema throws SchemaMismatchError

- **GIVEN** a change `feat` created under schema `custom-schema`
- **AND** `SchemaProvider.get()` returns a schema with name `schema-std`
- **WHEN** `ValidateChangeBatch.execute({ name: "feat" })` is invoked
- **THEN** it throws `SchemaMismatchError` before running any validation steps

### Requirement: Empty scope

#### Scenario: No specIds returns passing empty result without invoking ValidateArtifacts

- **GIVEN** a change `empty-change` whose `specIds` array is empty
- **WHEN** `ValidateChangeBatch.execute({ name: "empty-change" })` runs
- **THEN** it returns `{ passed: true, total: 0, results: [] }`
- **AND** `ValidateArtifacts.execute` is never called

### Requirement: DAG walk

#### Scenario: Scope branching executes change-scoped once and spec-scoped per specId

- **GIVEN** a change with `specIds: ["core:foo", "core:bar"]`
- **AND** active schema has `proposal` (scope: change) and `specs` (scope: spec)
- **WHEN** `ValidateChangeBatch.execute({ name: "my-change" })` runs
- **THEN** `ValidateArtifacts.execute` is called once for `proposal` without `specPath`
- **AND** `ValidateArtifacts.execute` is called twice for `specs`: once for `core:foo` and once for `core:bar`
- **AND** execution order strictly respects `schema.artifactDag().topologicalOrder()`

### Requirement: Aggregated result

#### Scenario: Fault-tolerant execution aggregates all steps after partial failures

- **GIVEN** a batch where an early scheduled step fails and a later step passes
- **WHEN** `ValidateChangeBatch.execute` runs
- **THEN** all scheduled steps are executed to completion without early abort
- **AND** `result.passed` is `false`
- **AND** `result.total` matches the total number of scheduled steps
- **AND** `result.results` contains step results with `spec`, `artifact`, `passed`, `failures`, `warnings`, and `files`

#### Scenario: Successful batch reports passed true

- **GIVEN** all scheduled steps succeed with zero failures
- **WHEN** `ValidateChangeBatch.execute` completes
- **THEN** `result.passed` is `true`
- **AND** `result.total` equals `result.results.length`

### Requirement: Not a substitute for ValidateSpecs

#### Scenario: Batch validation remains change-scoped

- **WHEN** `ValidateChangeBatch.execute` completes successfully
- **THEN** only change artifact validation state is updated
- **AND** canonical workspace spec validation remains governed by `ValidateSpecs`
