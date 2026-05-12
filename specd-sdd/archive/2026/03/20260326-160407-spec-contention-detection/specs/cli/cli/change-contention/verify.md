# Verification: Change Contention

## Requirements

### Requirement: Command signature

#### Scenario: Command accepts optional name and format

- **WHEN** `specd change contention` is run without arguments
- **THEN** it shows contention for all active changes
- **AND** defaults to `text` format

#### Scenario: Named change filter

- **WHEN** `specd change contention my-change` is run
- **THEN** the output only shows contention entries involving `my-change`

### Requirement: Text output format

#### Scenario: Two specs contended by multiple changes

- **GIVEN** changes `alpha` (designing) and `beta` (implementing) both target `core:core/config`
- **AND** changes `beta` and `gamma` (designing) both target `core:core/kernel`
- **WHEN** `specd change contention` is run in text mode
- **THEN** stdout shows two groups, sorted by spec ID
- **AND** the first group header is `core:core/config` with `alpha` and `beta` listed below
- **AND** the second group header is `core:core/kernel` with `beta` and `gamma` listed below

### Requirement: JSON output format

#### Scenario: JSON output matches ContentionReport structure

- **GIVEN** contention exists between two changes on one spec
- **WHEN** `specd change contention --format json` is run
- **THEN** stdout is valid JSON with `hasContention` equal to `true`
- **AND** `entries` is an array of objects with `specId` and `changes` fields

### Requirement: No contention output

#### Scenario: No contention in text mode

- **GIVEN** no specs are targeted by more than one active change
- **WHEN** `specd change contention` is run
- **THEN** stdout contains `no contention detected`
- **AND** exit code is 0

#### Scenario: No contention in JSON mode

- **GIVEN** no contention exists
- **WHEN** `specd change contention --format json` is run
- **THEN** stdout is `{"hasContention":false,"entries":[]}`
- **AND** exit code is 0

### Requirement: Named change not found

#### Scenario: Error for nonexistent change

- **WHEN** `specd change contention nonexistent` is run
- **THEN** stderr contains an error message
- **AND** exit code is 1

### Requirement: Exit codes

#### Scenario: Contention present does not affect exit code

- **GIVEN** contention exists between active changes
- **WHEN** `specd change contention` is run
- **THEN** exit code is 0
