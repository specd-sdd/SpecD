# Verification: Change Skip Artifact

## Requirements

### Requirement: Command signature

#### Scenario: Missing artifact-id argument

- **WHEN** `specd change skip-artifact my-change` is run without an artifact ID
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Artifact marked as skipped

- **GIVEN** a change with an optional artifact `proposal` in `missing` or `in-progress` status
- **WHEN** `specd change skip-artifact my-change proposal` is run
- **THEN** the artifact's effective status becomes `skipped`
- **AND** an `artifact-skipped` event is appended to the change history
- **AND** the process exits with code 0

#### Scenario: Reason stored in history

- **WHEN** `specd change skip-artifact my-change proposal --reason "not needed"` is run
- **THEN** the `artifact-skipped` event in history has `reason: "not needed"`

#### Scenario: Skipped artifact satisfies downstream requires

- **GIVEN** artifact `spec` has `requires: ["proposal"]` and `proposal` is skipped
- **WHEN** `specd change status my-change` is run after skipping
- **THEN** `spec`'s effective status is not blocked by `proposal`

### Requirement: Optional artifacts only

#### Scenario: Non-optional artifact rejected

- **GIVEN** the schema declares artifact `spec` as `optional: false`
- **WHEN** `specd change skip-artifact my-change spec` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

#### Scenario: Text output

- **WHEN** `specd change skip-artifact my-change proposal` succeeds
- **THEN** stdout contains `skipped artifact proposal on my-change`
- **AND** the process exits with code 0

#### Scenario: JSON output

- **WHEN** `specd change skip-artifact my-change proposal --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `name` equal to `"my-change"`, and `artifactId` equal to `"proposal"`

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change skip-artifact nonexistent proposal` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Unknown artifact ID

- **WHEN** `specd change skip-artifact my-change unknown-artifact` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
