# Verification: Graph CLI Context

## Requirements

### Requirement: resolveGraphCliContext uses SDK imports

#### Scenario: Configured mode uses resolveCliContext

- **WHEN** a graph command runs with `--config` or autodiscovered config
- **THEN** `resolveGraphCliContext` obtains kernel via `resolveCliContext`
- **AND** platform symbols are imported from `@specd/sdk`

#### Scenario: Bootstrap mode uses synthetic default workspace

- **WHEN** a graph command runs with `--path` or no-config bootstrap fallback
- **THEN** a synthetic `default` workspace is used with `codeRoot` at the resolved VCS root

### Requirement: withProvider delegates to withOpenGraphProvider

#### Scenario: Provider lifecycle via SDK

- **WHEN** a graph command opens a provider through `withProvider`
- **THEN** `withOpenGraphProvider` from `@specd/sdk` performs open/close
- **AND** the callback receives an opened `CodeGraphProvider`

### Requirement: Graph command platform imports

#### Scenario: Graph search uses shared context module

- **WHEN** `specd graph search` executes
- **THEN** it resolves context via `resolveGraphCliContext` and opens via `withProvider`
- **AND** platform symbols are sourced from `@specd/sdk`

#### Scenario: Graph stats uses shared context module

- **WHEN** `specd graph stats` executes
- **THEN** it resolves context via `resolveGraphCliContext` and opens via `withProvider`
- **AND** platform symbols are sourced from `@specd/sdk`

#### Scenario: Graph index uses SDK orchestration without withProvider

- **WHEN** `specd graph index` executes in the worker process
- **THEN** it calls `runIndexProjectGraph` from `@specd/sdk`
- **AND** it does not open a provider through `withProvider`

### Requirement: Lock helpers via SDK barrel

#### Scenario: Stats uses assertGraphIndexUnlocked from SDK

- **WHEN** `specd graph stats` checks the indexing lock
- **THEN** it imports `assertGraphIndexUnlocked` from `@specd/sdk`
