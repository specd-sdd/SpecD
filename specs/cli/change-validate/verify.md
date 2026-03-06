# Verification: Change Validate

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments

- **WHEN** `specd change validate my-change` is run without the spec ID
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output on success

#### Scenario: All artifacts pass, no warnings

- **GIVEN** a change where all artifacts pass validation
- **WHEN** `specd change validate my-change default:auth/login` is run
- **THEN** stdout contains `validated my-change/default:auth/login: all artifacts pass`
- **AND** the process exits with code 0

#### Scenario: Pass with warnings

- **GIVEN** a change where artifacts pass but there are optional rule mismatches
- **WHEN** `specd change validate my-change default:auth/login` is run
- **THEN** stdout contains a pass message and `warning:` lines for each warning
- **AND** the process exits with code 0

### Requirement: Output on failure

#### Scenario: Validation failures

- **GIVEN** a change where a required artifact fails validation
- **WHEN** `specd change validate my-change default:auth/login` is run
- **THEN** stdout contains `validation failed` and `error:` lines for each failure
- **AND** the process exits with code 1

### Requirement: Spec ID not in change

#### Scenario: Unknown spec ID

- **GIVEN** a change with specId `default:auth/login`
- **WHEN** `specd change validate my-change default:billing/invoices` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change validate nonexistent default:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

#### Scenario: JSON output on pass

- **GIVEN** a change where all artifacts pass validation with no warnings
- **WHEN** `specd change validate my-change default:auth/login --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `true`, `failures` equal to `[]`, and `warnings` equal to `[]`
- **AND** the process exits with code 0

### Requirement: Output on failure

#### Scenario: JSON output on failure

- **GIVEN** a change where a required artifact fails validation
- **WHEN** `specd change validate my-change default:auth/login --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `false` and `failures` containing at least one entry with `artifactId` and `description`
- **AND** the process exits with code 1
