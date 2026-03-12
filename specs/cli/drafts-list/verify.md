# Verification: Drafts List

## Requirements

### Requirement: Output format — text

#### Scenario: Drafts listed with correct fields

- **GIVEN** `drafts/` contains two changes: `old-experiment` (state `drafting`, drafted `2024-01-05`, actor `alice`, reason `"parked for later"`) and `shelved-work` (state `designing`, drafted `2024-01-03`, actor `bob`, no reason)
- **WHEN** `specd drafts list` is run
- **THEN** stdout contains one row for each change showing name, bracketed state, date, and actor
- **AND** the row for `old-experiment` includes `"parked for later"`
- **AND** the row for `shelved-work` does not include a quoted reason
- **AND** the process exits with code 0

#### Scenario: Rows sorted by createdAt ascending

- **GIVEN** `drafts/` contains change `b-change` created before `a-change` (alphabetically later but older)
- **WHEN** `specd drafts list` is run
- **THEN** `b-change` appears before `a-change` in the output

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `drafts/` contains one change named `old-experiment` in state `drafting`, drafted at `2024-01-05T10:00:00.000Z`, actor `alice`, reason `"parked for later"`
- **WHEN** `specd drafts list --format json` is run
- **THEN** stdout is a JSON array with one object containing `name`, `state`, `draftedAt`, `draftedBy`, and `reason` fields
- **AND** the object does not contain `specIds` or `schema` fields
- **AND** the process exits with code 0

#### Scenario: JSON format output — no reason or actor

- **GIVEN** `drafts/` contains one change named `shelved-work` with no reason and no `draftedBy` recorded
- **WHEN** `specd drafts list --format json` is run
- **THEN** the JSON object for `shelved-work` does not contain `reason` or `draftedBy` fields
- **AND** the process exits with code 0

### Requirement: Empty drafts

#### Scenario: No drafted changes — text

- **GIVEN** `drafts/` is empty
- **WHEN** `specd drafts list` is run
- **THEN** stdout contains `no drafts`
- **AND** the process exits with code 0

#### Scenario: No drafted changes — JSON

- **GIVEN** `drafts/` is empty
- **WHEN** `specd drafts list --format json` is run
- **THEN** stdout is `[]`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading drafts directory

- **GIVEN** the `drafts/` directory cannot be read due to a permissions error
- **WHEN** `specd drafts list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
