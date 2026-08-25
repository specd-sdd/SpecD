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

- **GIVEN** an already-open provider and prepared project inputs
- **WHEN** the use case executes
- **THEN** it invokes provider indexing with those inputs

#### Scenario: Prepared provider lifecycle remains untouched

- **GIVEN** an already-open provider and complete prepared inputs
- **WHEN** the use case executes
- **THEN** it forwards VCS and progress fields unchanged
- **AND** it does not open, close, clear directly, recreate, lock, or spawn

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createIndexProjectGraph()` is called
- **THEN** it returns an `IndexProjectGraph` with no captured config
