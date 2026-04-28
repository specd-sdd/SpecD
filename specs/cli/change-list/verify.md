# Verification: Change List

## Requirements

### Requirement: Command signature

#### Scenario: Canonical plural command

- **WHEN** `specd changes list` is run
- **THEN** the command executes successfully using the canonical group

#### Scenario: Singular alias command

- **WHEN** `specd change list` is run
- **THEN** it behaves as an alias of `specd changes list`

### Requirement: Output format

#### Scenario: Only active changes shown

- **GIVEN** the project has one active change in `changes/` and one drafted change in `drafts/`
- **WHEN** `specd change list` is run
- **THEN** stdout shows only the active change
- **AND** the drafted change is not shown

#### Scenario: Discarded changes not shown

- **GIVEN** the project has one discarded change in `discarded/` and no active changes
- **WHEN** `specd change list` is run
- **THEN** stdout does not show the discarded change
- **AND** stdout contains `no changes`

#### Scenario: Rows contain name, state, specIds, and schema

- **GIVEN** a change named `add-login` in state `designing` with specIds `['auth/login']` and schema `std` version `1`
- **WHEN** `specd change list` is run
- **THEN** the row for `add-login` shows `add-login`, `designing`, `auth/login`, and `std@1`

#### Scenario: JSON format output

- **GIVEN** one active change `add-login` in state `designing` with specId `auth/login` and schema `std` version `1`
- **WHEN** `specd change list --format json` is run
- **THEN** stdout is a valid JSON array containing one object with `name`, `state`, `specIds`, and `schema`
- **AND** `schema` has `name` equal to `"std"` and `version` equal to `1`
- **AND** the process exits with code 0

### Requirement: Empty output

#### Scenario: No active changes — text mode

- **WHEN** `specd change list` is run with no active changes in `changes/`
- **THEN** stdout contains `no changes`
- **AND** the process exits with code 0

#### Scenario: No active changes — JSON mode

- **WHEN** `specd change list --format json` is run with no active changes
- **THEN** stdout is `[]`
- **AND** the process exits with code 0
