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

### Requirement: Task completion check during requires enforcement

#### Scenario: Transition blocked by requiresTaskCompletion artifact with incomplete items

- **GIVEN** a change in `implementing` state
- **AND** the `verifying` step declares `requiresTaskCompletion: [tasks]`
- **AND** the `tasks` artifact file contains `- [ ] unfinished task`
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** it throws `InvalidStateTransitionError` with reason `incomplete-tasks`

#### Scenario: Transition allowed when all tasks complete

- **GIVEN** a change in `implementing` state
- **AND** the `verifying` step declares `requiresTaskCompletion: [tasks]`
- **AND** the tasks file contains only `- [x] done task`
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** the change transitions to `verifying`

#### Scenario: No gating when requiresTaskCompletion absent

- **GIVEN** a change in `implementing` state
- **AND** the `verifying` step has `requires: [tasks]` but no `requiresTaskCompletion`
- **AND** the tasks file contains incomplete items
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** the change transitions to `verifying` — no content check

#### Scenario: Missing artifact file is skipped

- **GIVEN** a step with `requiresTaskCompletion: [tasks]`
- **AND** the tasks file does not exist
- **WHEN** `execute` is called
- **THEN** the check is skipped and the transition proceeds

#### Scenario: Error carries incomplete and complete counts

- **GIVEN** a step with `requiresTaskCompletion: [tasks]`
- **AND** the tasks file has 5 complete items and 3 incomplete items
- **WHEN** `execute` is called
- **THEN** the error reason includes `artifactId: 'tasks'`, `incomplete: 3`, `complete: 5`, `total: 8`

#### Scenario: task-completion-failed progress event emitted before throwing

- **GIVEN** a step with `requiresTaskCompletion: [tasks]` and incomplete items
- **WHEN** `execute` is called with an `onProgress` callback
- **THEN** a `task-completion-failed` event is emitted with counts before the error is thrown

### Requirement: Workflow requires enforcement

#### Scenario: Unsatisfied requirement throws with structured reason

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** `specs` has effective status `in-progress`
- **WHEN** `execute` is called
- **THEN** `InvalidStateTransitionError` is thrown with reason `incomplete-artifact` and blocking artifact `specs`

### Requirement: Artifact validation clearing on verifying to implementing

#### Scenario: Artifact validations are cleared using schema requires

- **GIVEN** a change in `verifying` state with validated artifacts
- **AND** the schema's `implementing` step declares `requires: ['specs', 'tasks']`
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** `change.clearArtifactValidations` is called with `['specs', 'tasks']` from the schema

#### Scenario: No implementing step in schema defaults to no clearing

- **GIVEN** a change in `verifying` state
- **AND** the schema does not declare an `implementing` workflow step
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** `change.clearArtifactValidations` is not called

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
