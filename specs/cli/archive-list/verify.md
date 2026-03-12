# Verification: Archive List

## Requirements

### Requirement: Output format — text

#### Scenario: Archived changes listed with correct fields

- **GIVEN** the archive directory contains two changes: `add-oauth-login` (workspace `default`, archived `2024-01-15`, actor `alice`) and `update-billing` (workspace `billing`, archived `2024-01-10`, no actor recorded)
- **WHEN** `specd archive list` is run
- **THEN** stdout contains one row for each change showing name, workspace, and date
- **AND** the row for `add-oauth-login` includes `by alice`
- **AND** the row for `update-billing` does not include a `by` segment
- **AND** the process exits with code 0

#### Scenario: Rows sorted by archive date descending

- **GIVEN** the archive contains change `older-change` archived before `newer-change`
- **WHEN** `specd archive list` is run
- **THEN** `newer-change` appears before `older-change` in the output

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** the archive directory contains one change named `add-oauth-login` with workspace `default`, archived at `2024-01-15T12:00:00.000Z`, actor `alice`, and artifacts `['spec']`
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is a JSON array with one object containing `name`, `archivedName`, `workspace`, `archivedAt`, `archivedBy`, and `artifacts` fields
- **AND** the object does not contain `state` or `specIds` fields
- **AND** the process exits with code 0

#### Scenario: JSON format output — no actor recorded

- **GIVEN** the archive directory contains one change named `update-billing` with no `archivedBy` recorded
- **WHEN** `specd archive list --format json` is run
- **THEN** the JSON object for `update-billing` does not contain an `archivedBy` field
- **AND** the process exits with code 0

### Requirement: Empty archive

#### Scenario: No archived changes — text

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list` is run
- **THEN** stdout contains `no archived changes`
- **AND** the process exits with code 0

#### Scenario: No archived changes — JSON

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is `[]`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading archive directory

- **GIVEN** the archive directory cannot be read due to a permissions error
- **WHEN** `specd archive list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
