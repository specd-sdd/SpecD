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

Scenarios:

#### Scenario: CLI never computes approval fingerprints

- **WHEN** either approval command runs
- **THEN** it delegates fingerprinting and reconciliation to the corresponding core use case

#### Scenario: Ineligible approval reports canonical blocker

- **WHEN** core returns recovery or unresolved review
- **THEN** CLI reports it without presenting approval success

#### Scenario: Approval failure reloads canonical recovery context

- **GIVEN** an approval use case fails after committing reconciliation
- **WHEN** the command formats the failure
- **THEN** it obtains canonical status or consumes the equivalent structured core result
- **AND** text, JSON, and TOON include actual state, blockers, and next action
- **AND** no stale pre-operation state is rendered

### Requirement: Approve spec behaviour

#### Scenario: Successful spec approval from ready

- **GIVEN** the change is in `ready` and the spec gate is on
- **WHEN** `specd change approve spec my-change --reason "looks good"` is run
- **THEN** the change remains in `ready`
- **AND** a spec approval is recorded
- **AND** stdout contains `approved spec for my-change`
- **AND** the process exits with code 0

#### Scenario: Wrong state for spec approval

- **GIVEN** the change is in `designing` state
- **WHEN** `specd change approve spec my-change --reason "ok"` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Approve signoff behaviour

#### Scenario: Successful signoff from done

- **GIVEN** the change is in `done` and the signoff gate is on
- **WHEN** `specd change approve signoff my-change --reason "done"` is run
- **THEN** the change remains in `done`
- **AND** a signoff is recorded
- **AND** stdout contains `approved signoff for my-change`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change approve spec nonexistent --reason "ok"` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success

Scenarios:

#### Scenario: Signoff output distinguishes empty from unknown

- **WHEN** signoff succeeds with an observed empty implementation map
- **THEN** output presents valid empty evidence and its algorithm
- **AND** does not describe it as legacy missing evidence or print file contents

#### Scenario: Success reports materialized evidence metadata

- **WHEN** approval succeeds
- **THEN** output includes gate, valid status, actor, time, and summarized fingerprint scope
