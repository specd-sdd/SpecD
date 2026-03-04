# Verification: Archive Show

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd archive show` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format — text

#### Scenario: Normal text output

- **GIVEN** the archive directory contains a change `add-oauth-login` with specIds `['auth/oauth']` and schema `schema-std@1`
- **WHEN** `specd archive show add-oauth-login` is run
- **THEN** stdout contains `name:`, `state:`, `specs:`, and `schema:` fields with the correct values
- **AND** the `state:` line shows `archivable`
- **AND** the process exits with code 0

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** the archive directory contains a change `add-oauth-login` with specIds `['auth/oauth']` and schema `schema-std@1`
- **WHEN** `specd archive show add-oauth-login --format json` is run
- **THEN** stdout is a JSON object with `name`, `state`, `specIds`, and `schema` fields matching the change
- **AND** the `state` field is `"archivable"`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found in archive

- **WHEN** `specd archive show nonexistent` is run and no change named `nonexistent` exists in the archive
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
