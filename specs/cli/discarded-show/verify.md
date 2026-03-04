# Verification: Discarded Show

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd discarded show` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format — text

#### Scenario: Normal text output includes reason

- **GIVEN** `discarded/` contains a change `old-experiment` with specIds `['auth/legacy']`, schema `schema-std@1`, and a `discarded` event with reason `"approach superseded by new-design"`
- **WHEN** `specd discarded show old-experiment` is run
- **THEN** stdout contains `name:`, `specs:`, `schema:`, and `reason:` fields with the correct values
- **AND** the `reason:` line shows `approach superseded by new-design`
- **AND** the process exits with code 0

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `discarded/` contains a change `old-experiment` with specIds `['auth/legacy']`, schema `schema-std@1`, and discard reason `"approach superseded by new-design"`
- **WHEN** `specd discarded show old-experiment --format json` is run
- **THEN** stdout is a JSON object with `name`, `specIds`, `schema`, and `reason` fields matching the change
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found in discarded

- **WHEN** `specd discarded show nonexistent` is run and no change named `nonexistent` exists in `discarded/`
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
