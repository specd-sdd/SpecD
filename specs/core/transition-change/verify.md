# Verification: TransitionChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `TransitionChange.execute` is called with a name that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

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

### Requirement: Transition to designing from any state

#### Scenario: Transition from archivable to designing

- **GIVEN** a change in `archivable` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`

#### Scenario: Transition from implementing to designing

- **GIVEN** a change in `implementing` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`

#### Scenario: Transition to designing invalidates active approvals

- **GIVEN** a change in `implementing` state with an active spec approval
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** `change.invalidate` is called before the transition
- **AND** the spec approval is cleared
- **AND** the change transitions to `designing`

#### Scenario: Transition to designing without active approvals skips invalidation

- **GIVEN** a change in `implementing` state with no active approvals
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** `change.invalidate` is not called
- **AND** the change transitions to `designing`

#### Scenario: Transition to designing from drafting is not a special case

- **GIVEN** a change in `drafting` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing` via the normal transition path (no approval invalidation logic)

### Requirement: Post-hook execution

#### Scenario: Post hooks run for the source state, not the target

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post: [{ id: run-tests, run: pnpm test }]`
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** `RunStepHooks.execute` is called with `{ step: 'implementing', phase: 'post' }`

#### Scenario: Post hooks do not run for the target state on entry

- **GIVEN** a change in `ready` state
- **AND** the schema declares `implementing.hooks.post: [{ id: run-tests, run: pnpm test }]`
- **AND** the schema declares no hooks for `ready`
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** no post hooks are executed

#### Scenario: Post hooks skipped when source state has no workflow step

- **GIVEN** a change in `drafting` state
- **AND** the schema declares no workflow step for `drafting`
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** no post hooks are executed

#### Scenario: Source post hooks run before target pre hooks

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post` and `verifying.hooks.pre`
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** `implementing.post` hooks execute first
- **AND** `verifying.pre` hooks execute second
- **AND** the state transition occurs third

#### Scenario: Post hook failure aborts transition

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post: [{ id: run-tests, run: pnpm test }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** `HookFailedError` is thrown
- **AND** no state transition occurs

#### Scenario: skipHookPhases source.post skips only post hooks

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post` and `verifying.hooks.pre`
- **WHEN** `execute` is called with `to: 'verifying'` and `skipHookPhases: new Set(['source.post'])`
- **THEN** `implementing.post` hooks are skipped
- **AND** `verifying.pre` hooks still execute

#### Scenario: skipHookPhases target.pre skips only pre hooks

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post` and `verifying.hooks.pre`
- **WHEN** `execute` is called with `to: 'verifying'` and `skipHookPhases: new Set(['target.pre'])`
- **THEN** `verifying.pre` hooks are skipped
- **AND** `implementing.post` hooks still execute

#### Scenario: skipHookPhases all skips everything

- **GIVEN** a change in `implementing` state
- **AND** the schema declares `implementing.hooks.post` and `verifying.hooks.pre`
- **WHEN** `execute` is called with `to: 'verifying'` and `skipHookPhases: new Set(['all'])`
- **THEN** no hooks are executed
- **AND** the state transition occurs

### Requirement: Transition delegation

#### Scenario: Invalid transition is rejected by entity

- **GIVEN** a change in `drafting` state
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** `change.transition` throws `InvalidStateTransitionError`

### Requirement: Persistence

#### Scenario: Change is saved after successful transition

- **WHEN** `TransitionChange.execute` completes successfully
- **THEN** `ChangeRepository.save` was called with the updated `Change` instance
