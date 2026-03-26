# Verification: Change Check Overlap

## Requirements

### Requirement: Command signature

#### Scenario: Command accepts optional name and format

- **WHEN** `specd change overlap` is run without arguments
- **THEN** it shows overlap for all active changes
- **AND** defaults to `text` format

#### Scenario: Named change filter

- **WHEN** `specd change overlap my-change` is run
- **THEN** the output only shows overlap entries involving `my-change`

### Requirement: Text output format

#### Scenario: Two specs overlapping across multiple changes

- **GIVEN** changes `alpha` (designing) and `beta` (implementing) both target `core:core/config`
- **AND** changes `beta` and `gamma` (designing) both target `core:core/kernel`
- **WHEN** `specd change overlap` is run in text mode
- **THEN** stdout shows two groups, sorted by spec ID
- **AND** the first group header is `core:core/config` with `alpha` and `beta` listed below
- **AND** the second group header is `core:core/kernel` with `beta` and `gamma` listed below

### Requirement: JSON output format

#### Scenario: JSON output matches OverlapReport structure

- **GIVEN** overlap exists between two changes on one spec
- **WHEN** `specd change overlap --format json` is run
- **THEN** stdout is valid JSON with `hasOverlap` equal to `true`
- **AND** `entries` is an array of objects with `specId` and `changes` fields

### Requirement: No overlap output

#### Scenario: No overlap in text mode

- **GIVEN** no specs are targeted by more than one active change
- **WHEN** `specd change overlap` is run
- **THEN** stdout contains `no overlap detected`
- **AND** exit code is 0

#### Scenario: No overlap in JSON mode

- **GIVEN** no overlap exists
- **WHEN** `specd change overlap --format json` is run
- **THEN** stdout is `{"hasOverlap":false,"entries":[]}`
- **AND** exit code is 0

### Requirement: Named change not found

#### Scenario: Error for nonexistent change

- **WHEN** `specd change overlap nonexistent` is run
- **THEN** stderr contains an error message
- **AND** exit code is 1

### Requirement: Exit codes

#### Scenario: Overlap present does not affect exit code

- **GIVEN** overlap exists between active changes
- **WHEN** `specd change overlap` is run
- **THEN** exit code is 0
