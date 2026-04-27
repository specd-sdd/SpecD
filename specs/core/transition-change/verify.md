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

### Requirement: Human-approval pending states produce explicit transition failures

#### Scenario: Pending spec approval blocks normal forward transition

- **GIVEN** a change in `pending-spec-approval` state
- **WHEN** `execute` is called with `to: 'spec-approved'`
- **THEN** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'spec' }`

#### Scenario: Pending signoff blocks normal forward transition

- **GIVEN** a change in `pending-signoff` state
- **WHEN** `execute` is called with `to: 'signed-off'`
- **THEN** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'signoff' }`

#### Scenario: Pending approval still allows redesign

- **GIVEN** a change in `pending-spec-approval` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`

### Requirement: Task completion check during requires enforcement

#### Scenario: Transition blocked by requiresTaskCompletion artifact with incomplete items

- **GIVEN** a change in `implementing` state
- **AND** the `verifying` step declares `requiresTaskCompletion: [tasks]`
- **AND** the `tasks` artifact file contains `- [ ] unfinished task`
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** it throws `InvalidStateTransitionError` with reason `incomplete-tasks`

#### Scenario: Transition blocked by missing task capability (defensive check)

- **GIVEN** a workflow step declares `requiresTaskCompletion: [proposal]`
- **AND** artifact `proposal` has `hasTasks: false`
- **WHEN** `execute` is called
- **THEN** it throws `InvalidStateTransitionError` with reason `missing-task-capability`

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

#### Scenario: Transition blocked by recursive parent review

- **GIVEN** a workflow step requires artifact `design`
- **AND** `design` is `complete` but depends on `specs` which is `pending-review`
- **AND** `design` effective status is `'pending-parent-artifact-review'`
- **WHEN** `execute` is called
- **THEN** it throws `InvalidStateTransitionError`
- **AND** the error reason includes `status: 'pending-parent-artifact-review'`
- **AND** it includes `blockedBy: { artifactId: 'specs', status: 'pending-review' }`

### Requirement: Artifact validation clearing on verifying to implementing

#### Scenario: Implementation-only retry preserves validated artifacts

- **GIVEN** a change in `verifying` state with validated artifacts
- **AND** verification fails for implementation-only reasons
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** unchanged validated artifacts are not cleared

#### Scenario: Artifact review required does not route through implementing

- **GIVEN** a change in `verifying` state
- **AND** the required fix needs new tasks or revised artifacts
- **WHEN** lifecycle routing is resolved
- **THEN** the caller must transition to `designing`, not `implementing`

### Requirement: Transition to designing from any state

#### Scenario: Transition from archivable to designing

- **GIVEN** a change in `archivable` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`

#### Scenario: Transition to designing downgrades files to pending-review

- **GIVEN** a change with validated artifacts
- **AND** one file is already `drifted-pending-review`
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** every other tracked file becomes `pending-review`
- **AND** the drifted file remains `drifted-pending-review`

#### Scenario: Transition to designing invalidates active approvals

- **GIVEN** a change in `implementing` state with an active spec approval
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the approval is invalidated before the transition

#### Scenario: Transition from designing to designing does not invalidate

- **GIVEN** a change already in `designing` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** `change.invalidate()` is not called
- **AND** `change.transition('designing', actor)` is called directly
- **AND** no artifact files are downgraded
- **AND** no approvals are cleared

#### Scenario: Transition from drafting to designing does not invalidate

- **GIVEN** a change in `drafting` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** `change.invalidate()` is not called
- **AND** `change.transition('designing', actor)` is called directly

#### Scenario: Transition from implementing to designing invalidates

- **GIVEN** a change in `implementing` state with validated artifacts
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** `change.invalidate()` is called with cause `'artifact-review-required'`
- **AND** all artifact files are downgraded to `pending-review`
- **AND** any active spec approval is cleared

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

#### Scenario: Change is saved after successful transition through serialized mutation

- **WHEN** `TransitionChange.execute` completes successfully
- **THEN** `ChangeRepository.mutate(input.name, fn)` was called for the final persisted mutation
- **AND** the callback applied any redesign invalidation, validation clearing, and lifecycle transition on the fresh persisted `Change`
