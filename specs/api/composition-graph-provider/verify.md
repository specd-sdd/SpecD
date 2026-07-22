# Verification: Composition Graph Provider

## Requirements

### Requirement: provider is created from project configuration

#### Scenario: Provider binds to project graph paths

- **GIVEN** specd.yaml declares workspaces
- **WHEN** API server bootstrap creates and opens the long-lived graph provider
- **THEN** provider reads project root from config
- **AND** index paths match workspace layout

#### Scenario: Missing graph index yields empty provider state

- **GIVEN** no `.specd/graph` index on disk
- **WHEN** provider is constructed
- **THEN** provider reports not indexed
- **AND** handlers can still expose status DTO

#### Scenario: Reconfigured project rebuilds provider

- **WHEN** server restarts after config change
- **THEN** new provider instance uses updated paths
- **AND** old in-memory graph is not reused

### Requirement: indexing preparation follows the merged project-assembly model

#### Scenario: API graph indexing assembles project-level input before provider call

- **WHEN** API prepares a graph index request
- **THEN** it combines `ListWorkspaces` output with effective graph config
- **AND** the provider receives one project-level index input instead of legacy per-workspace targets

### Requirement: stale state is observable

#### Scenario: Stale flag true when index older than sources

- **GIVEN** source file newer than graph index mtime
- **WHEN** `GET /v1/graph/status` runs
- **THEN** `stale: true` in response
- **AND** CLI-equivalent freshness message available

#### Scenario: Fresh index reports stale false

- **GIVEN** graph index rebuilt after last edit
- **WHEN** status endpoint is queried
- **THEN** `stale: false`
- **AND** last indexed timestamp is exposed

#### Scenario: POST index clears stale after success

- **GIVEN** status was stale
- **WHEN** `POST /v1/graph/index` completes
- **THEN** subsequent status shows `stale: false`
- **AND** indexedAt advances

### Requirement: SDK graph provider factory

#### Scenario: Graph handler uses long-lived withGraphProvider

- **WHEN** a graph handler needs an opened provider
- **THEN** it calls `apiContext.withGraphProvider()` (or the process-scoped healthy equivalent)
- **AND** it does not import `createCodeGraphProvider` from `@specd/code-graph`
- **AND** it does not open/close a provider per HTTP request

### Requirement: long-lived provider stale reopen and index on injected provider

#### Scenario: Stale provider is reopened

- **GIVEN** the long-lived provider throws `GraphProviderStaleError`
- **WHEN** the healthy accessor recovers
- **THEN** it closes and reopens (or replaces) the process-scoped provider

#### Scenario: Index on injected provider does not require post-index host refresh

- **WHEN** `runIndexProjectGraph` completes with `input.provider` set to the process long-lived provider
- **THEN** the API does not replace or reopen that provider solely because indexing completed
- **AND** when `force: true`, the same long-lived instance remains authoritative for subsequent graph reads
