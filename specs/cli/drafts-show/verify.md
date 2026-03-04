# Verification: Drafts Show

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd drafts show` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format — text

#### Scenario: Normal text output

- **GIVEN** `drafts/` contains a change `old-experiment` in state `drafting` with specIds `['auth/legacy']` and schema `schema-std@1`
- **WHEN** `specd drafts show old-experiment` is run
- **THEN** stdout contains `name:`, `state:`, `specs:`, and `schema:` fields with the correct values
- **AND** the process exits with code 0

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `drafts/` contains a change `old-experiment` in state `drafting` with specIds `['auth/legacy']` and schema `schema-std@1`
- **WHEN** `specd drafts show old-experiment --format json` is run
- **THEN** stdout is a JSON object with `name`, `state`, `specIds`, and `schema` fields matching the change
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd drafts show nonexistent` is run and no change named `nonexistent` exists anywhere
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Change not in drafts

- **GIVEN** `my-change` is active in `changes/` (not drafted)
- **WHEN** `specd drafts show my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
