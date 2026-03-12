# Verification: TransitionChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `TransitionChange.execute` is called with a name that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Approval-gate routing for spec approval

#### Scenario: Ready to implementing is rerouted when spec approval is active

- **GIVEN** a change in `ready` state
- **WHEN** `execute` is called with `to: 'implementing'` and `approvalsSpec: true`
- **THEN** the change transitions to `pending-spec-approval`

#### Scenario: Ready to implementing is direct when spec approval is inactive

- **GIVEN** a change in `ready` state
- **WHEN** `execute` is called with `to: 'implementing'` and `approvalsSpec: false`
- **THEN** the change transitions to `implementing`

### Requirement: Approval-gate routing for signoff

#### Scenario: Done to archivable is rerouted when signoff is active

- **GIVEN** a change in `done` state
- **WHEN** `execute` is called with `to: 'archivable'` and `approvalsSignoff: true`
- **THEN** the change transitions to `pending-signoff`

#### Scenario: Done to archivable is direct when signoff is inactive

- **GIVEN** a change in `done` state
- **WHEN** `execute` is called with `to: 'archivable'` and `approvalsSignoff: false`
- **THEN** the change transitions to `archivable`

### Requirement: Task completion check on implementing to verifying

#### Scenario: Transition blocked by incomplete tasks

- **GIVEN** a change in `implementing` state with an artifact file containing an unchecked checkbox line
- **WHEN** `execute` is called with `to: 'verifying'` and a matching `implementingTaskChecks` entry
- **THEN** it throws `InvalidStateTransitionError`

#### Scenario: Transition allowed when all tasks are complete

- **GIVEN** a change in `implementing` state with an artifact file containing only checked checkboxes
- **WHEN** `execute` is called with `to: 'verifying'` and `implementingTaskChecks` entries
- **THEN** the change transitions to `verifying`

#### Scenario: Missing artifact file is skipped

- **GIVEN** a change in `implementing` state
- **WHEN** `execute` is called with `to: 'verifying'` and a task check referencing a non-existent artifact file
- **THEN** the check is skipped and the transition proceeds

#### Scenario: Invalid regex pattern is treated as non-matching

- **GIVEN** a change in `implementing` state
- **WHEN** `execute` is called with a task check whose `incompletePattern` is an invalid regex
- **THEN** the check is skipped and the transition proceeds

#### Scenario: No task checks provided defaults to empty

- **GIVEN** a change in `implementing` state
- **WHEN** `execute` is called with `to: 'verifying'` and no `implementingTaskChecks`
- **THEN** the transition proceeds without any task checks

### Requirement: Artifact validation clearing on verifying to implementing

#### Scenario: Artifact validations are cleared on verifying to implementing

- **GIVEN** a change in `verifying` state with validated artifacts
- **WHEN** `execute` is called with `to: 'implementing'` and `implementingRequires: ['spec', 'tasks']`
- **THEN** `change.clearArtifactValidations` is called with `['spec', 'tasks']` before the transition

#### Scenario: No implementingRequires defaults to empty

- **GIVEN** a change in `verifying` state
- **WHEN** `execute` is called with `to: 'implementing'` and no `implementingRequires`
- **THEN** `change.clearArtifactValidations` is called with an empty array

### Requirement: Transition delegation

#### Scenario: Invalid transition is rejected by entity

- **GIVEN** a change in `drafting` state
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** `change.transition` throws `InvalidStateTransitionError`

### Requirement: Persistence

#### Scenario: Change is saved after successful transition

- **WHEN** `TransitionChange.execute` completes successfully
- **THEN** `ChangeRepository.save` was called with the updated `Change` instance
