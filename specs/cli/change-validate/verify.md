# Verification: Change Validate

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments — but artifact targets change-scoped

- **WHEN** `specd change validate my-change --artifact design` is run (no spec ID)
- **AND** `design` is a `scope: change` artifact in the schema
- **THEN** the command proceeds with validation using artifact ID only
- **AND** it does NOT require specPath because design is change-scoped
- **AND** the process exits with code 0 if design passes validation

#### Scenario: Missing arguments with scope: spec artifact

- **WHEN** `specd change validate my-change --artifact specs` is run (no spec ID)
- **AND** `specs` is a `scope: spec` artifact in the schema
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Artifact flag accepted

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **WHEN** `specd change validate my-change default:auth/login --artifact proposal` is run
- **THEN** the command invokes validation for only the `proposal` artifact
- **AND** the process exits with code 0 if `proposal` passes validation

### Requirement: Behaviour

#### Scenario: File path details come from validation metadata

- **GIVEN** `ValidateArtifacts.execute` returns a file entry with filename `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:core/config --artifact specs` renders output
- **THEN** the CLI prints or serializes that filename from the result metadata
- **AND** it does not recompute a replacement path in the CLI layer

### Requirement: Output on success

#### Scenario: All artifacts pass, no notes

- **GIVEN** a change where all artifacts pass validation
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:core/config --artifact specs` is run
- **THEN** stdout contains `validated my-change/core:core/config: all artifacts pass`
- **AND** stdout contains `file: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `specd change spec-preview my-change core:core/config`
- **AND** the process exits with code 0

#### Scenario: Pass with notes

- **GIVEN** a change where artifacts pass but there are optimization notes
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:core/config --artifact specs` is run
- **THEN** stdout contains a pass message with `pass (N note(s))`
- **AND** stdout contains `note:` lines for each note
- **AND** stdout contains `file: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `specd change spec-preview my-change core:core/config`
- **AND** the process exits with code 0

#### Scenario: JSON output on pass includes notes and files

- **GIVEN** a change where all artifacts pass validation with optimization notes
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:core/config --artifact specs --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `true`, `failures` equal to `[]`, and a `notes` array
- **AND** `files` contains an entry with `filename: \"deltas/core/core/config/spec.md.delta.yaml\"`
- **AND** the process exits with code 0

### Requirement: Output on failure

#### Scenario: Validation failures with notes

- **GIVEN** a change where a required artifact fails validation and has optimization notes
- **AND** validation reports missing file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:core/config --artifact specs` is run
- **THEN** stdout contains `validation failed`
- **AND** stdout contains `missing: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `error:` lines for each failure
- **AND** stdout contains `note:` lines for each note
- **AND** the process exits with code 1

#### Scenario: JSON output on failure includes notes and files

- **GIVEN** a change where a required artifact fails validation and has notes
- **WHEN** `specd change validate my-change core:core/config --artifact specs --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `false`
- **AND** `failures` contains at least one entry
- **AND** `notes` contains the optimization suggestions
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
