# Verification: Change Draft

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change draft` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Change moved to drafts

- **GIVEN** an active change `my-change` in `changes/`
- **WHEN** `specd change draft my-change` is run
- **THEN** the change is moved to `drafts/`
- **AND** a `drafted` event is appended to history
- **AND** the lifecycle state is unchanged

#### Scenario: Optional reason stored in history

- **WHEN** `specd change draft my-change --reason "on hold"` is run
- **THEN** the `drafted` event in history has `reason: "on hold"`

### Requirement: Output on success

#### Scenario: Success message

- **WHEN** `specd change draft my-change` succeeds
- **THEN** stdout contains `drafted change my-change`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change draft nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Already drafted

- **GIVEN** `my-change` is already in `drafts/`
- **WHEN** `specd change draft my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

#### Scenario: JSON output on success

- **WHEN** `specd change draft my-change --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"` and `name` equal to `"my-change"`
- **AND** the process exits with code 0
