# Verification: Change Approve

## Requirements

### Requirement: Command signatures

#### Scenario: Missing reason flag

- **WHEN** `specd change approve spec my-change` is run without `--reason`
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Unknown sub-verb

- **WHEN** `specd change approve review my-change --reason "ok"` is run with an unknown sub-verb
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Artifact hash computation

#### Scenario: Hashes computed from disk

- **GIVEN** artifact files exist on disk for the change
- **WHEN** `specd change approve spec my-change --reason "ok"` is run
- **THEN** the approval event in history contains `artifactHashes` computed from the current file content on disk
- **AND** the user did not supply any hash values

### Requirement: Approve spec behaviour

#### Scenario: Successful spec approval

- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `specd change approve spec my-change --reason "looks good"` is run
- **THEN** the change transitions to `spec-approved`
- **AND** stdout contains `approved spec for my-change`
- **AND** the process exits with code 0

#### Scenario: Wrong state for spec approval

- **GIVEN** the change is in `designing` state
- **WHEN** `specd change approve spec my-change --reason "ok"` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Approve signoff behaviour

#### Scenario: Successful signoff

- **GIVEN** the change is in `pending-signoff` state
- **WHEN** `specd change approve signoff my-change --reason "done"` is run
- **THEN** the change transitions to `signed-off`
- **AND** stdout contains `approved signoff for my-change`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change approve spec nonexistent --reason "ok"` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

#### Scenario: JSON output on successful approval

- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `specd change approve spec my-change --reason "looks good" --format json` is run
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `gate` equal to `"spec"`, and `name` equal to `"my-change"`
- **AND** the process exits with code 0
