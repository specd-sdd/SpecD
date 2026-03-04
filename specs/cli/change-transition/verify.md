# Verification: Change Transition

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments

- **WHEN** `specd change transition my-change` is run without the target state
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Approval-gate routing

#### Scenario: Spec approval gate active

- **GIVEN** `approvals.spec: true` and the change is in `ready` state
- **WHEN** `specd change transition my-change implementing` is run
- **THEN** the change transitions to `pending-spec-approval`
- **AND** stdout shows `transitioned my-change: ready → pending-spec-approval`

#### Scenario: Signoff gate active

- **GIVEN** `approvals.signoff: true` and the change is in `done` state
- **WHEN** `specd change transition my-change archivable` is run
- **THEN** the change transitions to `pending-signoff`
- **AND** stdout shows `transitioned my-change: done → pending-signoff`

### Requirement: Pre- and post-hooks

#### Scenario: Hook failure

- **GIVEN** the target step has a `run:` pre-hook that exits with code 1
- **WHEN** `specd change transition my-change implementing` is run
- **THEN** the process exits with code 2
- **AND** the hook's output is forwarded

### Requirement: Output on success

#### Scenario: Successful direct transition

- **WHEN** `specd change transition my-change designing` succeeds
- **THEN** stdout contains `transitioned my-change: drafting → designing`
- **AND** the process exits with code 0

### Requirement: Invalid transition error

#### Scenario: Illegal state transition

- **GIVEN** the change is in `drafting` state
- **WHEN** `specd change transition my-change done` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Incomplete tasks error

#### Scenario: Unchecked checkboxes block verifying

- **GIVEN** the change is in `implementing` and a task artifact has unchecked checkboxes
- **WHEN** `specd change transition my-change verifying` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message naming the blocking artifact

#### Scenario: JSON output on successful transition

- **WHEN** `specd change transition my-change designing --format json` succeeds and the change was in `drafting` state
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `name` equal to `"my-change"`, `from` equal to `"drafting"`, and `to` equal to `"designing"`
- **AND** the process exits with code 0
