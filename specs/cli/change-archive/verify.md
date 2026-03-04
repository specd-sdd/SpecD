# Verification: Change Archive

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change archive` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Prerequisites

#### Scenario: Change not in archivable state

- **GIVEN** a change `my-change` in `done` state (not yet `archivable`)
- **WHEN** `specd change archive my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message mentioning the current state

### Requirement: Behaviour

#### Scenario: Successful archive

- **GIVEN** a change `my-change` in `archivable` state
- **WHEN** `specd change archive my-change` is run
- **THEN** spec deltas are merged into the permanent spec directories
- **AND** the change directory is moved to the archive path
- **AND** the process exits with code 0

### Requirement: Post-archive hooks

#### Scenario: Post-hook failure

- **GIVEN** a `run:` post-hook that exits with code 1 is declared on the archivable step
- **WHEN** `specd change archive my-change` is run after successful merge
- **THEN** the process exits with code 2

### Requirement: Output on success

#### Scenario: Archive path in output

- **WHEN** `specd change archive my-change` succeeds
- **THEN** stdout contains `archived change my-change →` followed by the archive path
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change archive nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

#### Scenario: JSON output on success

- **WHEN** `specd change archive my-change --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `name` equal to `"my-change"`, and `archivePath` containing the archive path
- **AND** the process exits with code 0
