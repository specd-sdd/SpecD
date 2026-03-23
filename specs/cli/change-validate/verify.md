# Verification: Change Validate

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments

- **WHEN** `specd change validate my-change` is run without the spec ID
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Artifact flag accepted

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **WHEN** `specd change validate my-change default:auth/login --artifact proposal` is run
- **THEN** the command invokes validation for only the `proposal` artifact
- **AND** the process exits with code 0 if `proposal` passes validation

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

### Requirement: Unknown artifact ID

#### Scenario: Unknown artifact ID exits with failure

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **AND** the active schema has no artifact with ID `nonexistent`
- **WHEN** `specd change validate my-change default:auth/login --artifact nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stdout contains the validation failure describing the unknown artifact ID

#### Scenario: Unknown artifact ID with JSON format

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **AND** the active schema has no artifact with ID `nonexistent`
- **WHEN** `specd change validate my-change default:auth/login --artifact nonexistent --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `false`
- **AND** `failures` contains an entry describing the unknown artifact ID
- **AND** the process exits with code 1

### Requirement: Batch mode (--all)

#### Scenario: --all without specPath validates all specIds

- **GIVEN** a change with specIds `["default:auth/login", "default:auth/logout"]` and valid artifacts for both
- **WHEN** `specd change validate my-change --all` is run
- **THEN** both specs are validated
- **AND** text output shows success for each spec
- **AND** summary shows `validated 2/2 specs`

#### Scenario: --all with specPath is rejected

- **WHEN** `specd change validate my-change default:auth/login --all` is run
- **THEN** stderr contains `error: --all and <specPath> are mutually exclusive` and exit code is 1

#### Scenario: neither specPath nor --all is rejected

- **WHEN** `specd change validate my-change` is run without specPath or --all
- **THEN** stderr contains `error: either <specPath> or --all is required` and exit code is 1

#### Scenario: --all with --artifact validates one artifact across all specs

- **GIVEN** a change with 2 specIds
- **WHEN** `specd change validate my-change --all --artifact proposal` is run
- **THEN** only the `proposal` artifact is validated for each spec

#### Scenario: --all with partial failures exits 1

- **GIVEN** a change with 2 specIds, one passes and one fails validation
- **WHEN** `specd change validate my-change --all` is run
- **THEN** both specs are validated (batch continues)
- **AND** exit code is 1
- **AND** summary shows `validated 1/2 specs`

#### Scenario: --all JSON output

- **GIVEN** a change with 2 specIds, both pass
- **WHEN** `specd change validate my-change --all --format json` is run
- **THEN** output is `{ passed: true, total: 2, results: [...] }` with per-spec entries

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
