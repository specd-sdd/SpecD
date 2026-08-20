# Verification: Graph CLI Context

## Requirements

### Requirement: resolveGraphCliContext uses SDK imports

#### Scenario: Configured mode uses resolveCliContext

- **WHEN** a graph command runs with `--config` or autodiscovered config
- **THEN** `resolveGraphCliContext` obtains kernel via `resolveCliContext`
- **AND** platform symbols are imported from `@specd/sdk`

#### Scenario: Configured mode outside a repository

- **GIVEN** a valid explicit or CWD-discovered `specd.yaml` has a project root outside VCS
- **WHEN** a graph command resolves configured context
- **THEN** it returns the configured project root without a VCS-root validation error
- **AND** its VCS root is absent for provider health handling

#### Scenario: Bootstrap mode uses synthetic default workspace

- **WHEN** a graph command runs with `--path` or no-config bootstrap fallback inside a repository
- **THEN** a synthetic `default` workspace is used with `codeRoot` at the resolved VCS root

#### Scenario: Bootstrap mode outside a repository fails

- **WHEN** a graph command enters `--path` or no-config bootstrap mode outside a repository
- **THEN** context resolution fails with the bootstrap validation error

### Requirement: withProvider delegates to withOpenGraphProvider

#### Scenario: Provider lifecycle via SDK

- **WHEN** a graph command opens a provider through `withProvider`
- **THEN** `withOpenGraphProvider` from `@specd/sdk` performs open and close
- **AND** the callback receives an opened `CodeGraphProvider`

#### Scenario: Successful command returns after cleanup

- **WHEN** a read-only graph command completes successfully
- **THEN** provider close completes through the SDK helper
- **AND** `withProvider` neither installs graph-store signal handlers nor calls `process.exit(0)`

#### Scenario: Configured provider reuses resolved kernel

- **GIVEN** configured context resolves a kernel
- **WHEN** a read-only graph command calls `withProvider`
- **THEN** the provider lifecycle receives that same resolved kernel
- **AND** it does not create a second configured kernel or workspace projection

### Requirement: Graph command platform imports

#### Scenario: Read-only graph commands use shared context

- **WHEN** graph `search`, `hotspots`, `impact`, or `stats` executes
- **THEN** it resolves context via `resolveGraphCliContext` and opens via `withProvider`
- **AND** platform symbols are sourced from `@specd/sdk`

#### Scenario: Graph index uses SDK orchestration without withProvider

- **WHEN** `specd graph index` executes in the worker process
- **THEN** it calls `runIndexProjectGraph` from `@specd/sdk`
- **AND** it does not open a provider through `withProvider`

### Requirement: Lock helpers via SDK barrel

#### Scenario: Provider availability replaces host lock probes

- **WHEN** a graph command uses an opened provider while indexing is active
- **THEN** the provider lifecycle surfaces the availability error
- **AND** no handler performs a pre-open lock probe
