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

### Requirement: Spec approval is a check not a pending hop

Scenarios:

#### Scenario: Stale approval returns to design instead of parking

- **GIVEN** required spec approval is stale at `ready`
- **WHEN** a forward transition is requested
- **THEN** reconciliation commits `designing` recovery and the request fails
- **AND** no pending approval state is entered

#### Scenario: Valid current consent permits normal edge evaluation

- **WHEN** spec approval is valid for current canonical scope and artifacts
- **THEN** approval check passes without rewriting the requested target

### Requirement: Signoff is a check not a pending hop

Scenarios:

#### Scenario: Signoff requires current verification and fingerprints

- **GIVEN** signoff exists but verification or signed inputs are stale
- **WHEN** `done → archivable` is requested
- **THEN** the request fails with verification or signoff recovery guidance
- **AND** no pending signoff state is entered

#### Scenario: Disabled signoff predicate skips

- **WHEN** the signoff gate is disabled for `done → archivable`
- **THEN** signoff check skips while other transition checks remain applicable

### Requirement: Human-approval pending states produce explicit transition failures

#### Scenario: Pending spec approval blocks normal forward transition

- **GIVEN** a change in `pending-spec-approval` state
- **WHEN** `execute` is called with `to: 'spec-approved'`
- **THEN** matching predicates / `evaluateLifecycle` identify an approval-required or invalid-transition blocker
- **AND** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'spec' }` or `{ type: 'invalid-transition' }`

#### Scenario: Pending signoff blocks normal forward transition

- **GIVEN** a change in `pending-signoff` state
- **WHEN** `execute` is called with `to: 'signed-off'`
- **THEN** matching predicates / `evaluateLifecycle` identify an approval-required or invalid-transition blocker
- **AND** it throws `InvalidStateTransitionError`
- **AND** the error reason equals `{ type: 'approval-required', gate: 'signoff' }` or `{ type: 'invalid-transition' }`

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

#### Scenario: Task-completion check owns CountTasks

- **GIVEN** `GetStatus` already evaluated `workflow.taskCompletion` as fail
- **WHEN** `TransitionChange.execute()` targets `verifying`
- **THEN** it throws `incomplete-tasks`
- **AND** the use case does not invoke `CountTasks` after a green predicate `execute`

### Requirement: Canonical pre-transition validity reconciliation

#### Scenario: Committed recovery survives failed requested transition

- **GIVEN** fresh reconciliation invalidates required consent and returns the change to `designing`
- **WHEN** the original forward transition becomes inapplicable
- **THEN** it fails with the committed state, blockers, and next action
- **AND** does not undo recovery

#### Scenario: Recovery failure uses the canonical diagnostic contract

- **GIVEN** reconciliation changes the lifecycle state before the requested edge is evaluated
- **WHEN** the requested transition is no longer applicable
- **THEN** the typed failure exposes committed state, automatic return, canonical blockers, and next action
- **AND** it is not reduced to an invalid-state message without recovery context

### Requirement: Workflow requires enforcement

#### Scenario: Unsatisfied requirement throws with structured reason

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** `projectArtifacts` reports `specs` with effective status `in-progress`
- **WHEN** `execute` is called
- **THEN** `InvalidStateTransitionError` is thrown with reason `incomplete-artifact` and blocking artifact `specs`

#### Scenario: Transition blocked by recursive parent review

- **GIVEN** a workflow step requires artifact `design`
- **AND** `projectArtifacts` reports `design` as `pending-parent-artifact-review`
- **AND** the detailed blocker context includes `blockedBy: { artifactId: 'specs', status: 'pending-review' }`
- **WHEN** `execute` is called
- **THEN** it throws `InvalidStateTransitionError`
- **AND** the error reason includes `status: 'pending-parent-artifact-review'`
- **AND** it includes `blockedBy: { artifactId: 'specs', status: 'pending-review' }`

#### Scenario: Requires failure matches predicate evaluation

- **GIVEN** matching `workflow.requires` already failed for the attempt
- **WHEN** `TransitionChange.execute()` runs
- **THEN** the thrown `incomplete-artifact` reason identifies the same artifact

### Requirement: Implementation-only retry from verifying

#### Scenario: Implementation-only retry preserves validated artifacts

- **GIVEN** a change in `verifying` with validated artifacts and an implementation-only verification failure
- **WHEN** `verifying → implementing` executes
- **THEN** unchanged artifact and file states remain complete
- **AND** `implementing.requires` is not used to clear their validation

#### Scenario: Artifact or task revision routes to designing

- **GIVEN** verification discovers that the intended artifacts or task plan must change
- **WHEN** the failure is classified
- **THEN** the caller routes to `designing`, not through an implementation-only retry

### Requirement: Verification attempt lifecycle

#### Scenario: Entering verifying checks readiness only

- **GIVEN** all implementation files and links are resolved
- **WHEN** a real transition enters `verifying`
- **THEN** readiness checks pass and the state changes
- **AND** no verification attempt or completion is created

#### Scenario: Exit rejects evidence changed by hooks

- **GIVEN** completed evidence initially matches
- **WHEN** a pre-persist hook changes a fingerprinted input before `verifying → done`
- **THEN** fresh `verification.current` evaluation blocks persistence
- **AND** recommends renewing verification in the current reconciled state

#### Scenario: Implementing to verifying deduplicates readiness checks

- **GIVEN** the hop matches forward-exit and verifying-entry bindings
- **WHEN** transition checks execute
- **THEN** each implementation readiness check runs once

#### Scenario: Other implementation boundaries remain guarded

- **WHEN** a permitted forward hop exits `implementing` without targeting `verifying`, or another state enters `verifying`
- **THEN** the applicable implementation readiness checks still execute

#### Scenario: Missing verification verdict blocks exit

- **WHEN** `verifying → done` has no canonical verification verdict
- **THEN** exit fails closed with typed unavailable-validity guidance
- **AND** only an explicit `not-required` verdict may skip the predicate

### Requirement: Skill-aligned backward hop invalidation

Scenarios:

#### Scenario: Backward movement preserves matching verification

- **GIVEN** completed verification still matches current inputs
- **WHEN** the change moves backward below verification
- **THEN** verification remains valid
- **AND** independently affected signoff follows its recovery rules

#### Scenario: Changed inputs stale evidence independently

- **WHEN** a backward transition accompanies actual artifact or implementation drift
- **THEN** reconciliation stales only evidence whose fingerprint changed

### Requirement: Transition to designing from any state

Scenarios:

#### Scenario: Explicit redesign applies focused policy

- **WHEN** a non-drafting change explicitly transitions to `designing`
- **THEN** artifact reopening follows the configured artifact policy and required consent is revoked
- **AND** unchanged verification is preserved unless its inputs changed

#### Scenario: Designing self-entry remains validity neutral

- **WHEN** `designing → designing` is requested
- **THEN** no approval revocation, artifact reopening, or `transitioned` event is invented

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

#### Scenario: Recovery does not run archiving.post

- **GIVEN** a change in `archiving` with `archiving.hooks.post` configured
- **WHEN** `execute` is called with `to: 'archivable'`
- **THEN** those post hooks are not executed
- **AND** `archivable` requires are not enforced

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

#### Scenario: source.post skipped on backward hop

- **GIVEN** a change in `done` with `done.hooks.post` configured
- **WHEN** `execute` is called with `to: 'implementing'`
- **THEN** those post hooks are not executed
- **AND** the transition still persists if predicates pass

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
- **THEN** its input accepts `name`, `to` (`ChangeState` or `'next'`), and optional `skipHookPhases`, `refreshImplementationTrackingBefore`, and `allowOutOfScope`
- **AND** its input does not accept `approvalsSpec` or `approvalsSignoff`

#### Scenario: allowOutOfScope omitted keeps strict impl.linksInScope

- **GIVEN** a forward exit from `implementing` where `impl.linksInScope` would fail
- **WHEN** `execute` is called without `allowOutOfScope` (or with `allowOutOfScope: false`)
- **THEN** `impl.linksInScope` is evaluated and not skipped
- **AND** the transition fails with `ArchiveImplementationStateError` when the predicate fails

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

#### Scenario: designing pre-hooks run on redesign

- **GIVEN** a change in `implementing`
- **AND** `designing.hooks.pre` is configured
- **WHEN** `execute` is called with `to: 'designing'`
- **THEN** designing pre-hooks execute
- **AND** implementing post-hooks do not

### Requirement: Transition event

#### Scenario: Successful transition emits transitioned progress event

- **WHEN** a state transition succeeds
- **THEN** a `transitioned` progress event is emitted with the source and target states

### Requirement: Automatic implementation tracking activation on transition to implementing

#### Scenario: Transition to implementing activates tracking if inactive

- **GIVEN** a change with `isImplementationTrackingActive = false`
- **WHEN** transitioning to `implementing`
- **THEN** `isImplementationTrackingActive` becomes `true`
- **AND** `implementationTrackingStartedAt` is set to the transition timestamp

### Requirement: Result type

#### Scenario: Successful execution returns the updated change

- **WHEN** `TransitionChange.execute` succeeds
- **THEN** the returned result contains the updated `change`

### Requirement: Progress callback

#### Scenario: Progress callback receives hook and requires events

- **WHEN** `TransitionChange.execute` is called with an `onProgress` callback
- **THEN** the callback receives lifecycle progress events such as `requires-check`, `check-start`, `check-done`, and `transitioned`
- **AND** it does not require first-class `hook-start` / `hook-done` event types

### Requirement: to next is the happy-path next state

#### Scenario: next from implementing is verifying

- **GIVEN** a change in `implementing`
- **WHEN** `execute` is called with `to: 'next'`
- **THEN** Core resolves the target to `verifying` before predicate evaluation

#### Scenario: next is rejected from archivable

- **GIVEN** a change in `archivable`
- **WHEN** `execute` is called with `to: 'next'`
- **THEN** it throws `HappyPathNextUnavailableError` (a typed `SpecdError`)
- **AND** it does not invent an archive execute

### Requirement: Shared runner errors propagate on transition

#### Scenario: Enter ready readOnly failure throws ReadOnlyWorkspaceError

- **GIVEN** a change in `designing` with a read-only spec in scope
- **WHEN** `execute` is called with `to: 'ready'`
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** the change remains in `designing`

#### Scenario: Enter ready deps failure throws ArchiveDependencyMismatchError

- **GIVEN** a change in `designing` whose publication-plan `dependsOn` disagrees with extracted metadata
- **WHEN** `execute` is called with `to: 'ready'`
- **THEN** `ArchiveDependencyMismatchError` is thrown

#### Scenario: Forward exit implementing impl failure throws ArchiveImplementationStateError

- **GIVEN** a change in `implementing` with an open tracked implementation file
- **WHEN** `execute` is called with `to: 'verifying'`
- **THEN** `ArchiveImplementationStateError` is thrown
- **AND** the change remains in `implementing`

### Requirement: Dependencies

#### Scenario: TransitionChange depends on transitionBindings

- **WHEN** `TransitionChange` is constructed
- **THEN** it receives `ChangeRepository`, `ActorResolver`, `SchemaProvider`, `RefreshImplementationTracking`, `approvals`, and `transitionBindings`
- **AND** it does not receive `LifecycleEngine`, `RunStepHooks`, or `CountTasks` as use-case ports
- **AND** it does not default `transitionBindings` to domain stub `TRANSITION_BINDINGS`

### Requirement: Config-based factory delegates through resolveTransitionChangeDeps

#### Scenario: createTransitionChange config form derives TransitionChangeDeps through resolveTransitionChangeDeps

- **WHEN** `createTransitionChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `TransitionChangeDeps` through `resolveTransitionChangeDeps(resolver)`
- **AND** `resolveTransitionChangeDeps(resolver)` resolves `transitionBindings` from `resolveWorkflowCheckRegistry`
- **AND** it does not resolve `runStepHooks` onto the use case
- **AND** it does not resolve `lifecycle` or `LifecycleEngine`
- **AND** the factory delegates to canonical `createTransitionChange(deps)`

### Requirement: Historic parked approval repair precedence

#### Scenario: Parked spec approval rejects a non-drain target

- **GIVEN** a change is in `pending-spec-approval`
- **WHEN** it requests `implementing`
- **THEN** the transition fails with `approval-required` for the `spec` gate
- **AND** it does not fail with `invalid-transition`

#### Scenario: Parked signoff rejects a non-drain target

- **GIVEN** a change is in `pending-signoff`
- **WHEN** it requests `archivable`
- **THEN** the transition fails with `approval-required` for the `signoff` gate
