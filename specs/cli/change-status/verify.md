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
- **AND** stdout includes a `lifecycle:` section with `approvals:` and `path:` lines
- **AND** the process exits with code 0

#### Scenario: Effective status reflects dependency cascading

- **GIVEN** a change where artifact `spec` depends on `proposal` and `proposal` is `in-progress`
- **WHEN** `specd change status <name>` is run
- **THEN** the `spec` artifact line shows `in-progress` even if its own hash is valid

#### Scenario: Text output shows available transitions

- **GIVEN** a change in `designing` state with all artifacts complete
- **WHEN** `specd change status <name>` is run
- **THEN** the `lifecycle:` section includes a `transitions:` line listing the available transitions

#### Scenario: Text output omits transitions line when none available

- **GIVEN** a change in `designing` state with artifacts still missing
- **AND** no transitions are available
- **WHEN** `specd change status <name>` is run
- **THEN** the `lifecycle:` section does not include a `transitions:` line

#### Scenario: Text output shows blockers

- **GIVEN** a change in `designing` state with artifact `specs` missing
- **AND** the `ready` transition is blocked by `specs`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout includes a `blockers:` section with an entry for `ready`

#### Scenario: Text output shows next artifact

- **GIVEN** a change with `proposal` complete and `specs` as the next artifact
- **WHEN** `specd change status <name>` is run
- **THEN** the `lifecycle:` section includes `next artifact: specs`

#### Scenario: Text output omits next artifact when all done

- **GIVEN** all artifacts are complete
- **WHEN** `specd change status <name>` is run
- **THEN** the `lifecycle:` section does not include a `next artifact:` line

#### Scenario: JSON output contains lifecycle object

- **GIVEN** a change `add-login` in state `designing`
- **WHEN** `specd change status add-login --format json` is run
- **THEN** stdout is valid JSON containing a `lifecycle` object
- **AND** `lifecycle` has `validTransitions`, `availableTransitions`, `blockers`, `approvals`, `nextArtifact`, and `changePath`
- **AND** `approvals` has `spec` and `signoff` boolean fields

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
