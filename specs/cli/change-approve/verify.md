# Verification: Change Approve

## Requirements

### Requirement: Command signatures

#### Scenario: Missing reason flag

- **WHEN** `specd change approve spec my-change` is run without `--reason`
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Unknown sub-verb

- **WHEN** `specd change approve review my-change --reason "ok"` is run with an unknown sub-verb
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Delegates gate state to kernel

#### Scenario: Approve spec omits gate flag

- **WHEN** `specd change approve spec my-change --reason "ok"` is run
- **THEN** `ApproveSpec.execute` is called with `{ name, reason }` only
- **AND** `approvalsSpec` is not passed on the input object
- **AND** the call is routed through `kernel.changes.approveSpec`

#### Scenario: Approve signoff omits gate flag

- **WHEN** `specd change approve signoff my-change --reason "done"` is run
- **THEN** `ApproveSignoff.execute` is called with `{ name, reason }` only
- **AND** `approvalsSignoff` is not passed on the input object
- **AND** the call is routed through `kernel.changes.approveSignoff`

#### Scenario: Approve spec execute call shape

- **GIVEN** the change approve spec command succeeds
- **WHEN** the handler invokes the kernel use case
- **THEN** `kernel.changes.approveSpec.execute` receives an object with exactly `name` and `reason`
- **AND** `kernel.specs.approveSpec` is not invoked

#### Scenario: Approve signoff execute call shape

- **GIVEN** the change approve signoff command succeeds
- **WHEN** the handler invokes the kernel use case
- **THEN** `kernel.changes.approveSignoff.execute` receives an object with exactly `name` and `reason`
- **AND** `kernel.specs.approveSignoff` is not invoked

### Requirement: Artifact hash computation

#### Scenario: Hashes computed by use case from disk

- **GIVEN** artifact files exist on disk for the change
- **WHEN** `specd change approve spec my-change --reason "ok"` is run
- **THEN** the approval event in history contains `artifactHashes` computed by `ApproveSpec` from current file content on disk
- **AND** the CLI did not compute or pass hash values

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
