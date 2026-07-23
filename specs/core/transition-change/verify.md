# Verification: TransitionChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `TransitionChange.execute` is called with a name that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Optional pre-transition implementation tracking refresh

#### Scenario: TransitionChange does not invoke detector directly

- **GIVEN** a change has entered `implementing` at least once
- **WHEN** `TransitionChange.execute()` runs
- **THEN** it does not invoke `ImplementationDetector` directly
- **AND** it does not duplicate refresh merge logic

#### Scenario: Active change refreshes by default

- **GIVEN** an active change exists in `changes/` storage
- **GIVEN** `TransitionChange` is constructed with project approval configuration
- **WHEN** `TransitionChange.execute({ name, to })` is called without `refreshImplementationTrackingBefore`
- **THEN** it invokes `RefreshImplementationTracking.execute({ name })` before lifecycle evaluation

#### Scenario: Explicit opt-out skips refresh

- **GIVEN** an active change exists in `changes/` storage
- **GIVEN** `TransitionChange` is constructed with project approval configuration
- **WHEN** `TransitionChange.execute({ name, to, refreshImplementationTrackingBefore: false })` is called
- **THEN** it does not invoke `RefreshImplementationTracking`

### Requirement: Approval-gate routing for spec approval

#### Scenario: Ready to implementing is rerouted when spec approval is active

- **GIVEN** a change in `ready` state
- **GIVEN** `TransitionChange` is constructed with `approvals.spec: true`
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** the `LifecycleEngine` identifies `pending-spec-approval` as the effective target
- **AND** the change transitions to `pending-spec-approval`

#### Scenario: Ready to implementing is direct when spec approval is inactive

- **GIVEN** a change in `ready` state
- **GIVEN** `TransitionChange` is constructed with `approvals.spec: false`
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** the `LifecycleEngine` identifies `implementing` as the effective target
- **AND** the change transitions to `implementing`

### Requirement: Approval-gate routing for signoff

#### Scenario: Done to archivable is rerouted when signoff is active

- **GIVEN** a change in `done` state
- **GIVEN** `TransitionChange` is constructed with `approvals.signoff: true`
- **WHEN** `execute` is called with `to: 'archivable'`
- **THEN** the `LifecycleEngine` identifies `pending-signoff` as the effective target
- **AND** the change transitions to `pending-signoff`

#### Scenario: Done to archivable is direct when signoff is inactive

- **GIVEN** a change in `done` state
- **GIVEN** `TransitionChange` is constructed with `approvals.signoff: false`
- **WHEN** `execute` is called with `to: 'archivable'`
- **THEN** the `LifecycleEngine` identifies `archivable` as the effective target
- **AND** the change transitions to `archivable`

### Requirement: Human-approval pending states produce explicit transition failures

#### Scenario: Pending spec approval blocks normal forward transition

- **GIVEN** a change in `pending-spec-approval` state
- **WHEN** `execute` is called with `to: 'spec-approved'`
- **THEN** the `LifecycleEngine` identifies an approval-required blocker
- **AND** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'spec' }`

#### Scenario: Pending signoff blocks normal forward transition

- **GIVEN** a change in `pending-signoff` state
- **WHEN** `execute` is called with `to: 'signed-off'`
- **THEN** the `LifecycleEngine` identifies an approval-required blocker
- **AND** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'signoff' }`

#### Scenario: Pending approval still allows redesign

- **GIVEN** a change in `pending-spec-approval` state
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`

### Requirement: Task completion check during requires enforcement

#### Scenario: Incomplete delegated count blocks transition

- **GIVEN** a completion-gated artifact has an incomplete count returned by `CountTasks`
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** it emits `task-completion-failed`
- **AND** throws `InvalidStateTransitionError` with reason `incomplete-tasks` and the counts

#### Scenario: Missing task capability blocks a gated artifact

- **GIVEN** a workflow step requires task completion for an artifact without `hasTasks: true`
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** it throws `InvalidStateTransitionError` with reason `missing-task-capability`

#### Scenario: Missing completion configuration blocks a gated artifact

- **GIVEN** a workflow step requires task completion for an artifact with `hasTasks: true` but no `taskCompletionCheck`
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** it throws `InvalidStateTransitionError` with reason `missing-task-capability`

#### Scenario: All completed tasks allow transition

- **GIVEN** every completion-gated artifact has no incomplete count in `CountTasksResult.byArtifact`
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** the change transitions to the target state

#### Scenario: No task gate does not inspect content

- **GIVEN** the target workflow step omits `requiresTaskCompletion`
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** it does not apply task-completion gating

#### Scenario: Missing task content does not block a capable artifact

- **GIVEN** a completion-gated artifact declares both task capability and `taskCompletionCheck`
- **AND** `CountTasksResult.byArtifact` has no entry because no qualifying content exists
- **WHEN** `TransitionChange.execute()` targets that step
- **THEN** it does not block the transition for task completion

### Requirement: Workflow requires enforcement

#### Scenario: Unsatisfied requirement throws with structured reason

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** `LifecycleEngine` reports `specs` with effective status `in-progress`
- **WHEN** `execute` is called
- **THEN** `InvalidStateTransitionError` is thrown with reason `incomplete-artifact` and blocking artifact `specs`

#### Scenario: Transition blocked by recursive parent review

- **GIVEN** a workflow step requires artifact `design`
- **AND** `LifecycleEngine` reports `design` as `pending-parent-artifact-review`
- **AND** the detailed blocker context includes `blockedBy: { artifactId: 'specs', status: 'pending-review' }`
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

### Requirement: Transition from archiving to archivable

#### Scenario: Manual transition from archiving to archivable succeeds

- **GIVEN** a change in `archiving` state
- **WHEN** `TransitionChange.execute` is called with `to: 'archivable'`
- **THEN** the change transitions to `archivable`
- **AND** archive workflow hooks for `archivable` are not executed

#### Scenario: Transition from archiving to designing downgrades artifacts

- **GIVEN** a change in `archiving` state with validated artifacts
- **WHEN** `TransitionChange.execute` is called with `to: 'designing'`
- **THEN** the change transitions to `designing`
- **AND** artifact files are downgraded for review

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

### Requirement: Input contract

#### Scenario: Input accepts transition controls without approval flags

- **WHEN** `TransitionChange.execute` is called
- **THEN** its input accepts `name`, `to`, and optional `skipHookPhases` and `refreshImplementationTrackingBefore`
- **AND** its input does not accept `approvalsSpec` or `approvalsSignoff`

#### Scenario: Approval gates are fixed at construction

- **GIVEN** `TransitionChange` is constructed with `approvals: { spec: true, signoff: false }`
- **WHEN** `execute` is called with `to: 'implementing'` from `ready`
- **THEN** routing uses the constructor-provided `approvals.spec` value

### Requirement: Approval gates baked at construction

#### Scenario: Factory passes config.approvals

- **WHEN** `createTransitionChange(config)` constructs the use case
- **THEN** the instance receives `config.approvals` as its baked gate configuration

#### Scenario: Execute does not accept gate overrides

- **GIVEN** `TransitionChange` is constructed with `approvals.spec: false`
- **WHEN** a caller attempts to pass approval gate fields on `TransitionChangeInput`
- **THEN** TypeScript rejects the call at compile time

### Requirement: Direct transition when gates are inactive

#### Scenario: Requested target is used directly when no gate reroutes it

- **GIVEN** no approval gate applies to the requested target
- **WHEN** `execute` is called
- **THEN** the requested target state is used directly

### Requirement: Pre-hook execution

#### Scenario: Target pre-hooks run before the state mutation

- **GIVEN** the target workflow step defines pre-hooks
- **WHEN** `execute` is called and hooks are not skipped
- **THEN** those target pre-hooks execute before the lifecycle transition

### Requirement: Transition event

#### Scenario: Successful transition emits transitioned progress event

- **WHEN** a state transition succeeds
- **THEN** a `transitioned` progress event is emitted with the source and target states

### Requirement: Result type

#### Scenario: Successful execution returns the updated change

- **WHEN** `TransitionChange.execute` succeeds
- **THEN** the returned result contains the updated `change`

### Requirement: Progress callback

#### Scenario: Progress callback receives hook and requires events

- **WHEN** `TransitionChange.execute` is called with an `onProgress` callback
- **THEN** the callback receives lifecycle progress events such as `requires-check`, `hook-start`, `hook-done`, and `transitioned`

### Requirement: Dependencies

#### Scenario: TransitionChange depends on LifecycleEngine and RunStepHooks

- **WHEN** `TransitionChange` is assembled
- **THEN** it receives `ChangeRepository`, `ActorResolver`, `SchemaProvider`, `LifecycleEngine`, `RunStepHooks`, and `RefreshImplementationTracking`

### Requirement: Config-based factory delegates through resolveTransitionChangeDeps

#### Scenario: createTransitionChange config form derives TransitionChangeDeps through resolveTransitionChangeDeps

- **WHEN** `createTransitionChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `TransitionChangeDeps` through `resolveTransitionChangeDeps(resolver)`
- **AND** `resolveTransitionChangeDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `runStepHooks: RunStepHooks`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `approvals: ApprovalGates`
- `lifecycle: LifecycleEngine`
- **AND** the factory delegates to canonical `createTransitionChange(deps)`
