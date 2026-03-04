# Verification: Change Status

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change status` is run without a positional name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Normal status output

- **GIVEN** a change `add-login` in state `designing` with spec `auth/login` and one complete artifact
- **WHEN** `specd change status add-login` is run
- **THEN** stdout shows `change: add-login`, `state: designing`, `specs: auth/login`, and an artifact line
- **AND** the process exits with code 0

#### Scenario: Effective status reflects dependency cascading

- **GIVEN** a change where artifact `spec` depends on `proposal` and `proposal` is `in-progress`
- **WHEN** `specd change status <name>` is run
- **THEN** the `spec` artifact line shows `in-progress` even if its own hash is valid

### Requirement: Schema version warning

#### Scenario: Schema mismatch

- **GIVEN** the change was created with schema version 1 and the active schema is version 2
- **WHEN** `specd change status <name>` is run
- **THEN** stderr contains a `warning:` line mentioning both schema versions
- **AND** the process exits with code 0

### Requirement: Change not found

#### Scenario: Unknown change name

- **WHEN** `specd change status nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: JSON output contains correct structure

- **GIVEN** a change `add-login` in state `designing` with specId `auth/login`, schema `std` version `1`, and one artifact `proposal` with `effectiveStatus` `complete`
- **WHEN** `specd change status add-login --format json` is run
- **THEN** stdout is valid JSON with `name`, `state`, `specIds`, `schema`, and `artifacts`
- **AND** `schema` has `name` equal to `"std"` and `version` equal to `1`
- **AND** `artifacts` contains one entry with `type` equal to `"proposal"` and `effectiveStatus` equal to `"complete"`
- **AND** the process exits with code 0
