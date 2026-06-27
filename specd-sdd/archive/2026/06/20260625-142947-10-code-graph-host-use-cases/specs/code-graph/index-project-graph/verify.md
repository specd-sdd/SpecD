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

### Requirement: Supports force recreate

#### Scenario: Force rebuild

- **GIVEN** `force: true`
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** `provider.recreate()` is called before `provider.index()`

#### Scenario: No recreate without force

- **GIVEN** `force` is omitted or `false`
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** `provider.recreate()` is not called

### Requirement: Accepts open provider and prepared inputs

#### Scenario: Does not resolve workspaces or acquire lock

- **GIVEN** a mock provider
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** it does not call lock helpers or read `specd.yaml`

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createIndexProjectGraph()` is called
- **THEN** it returns an `IndexProjectGraph` with no captured config
