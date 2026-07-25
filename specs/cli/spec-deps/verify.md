# Verification: specs deps

## Requirements

### Requirement: Command signature

#### Scenario: Every subcommand accepts --format

- **WHEN** `specd specs deps list core:auth/login --format json` is run
- **THEN** the output is valid JSON

### Requirement: List subcommand

#### Scenario: List prints the persisted dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:auth/shared']`
- **WHEN** `specd specs deps list core:auth/login` is run
- **THEN** the command exits with code 0
- **AND** the output includes `core:auth/shared`

#### Scenario: List on an uninitialized spec reports not-yet-initialized distinctly

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs deps list core:auth/login` is run
- **THEN** the text output reports the spec is not yet initialized rather than printing an empty list
- **AND** `specd specs deps list core:auth/login --format json` includes `initialized: false`

### Requirement: Add subcommand

#### Scenario: Add appends every supplied dependency ID

- **GIVEN** a spec with persisted `dependsOn: ['core:a']`
- **WHEN** `specd specs deps add core:auth/login --dep core:b --dep core:c` is run
- **THEN** the command exits with code 0
- **AND** the resulting `dependsOn` list includes `core:a`, `core:b`, and `core:c`

### Requirement: Remove subcommand

#### Scenario: Remove drops the given dependency

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps remove core:auth/login --dep core:b` is run
- **THEN** the resulting `dependsOn` list is `['core:a']`

#### Scenario: Remove on an uninitialized spec reports a no-op, not an error

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs deps remove core:auth/login --dep core:b` is run
- **THEN** the command reports the no-op outcome
- **AND** the command does not exit with an error

### Requirement: Set subcommand

#### Scenario: Set replaces the entire dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps set core:auth/login --dep core:c` is run
- **THEN** the resulting `dependsOn` list is exactly `['core:c']`

#### Scenario: Set with no --dep flags clears the list

- **GIVEN** a spec with persisted `dependsOn: ['core:a']`
- **WHEN** `specd specs deps set core:auth/login` is run with no `--dep` flags
- **THEN** the resulting `dependsOn` list is empty

### Requirement: Clear subcommand

#### Scenario: Clear empties the dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps clear core:auth/login` is run
- **THEN** the resulting `dependsOn` list is empty

### Requirement: No repeated CLI-owned mutation logic

#### Scenario: Add, remove, and set map directly onto UpdatePersistedSpecDepsInput

- **WHEN** any of `specs deps add`, `specs deps remove`, or `specs deps set` is run
- **THEN** the handler performs exactly one call to `Kernel.specs.updatePersistedDeps` with the parsed flags mapped directly onto its input
- **AND** the handler does not compute add/remove/set merge semantics itself

### Requirement: Error mapping

#### Scenario: Unknown spec maps to exit code 1

- **WHEN** `specd specs deps list core:unknown/spec` is run
- **THEN** the command exits with code 1
- **AND** stderr names the unresolved spec

#### Scenario: Concurrent modification maps to exit code 1 with retry guidance

- **GIVEN** a concurrent write causes `Kernel.specs.updatePersistedDeps` to throw `ArtifactConflictError`
- **WHEN** `specd specs deps add core:auth/login --dep core:c` is run
- **THEN** the command exits with code 1
- **AND** stderr indicates a concurrent modification and instructs the user to retry

#### Scenario: Read-only workspace maps to exit code 1 without a configuration workaround

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** `specd specs deps add core:auth/login --dep core:c` is run
- **THEN** the command exits with code 1
- **AND** stderr does not suggest a configuration workaround
