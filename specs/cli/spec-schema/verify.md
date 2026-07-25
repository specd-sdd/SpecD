# Verification: specs schema

## Requirements

### Requirement: Command signature

#### Scenario: --schema is required on set

- **WHEN** `specd specs schema set core:auth/login` is run without `--schema`
- **THEN** the command exits with a usage error indicating `--schema` is required

### Requirement: Get subcommand

#### Scenario: Get prints the persisted schema identity

- **GIVEN** persisted state with `schema: { name: 'default', version: 1 }`
- **WHEN** `specd specs schema get core:auth/login` is run
- **THEN** the output shows `name: default` and `version: 1`

#### Scenario: Get on an uninitialized spec propagates SpecNotInitializedError

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs schema get core:auth/login` is run
- **THEN** the command exits with code 1
- **AND** the command does not print a default or empty schema identity

### Requirement: Set subcommand

#### Scenario: Set prints the resulting schema identity and dependsOn

- **GIVEN** persisted state with `schema: { name: 'default', version: 1 }`
- **WHEN** `specd specs schema set core:auth/login --schema other@2` is run
- **THEN** the output shows the new schema identity and the resulting `dependsOn` list

#### Scenario: Set reports a no-op when the target schema equals the current schema

- **GIVEN** persisted state with `schema: { name: 'default', version: 1 }`
- **WHEN** `specd specs schema set core:auth/login --schema default@1` is run
- **THEN** the output indicates `changed: false`

#### Scenario: Set on an uninitialized spec propagates SpecNotInitializedError rather than creating one

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs schema set core:auth/login --schema default@1` is run
- **THEN** the command exits with code 1
- **AND** no persisted state is created

### Requirement: No repeated CLI-owned reassignment logic

#### Scenario: Handler delegates resolution, parsing, and dependency comparison to Core

- **WHEN** `specd specs schema set core:auth/login --schema other@2` is run
- **THEN** the handler performs exactly one call to `Kernel.specs.updatePersistedSchema`
- **AND** the handler does not resolve schema references, parse artifacts, or extract/compare dependencies itself

### Requirement: Error mapping

#### Scenario: Unknown spec maps to exit code 1

- **WHEN** `specd specs schema get core:unknown/spec` is run
- **THEN** the command exits with code 1
- **AND** stderr names the unresolved spec

#### Scenario: Uninitialized spec instructs the user to run specs init

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs schema get core:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr instructs the user to run `specs init` first

#### Scenario: Dependency conflict shows both dependency lists and instructs specs deps

- **GIVEN** a target schema whose extracted dependencies differ from the persisted `dependsOn`
- **WHEN** `specd specs schema set core:auth/login --schema other@2` is run
- **THEN** the command exits with code 1
- **AND** stderr shows both the current and extracted dependency lists
- **AND** stderr instructs the user to reconcile dependencies explicitly through `specs deps` rather than retrying the schema change

#### Scenario: Concurrent modification maps to exit code 1

- **GIVEN** `ArtifactConflictError` is thrown by the use case
- **WHEN** `specd specs schema set core:auth/login --schema other@2` is run
- **THEN** the command exits with code 1
- **AND** stderr indicates a concurrent modification

#### Scenario: Read-only workspace maps to exit code 1 without a configuration workaround

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** `specd specs schema set core:auth/login --schema other@2` is run
- **THEN** the command exits with code 1
- **AND** stderr does not suggest a configuration workaround
