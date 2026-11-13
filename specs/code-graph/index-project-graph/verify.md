# Verification: IndexProjectGraph

## Requirements

### Requirement: Executes project indexing

#### Scenario: Incremental index

- **GIVEN** an opened provider and prepared `IndexProjectGraphInput`
- **WHEN** `IndexProjectGraph.execute()` runs with `force: false`
- **THEN** `provider.index()` is called once with merged options
- **AND** the returned `IndexResult` is passed through unchanged

#### Scenario: Progress callback forwarded

- **GIVEN** an `onProgress` callback in input
- **WHEN** indexing runs
- **THEN** the callback is passed to `provider.index()`

#### Scenario: The event receiver is forwarded unchanged

- **GIVEN** an input with `onEvent`
- **WHEN** `execute` calls `provider.index()`
- **THEN** the `IndexOptions` carries the same receiver

### Requirement: Effective size limit resolution

#### Scenario: The default is applied when nothing is declared

- **GIVEN** a graph configuration without `maxFileBytes`
- **WHEN** the effective graph configuration is built
- **THEN** every workspace has an effective limit of 262144 bytes

#### Scenario: A workspace value overrides the project value

- **GIVEN** a project limit and a different limit for one workspace
- **WHEN** the effective graph configuration is built
- **THEN** that workspace gets its own value and the others get the project value

#### Scenario: Zero means no limit

- **GIVEN** a limit of `0`
- **WHEN** the effective graph configuration is built
- **THEN** the effective limit expresses that no limit applies

#### Scenario: The bootstrap configuration gets the same default

- **GIVEN** no `specd.yaml` and the bootstrapped graph configuration
- **WHEN** the effective graph configuration is built
- **THEN** the effective limit is 262144 bytes

#### Scenario: Exemptions keep their base directories

- **GIVEN** project and workspace `largeFilePaths`
- **WHEN** the effective graph configuration is built
- **THEN** the project patterns resolve against the project root and the workspace patterns against its `codeRoot`

#### Scenario: The resolved values feed the fingerprint

- **GIVEN** two configurations that differ only in the resolved limit
- **WHEN** their fingerprints are computed
- **THEN** the fingerprints differ

#### Scenario: No other call site applies the default

- **GIVEN** the indexing run and the health computation
- **WHEN** they need the limit
- **THEN** both read it from the effective graph configuration and neither defines the default itself

### Requirement: Supports forced logical reindex

#### Scenario: Force intent reaches provider indexing

- **WHEN** force indexing is requested
- **THEN** the provider receives the force index option

#### Scenario: Force is forwarded as a logical full-reindex request

- **GIVEN** an already-open provider with reusable graph contents
- **WHEN** `IndexProjectGraph` executes with `force: true`
- **THEN** provider indexing receives force and reprocesses every selected input
- **AND** the use case never calls `recreate()`

### Requirement: Accepts open provider and prepared inputs

#### Scenario: Prepared inputs are forwarded unchanged

- **GIVEN** an already-open provider and prepared project inputs including `configuredWorkspaces`
- **WHEN** the use case executes
- **THEN** it invokes provider indexing with those inputs including `configuredWorkspaces`

#### Scenario: Prepared provider lifecycle remains untouched

- **GIVEN** an already-open provider and complete prepared inputs
- **WHEN** the use case executes
- **THEN** it forwards VCS and progress fields unchanged
- **AND** it does not open, close, clear directly, recreate, lock, or spawn

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createIndexProjectGraph()` is called
- **THEN** it returns an `IndexProjectGraph` with no captured config
