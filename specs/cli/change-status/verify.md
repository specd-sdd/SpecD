# Verification: Change Status

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change status` is run without a positional name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Text output shows artifact and file state

- **GIVEN** a change with artifact `specs` in `pending-review`
- **AND** one file under `specs` is `drifted-pending-review`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout shows the artifact aggregate state
- **AND** it lists the individual file row with `drifted-pending-review`

#### Scenario: Text output shows review section when review is required

- **GIVEN** `GetStatus` returns `review.required: true`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout includes a `review:` section
- **AND** it shows the route, reason, and affected absolute file paths

#### Scenario: JSON output includes review and file state

- **GIVEN** a change in `designing`
- **WHEN** `specd change status <name> --format json` is run
- **THEN** stdout includes `artifacts[].state`
- **AND** each artifact includes `files[].state`
- **AND** the top-level payload includes `review`
- **AND** `review.affectedArtifacts[].files[]` includes `filename` and `path`

#### Scenario: Review section omitted when not required

- **GIVEN** `GetStatus` returns `review.required: false`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout omits the `review:` section

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
