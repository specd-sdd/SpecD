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

#### Scenario: Force rebuild is forwarded to the provider

- **GIVEN** `force: true`
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** `provider.index()` receives `force: true`
- **AND** `IndexProjectGraph` does not call `provider.recreate()` directly

#### Scenario: Non-forced indexing does not request recreation

- **GIVEN** `force` is omitted or `false`
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** `provider.index()` receives the non-forced options
- **AND** `IndexProjectGraph` does not call `provider.recreate()` directly

### Requirement: Accepts open provider and prepared inputs

#### Scenario: Does not resolve workspaces or acquire lock

- **GIVEN** a mock provider
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** it does not call lock helpers or read `specd.yaml`

#### Scenario: VCS root is forwarded to provider indexing

- **GIVEN** an `IndexProjectGraphInput` containing `vcsRoot`
- **WHEN** `IndexProjectGraph.execute()` runs
- **THEN** `provider.index()` receives the same `vcsRoot` value

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createIndexProjectGraph()` is called
- **THEN** it returns an `IndexProjectGraph` with no captured config
