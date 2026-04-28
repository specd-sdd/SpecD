# Verification: Drafts Restore

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd drafts restore` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Singular alias invocation

- **WHEN** `specd draft restore old-experiment` is run
- **THEN** it is accepted as an alias of `specd drafts restore old-experiment`

### Requirement: Behaviour

#### Scenario: Change moved back to active

- **GIVEN** a drafted change `old-experiment` in `drafts/` with lifecycle state `designing`
- **WHEN** `specd drafts restore old-experiment` is run
- **THEN** the change is moved to `changes/`
- **AND** a `restored` event is appended to history
- **AND** the lifecycle state remains `designing`

### Requirement: Output on success — text

#### Scenario: Success message — text

- **GIVEN** a drafted change `old-experiment` in `drafts/`
- **WHEN** `specd drafts restore old-experiment` succeeds
- **THEN** stdout contains `restored change old-experiment`
- **AND** the process exits with code 0

### Requirement: Output on success — JSON and toon

#### Scenario: Success message — JSON

- **GIVEN** a drafted change `old-experiment` in `drafts/`
- **WHEN** `specd drafts restore old-experiment --format json` succeeds
- **THEN** stdout is a JSON object with `result` set to `"ok"` and `name` set to `"old-experiment"`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd drafts restore nonexistent` is run and no change named `nonexistent` exists anywhere
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Change not in drafts

- **GIVEN** `my-change` is active in `changes/` (not drafted)
- **WHEN** `specd drafts restore my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
