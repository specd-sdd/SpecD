# Verification: Discarded List

## Requirements

### Requirement: Command signature

#### Scenario: Extra arguments rejected

- **WHEN** `specd discarded list some-name` is run with an unexpected positional argument
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format — text

#### Scenario: Discarded changes listed with correct fields

- **GIVEN** `discarded/` contains two changes: `old-experiment` (discarded `2024-01-10`, actor `alice`, reason `"no longer needed"`, no supersededBy) and `bad-idea` (discarded `2024-01-08`, actor `bob`, reason `"duplicate effort"`, supersededBy `['new-approach']`)
- **WHEN** `specd discarded list` is run
- **THEN** stdout contains one row for each change showing name, date, actor, and reason
- **AND** the row for `bad-idea` includes `→ new-approach`
- **AND** the row for `old-experiment` does not include a `→` segment
- **AND** the process exits with code 0

#### Scenario: Rows sorted by discard date descending

- **GIVEN** `discarded/` contains change `older-discard` discarded before `newer-discard`
- **WHEN** `specd discarded list` is run
- **THEN** `newer-discard` appears before `older-discard` in the output

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `discarded/` contains one change named `old-experiment` discarded at `2024-01-10T09:00:00.000Z`, actor `alice`, reason `"no longer needed"`, no supersededBy
- **WHEN** `specd discarded list --format json` is run
- **THEN** stdout is a JSON array with one object containing `name`, `discardedAt`, `discardedBy`, and `reason` fields
- **AND** the object does not contain a `supersededBy` field
- **AND** the process exits with code 0

#### Scenario: JSON format output — supersededBy present

- **GIVEN** `discarded/` contains one change named `bad-idea` with `supersededBy` set to `['new-approach']`
- **WHEN** `specd discarded list --format json` is run
- **THEN** the JSON object for `bad-idea` contains a `supersededBy` array with `"new-approach"`
- **AND** the process exits with code 0

#### Scenario: JSON format output — no actor recorded

- **GIVEN** `discarded/` contains one change named `old-experiment` with no `discardedBy` recorded
- **WHEN** `specd discarded list --format json` is run
- **THEN** the JSON object for `old-experiment` does not contain a `discardedBy` field
- **AND** the process exits with code 0

### Requirement: Empty discarded list

#### Scenario: No discarded changes — text

- **GIVEN** `discarded/` is empty
- **WHEN** `specd discarded list` is run
- **THEN** stdout contains `no discarded changes`
- **AND** the process exits with code 0

#### Scenario: No discarded changes — JSON

- **GIVEN** `discarded/` is empty
- **WHEN** `specd discarded list --format json` is run
- **THEN** stdout is `[]`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading discarded directory

- **GIVEN** the `discarded/` directory cannot be read due to a permissions error
- **WHEN** `specd discarded list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
