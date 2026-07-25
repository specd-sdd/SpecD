# Verification: specs init

## Requirements

### Requirement: Command signature

#### Scenario: spec-id and --all are mutually exclusive

- **WHEN** `specd specs init core:auth/login --all` is run
- **THEN** the command exits with code 1 indicating the two target forms are mutually exclusive

#### Scenario: --workspace is only valid alongside --all

- **WHEN** `specd specs init core:auth/login --workspace core` is run
- **THEN** the command exits with code 1 indicating `--workspace` requires `--all`

### Requirement: Single-spec initialization

#### Scenario: Initializing an already-initialized spec fails rather than succeeding silently

- **GIVEN** a spec that already has persisted state
- **WHEN** `specd specs init core:auth/login` is run
- **THEN** the command exits with code 1
- **AND** the command propagates `SpecAlreadyInitializedError` rather than reassigning the schema

#### Scenario: Init never creates spec artifacts for a missing spec

- **GIVEN** a spec-id with no existing artifacts
- **WHEN** `specd specs init core:nonexistent/spec` is run
- **THEN** the command does not create any spec artifacts
- **AND** the command fails with `SpecNotFoundError`

### Requirement: Batch initialization

#### Scenario: Batch is restricted to named workspaces

- **WHEN** `specd specs init --all --workspace core --workspace cli` is run
- **THEN** `Kernel.specs.initializePersistedState` is called with `target: { kind: 'all', workspaces: ['core', 'cli'] }`

#### Scenario: Batch without --workspace omits the workspaces filter

- **WHEN** `specd specs init --all` is run
- **THEN** `Kernel.specs.initializePersistedState` is called with `target: { kind: 'all' }` and no `workspaces` field

#### Scenario: Batch reports existingSkipped distinctly from initialized and failed

- **GIVEN** a workspace with a mix of lock-less specs and already-initialized specs
- **WHEN** `specd specs init --all` is run
- **THEN** the output reports an `existingSkipped` count separately
- **AND** already-initialized specs never appear under `initialized` or `failed`

### Requirement: Batch exit code

#### Scenario: Any failed entry among eligible targets yields exit code 1

- **GIVEN** a batch run where one lock-less spec fails to initialize
- **WHEN** `specd specs init --all` is run
- **THEN** the command exits with code 1

#### Scenario: Batch with only existingSkipped entries exits 0

- **GIVEN** a batch run where every target already has persisted state
- **WHEN** `specd specs init --all` is run
- **THEN** the command exits with code 0

### Requirement: No repeated CLI-owned initialization logic

#### Scenario: Handler delegates every decision to Kernel.specs.initializePersistedState

- **WHEN** `specd specs init core:auth/login --schema custom@1` is run
- **THEN** the handler performs exactly one call to `Kernel.specs.initializePersistedState`
- **AND** the handler does not resolve schemas, discover spec identities, verify parseability, or derive dependencies itself

### Requirement: Error mapping

#### Scenario: Already-initialized spec maps to exit code 1 naming the spec

- **GIVEN** a spec that already has persisted state
- **WHEN** `specd specs init core:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr names the already-initialized spec

#### Scenario: Unknown spec maps to exit code 1

- **WHEN** `specd specs init core:unknown/spec` is run
- **THEN** the command exits with code 1
- **AND** stderr names the unresolved spec

#### Scenario: Read-only workspace surfaces as a failed batch entry, not a silent skip

- **GIVEN** one target workspace in a batch run is `readOnly`
- **WHEN** `specd specs init --all` is run
- **THEN** that workspace's specs appear as `failed` entries
- **AND** they are not silently omitted from the report
