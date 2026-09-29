# Verification: Change

## Requirements

### Requirement: Identity

#### Scenario: Change name immutable after creation

- **WHEN** a Change is created with name `add-auth-flow`
- **THEN** the name cannot be changed by any subsequent operation

### Requirement: Change names reject Windows device names

#### Scenario: A device-name slug is rejected

- **GIVEN** the requested slug is `con`
- **WHEN** the change name is validated
- **THEN** the name is rejected

#### Scenario: A longer slug that contains the device name is legal

- **GIVEN** the requested slug is `con-foo`
- **AND** it matches the existing slug pattern
- **WHEN** the change name is validated
- **THEN** the name is accepted

### Requirement: Revision timestamp

#### Scenario: Initialized with createdAt default

- **GIVEN** a new `Change` entity created without explicit `updatedAt`
- **WHEN** `change.updatedAt` is accessed
- **THEN** it returns a `Date` equal to `change.createdAt`

#### Scenario: Rejects updatedAt before createdAt

- **WHEN** constructing a `Change` with `updatedAt` earlier than `createdAt`
- **THEN** it throws `InvalidChangeError`

#### Scenario: Touch advances updatedAt to default current time

- **GIVEN** an existing `Change` entity
- **WHEN** `change.touchUpdatedAt()` is called without arguments
- **THEN** `change.updatedAt` is updated to the current date/time

#### Scenario: Touch advances updatedAt to explicit timestamp

- **GIVEN** an existing `Change` entity
- **WHEN** `change.touchUpdatedAt(newDate)` is called with an explicit timestamp later than current `updatedAt`
- **THEN** `change.updatedAt` is updated to `newDate`

### Requirement: Workspaces and specs

#### Scenario: Workspaces derived from specIds

- **WHEN** a Change has `specIds: ['default:auth/login', 'billing:invoices']`
- **THEN** `workspaces` returns `['default', 'billing']` derived via `parseSpecId()`

#### Scenario: Workspaces empty when specIds empty

- **WHEN** a Change has an empty `specIds` list
- **THEN** `workspaces` returns an empty list

#### Scenario: Empty specIds allowed at creation

- **WHEN** a Change is created with an empty `specIds` list
- **THEN** creation succeeds and `workspaces` is empty

#### Scenario: Single workspace derived from specIds

- **WHEN** a Change has `specIds: ['default:auth/login']`
- **THEN** only the `default` workspace is active for `CompileContext`

#### Scenario: Multi-workspace derived from specIds

- **WHEN** a Change has `specIds: ['default:auth/login', 'billing:invoices']`
- **THEN** both workspace-level context patterns are applied

#### Scenario: Scope addition without required gates preserves the working phase

- **GIVEN** a change in `implementing` with workflow `preserve` and both approval gates disabled
- **WHEN** `EditChange` adds a spec and canonical reconciliation evaluates the new scope
- **THEN** the change remains in `implementing`
- **AND** any existing spec consent covering a different scope becomes stale with a `spec-added` difference
- **AND** missing or unvalidated required artifacts for the added spec still block forward progress
- **AND** the edit does not invent approval evidence when none exists

#### Scenario: Scope addition or removal requires renewed mandatory spec consent

- **GIVEN** a change in `implementing` with valid spec consent and the spec gate enabled
- **WHEN** canonical reconciliation detects an added or removed spec even with identical artifact bytes
- **THEN** consent becomes stale with the corresponding `spec-added` or `spec-removed` difference
- **AND** the change returns to `designing` exactly once, even with workflow `preserve`
- **AND** the original approval and approved scope remain in audit history

#### Scenario: Scope reordering and duplicates do not invalidate consent

- **GIVEN** a valid approval for a canonical spec set and unchanged artifacts
- **WHEN** an edit only reorders or repeats members of that same set
- **THEN** consent remains valid and no scope-driven recovery or approval-invalidated event occurs

#### Scenario: Orphaned specDependsOn removed when spec removed from specIds

- **GIVEN** scope contains `auth/login` and `auth/session` with dependencies for both
- **WHEN** scope replacement retains only `auth/login`
- **THEN** the `auth/session` dependency entry is removed and the `auth/login` entry is preserved

#### Scenario: workspaces is not usable as a singular primary workspace

- **GIVEN** a Change touches both `default` and `billing`
- **WHEN** a consumer builds template variables or archive paths
- **THEN** neither `workspaces[0]` nor another member is treated as a primary or home workspace

#### Scenario: Single-workspace change still has no primary-workspace semantics

- **GIVEN** a Change touches only `default`
- **WHEN** a consumer inspects `workspaces`
- **THEN** the single-member touched set does not establish a primary workspace identity

### Requirement: Lifecycle

#### Scenario: Valid transition — drafting to designing

- **WHEN** a Change in `drafting` state is transitioned to `designing`
- **THEN** `isValidTransition('drafting', 'designing')` is true
- **AND** a `transitioned` event with `from: 'drafting'` and `to: 'designing'` is appended

#### Scenario: Valid transition — verifying back to implementing for implementation-only failure

- **GIVEN** a Change in `verifying` state
- **AND** the current artifacts still describe the intended behavior
- **AND** the required fix fits within the already-defined tasks
- **WHEN** the change is transitioned back to `implementing`
- **THEN** a `transitioned` event with `from: 'verifying'` and `to: 'implementing'` is appended
- **AND** no approval invalidation is triggered

#### Scenario: Verification requiring new tasks returns to designing

- **GIVEN** a Change in `verifying` state
- **AND** the required fix would introduce tasks not already defined
- **WHEN** verification routes the change out of `verifying`
- **THEN** the change transitions to `designing`, not `implementing`

#### Scenario: archivable can return to designing

- **GIVEN** a Change in `archivable` state
- **WHEN** it is transitioned to `designing`
- **THEN** the transition succeeds

#### Scenario: done can hop to implementing

- **GIVEN** a Change in `done`
- **WHEN** it is transitioned to `implementing`
- **THEN** `isValidTransition` is true
- **AND** a `transitioned` event with `from: 'done'` and `to: 'implementing'` is appended

#### Scenario: archivable cannot hop to done

- **GIVEN** a Change in `archivable`
- **WHEN** a transition to `done` is attempted
- **THEN** the entity rejects the pair as invalid

### Requirement: Neutral designing self-entry

#### Scenario: Designing self-entry preserves history and validated evidence

- **GIVEN** an application request for `designing` while a Change is already in `designing` with validated artifacts and a current spec approval
- **WHEN** `TransitionChange` handles the request
- **THEN** the state, artifact/file states, and approval projection remain unchanged
- **AND** no `transitioned`, `invalidated`, or `approval-invalidated` event is appended

#### Scenario: Direct entity self-transition remains invalid

- **GIVEN** a Change already in `designing`
- **WHEN** a caller invokes the entity's real `transition('designing')`
- **THEN** it rejects the self-transition without changing history
- **AND** the neutral application behavior does not make `verifying → verifying` legal

### Requirement: Skill-aligned backward hops

#### Scenario: Hop from done invalidates signoff only

- **GIVEN** a Change in `done` with validated artifacts and an active signoff
- **WHEN** it transitions to `verifying`
- **THEN** signoff is invalidated
- **AND** unchanged artifacts remain `complete`
- **AND** spec approval is not invalidated

### Requirement: Archiving escape transitions

Scenarios:

#### Scenario: Canonical signoff recovery may return archiving to done

- **GIVEN** a change in `archiving` whose required sign-off becomes stale or revoked
- **WHEN** the central reconciler applies mandatory gate recovery
- **THEN** `archiving → done` succeeds exactly once
- **AND** the recovery event identifies sign-off invalidity as its cause

#### Scenario: Manual archiving to done remains forbidden

- **WHEN** a caller requests `archiving → done` outside central gate recovery
- **THEN** `InvalidStateTransitionError` is thrown
- **AND** manual `archiving → implementing` and `archiving → verifying` remain forbidden

#### Scenario: Existing archive escapes remain valid

- **WHEN** archive restoration or manual redesign requires `archiving → archivable` or `archiving → designing`
- **THEN** the existing escape remains permitted

### Requirement: Implementation and verification loop

Scenarios:

#### Scenario: Transition checks evidence but does not create it

- **GIVEN** the change is `verifying` with only an unfinished attempt
- **WHEN** `verifying → done` is requested
- **THEN** the transition fails because completed current evidence is absent
- **AND** the attempt can be restarted and completed without a self-transition

#### Scenario: Completed current evidence permits exit

- **GIVEN** completed verification matches fresh resolved inputs
- **WHEN** `verifying → done` is requested
- **THEN** the verification predicate permits the transition without creating new evidence

### Requirement: Spec approval gate

Scenarios:

#### Scenario: Current consent is required only when enabled

- **GIVEN** the spec gate is enabled and approval fingerprint is stale
- **WHEN** forward progress from `ready` is evaluated
- **THEN** progress is blocked and recovery returns through design and renewed ready approval
- **AND** disabling the gate skips consent without waiving artifact freshness

#### Scenario: Ready approval remains in place

- **WHEN** current spec consent is granted in `ready`
- **THEN** the approval projection becomes valid without entering a pending state

### Requirement: Signoff gate

Scenarios:

#### Scenario: Signoff cannot rely on stale verification

- **GIVEN** signoff is enabled and verification evidence is stale
- **WHEN** `done → archivable` is evaluated
- **THEN** the transition is blocked until verification is renewed and signoff is valid for current inputs

#### Scenario: Disabled signoff still preserves other archive checks

- **WHEN** signoff gate is disabled
- **THEN** approval check skips while verification, freshness, tasks, and archive checks still apply

### Requirement: Materialized approval and verification projections

#### Scenario: Projection status is independent of history retention

- **GIVEN** valid approval and verification evidence
- **WHEN** fresh inputs make both stale
- **THEN** current projections become `stale` with causes
- **AND** their original actors, fingerprints, times, and audit events remain available

#### Scenario: Lifecycle movement preserves unchanged verification

- **GIVEN** completed verification still matches current inputs
- **WHEN** the change moves to an earlier lifecycle state
- **THEN** the completed evidence remains valid

#### Scenario: Scope-aware consent detects additions and removals

- **GIVEN** approved artifacts remain byte-identical
- **WHEN** the canonical spec scope adds or removes one spec
- **THEN** spec consent becomes stale with the matching scope difference
- **AND** reordering the same canonical set remains valid

### Requirement: State-independent verification operations and audit

#### Scenario: Starting again supersedes only the active attempt

- **GIVEN** an active verification attempt exists in any active lifecycle state
- **WHEN** `StartVerification` passes input checks again
- **THEN** a new attempt becomes active and the earlier attempt remains in history
- **AND** no successful evidence or lifecycle transition is recorded

#### Scenario: Completion rejects changed inputs

- **GIVEN** an active attempt whose fingerprint no longer matches fresh inputs
- **WHEN** `CompleteVerification` executes
- **THEN** it fails without replacing the baseline or recording completion
- **AND** another explicit start may begin a new attempt in the same state

#### Scenario: Start dependencies include schema check context

- **WHEN** `StartVerification` is constructed through either supported factory
- **THEN** its deps include the schema provider and reconciler used for operation-specific readiness checks
- **AND** no fake transition context is required

### Requirement: Artifacts

#### Scenario: File state is persisted explicitly

- **GIVEN** an artifact file persisted with `state: 'pending-review'`
- **WHEN** the Change is loaded
- **THEN** its state remains `pending-review`, not recomputed from `validatedHash` alone

#### Scenario: Artifact aggregates to drifted-pending-review when any file drifted

- **GIVEN** an artifact has one complete file and another in `drifted-pending-review`
- **WHEN** its aggregate state is computed
- **THEN** the artifact state is `drifted-pending-review`

#### Scenario: Surgical drift recovery does not reopen unrelated files

- **GIVEN** validated non-task files A and B and a validated artifact marked `hasTasks: true`
- **AND** only A has drifted, artifact policy is `surgical`, workflow is `redesign`, and no gate recovery is required
- **WHEN** the central reconciler applies the focused drift and returns the change to `designing`
- **THEN** A remains drifted and requires review
- **AND** B and the task artifact retain their complete state
- **AND** the lifecycle return causes no second mass downgrade

#### Scenario: Downstream propagation excludes task artifacts

- **GIVEN** artifact policy is `downstream` and a drifted non-task artifact has both task and non-task descendants
- **WHEN** canonical reconciliation expands review through the schema DAG
- **THEN** the affected non-task descendants reopen for review
- **AND** task artifacts and unrelated complete files are not reopened by that propagation

#### Scenario: Global artifact review still excludes automatic task reopening

- **GIVEN** artifact policy is `global` and a non-task artifact drifts
- **WHEN** canonical reconciliation applies automatic artifact review
- **THEN** every non-task artifact file is selected for reopening
- **AND** artifacts marked `hasTasks: true` remain excluded

#### Scenario: No-reopening policy does not waive freshness

- **GIVEN** artifact policy is `none` and a non-task file has drifted
- **WHEN** canonical reconciliation evaluates the change
- **THEN** no additional file reopens merely because of the invalidation
- **AND** unresolved drift still blocks forward progress

#### Scenario: markComplete sets file and artifact state to complete

- **GIVEN** an artifact file in `in-progress`
- **WHEN** `markComplete(key, hash)` is called through validation
- **THEN** the file becomes complete and the parent aggregate state is recomputed

### Requirement: Policy-aware invalidation

Scenarios:

#### Scenario: Preservation does not waive drift

- **GIVEN** workflow policy is `preserve` and artifact policy is `none`
- **WHEN** non-task artifact drift is reconciled without a mandatory gate recovery
- **THEN** lifecycle state is preserved
- **AND** forward progress remains blocked by the focused drift

#### Scenario: Gate recovery overrides workflow preservation

- **GIVEN** required spec consent becomes stale
- **WHEN** invalidation is applied with workflow `preserve`
- **THEN** the change returns to `designing` exactly once and history is retained

### Requirement: Per-file drift tracking

#### Scenario: Artifact-drift sets hasDrift on only the affected files

- **GIVEN** two validated files in one artifact and only one mismatches the validated baseline
- **WHEN** `Change.invalidate()` is called with cause `artifact-drift` and a focused payload naming only that file
- **THEN** only that file gets `hasDrift: true`

#### Scenario: Missing file remains missing even when drifted

- **GIVEN** a previously validated file is now absent on disk
- **WHEN** drift is materialized on the change
- **THEN** the canonical file state remains `missing`
- **AND** `hasDrift` may still be `true`

### Requirement: History and event sourcing

#### Scenario: History is append-only

- **WHEN** any operation is performed on a Change
- **THEN** new events are appended; existing events are never modified or removed

#### Scenario: Invalidated event records artifact drift details

- **GIVEN** two validated spec files drift in one reconciliation pass
- **WHEN** artifact drift is materialized
- **THEN** the `invalidated` event uses `artifact-drift` with a human-readable message
- **AND** `affectedArtifacts` records both file keys and their artifact types

#### Scenario: Scope consent invalidation records precise projection differences

- **GIVEN** valid spec consent and unchanged artifact bytes
- **WHEN** `EditChange` adds or removes a canonical spec ID
- **THEN** reconciliation appends `approval-invalidated` with cause `scope-change` and the precise scope difference
- **AND** the prior approval event and its original fingerprint remain available
- **AND** a broad `invalidated` event with cause `spec-change` is not required solely to represent stale consent

#### Scenario: Legacy scope helper records artifact review without lifecycle recovery

- **GIVEN** a Change in `implementing`
- **WHEN** the legacy entity helper `updateSpecIds` is called with a changed spec set and artifact DAG
- **THEN** its artifact-review event has cause `spec-change`
- **AND** that helper does not independently roll the lifecycle back or clear approval projections

#### Scenario: Review-required invalidation remains distinguishable from drift

- **GIVEN** explicit artifact review is requested without physical drift
- **WHEN** reconciliation records the review invalidation
- **THEN** its cause is `artifact-review-required`, not `artifact-drift`

#### Scenario: Description update appends description-updated event

- **GIVEN** a Change with description "Original"
- **WHEN** `updateDescription("New description", actor)` is called
- **THEN** a `description-updated` event contains the new description and full resolved actor identity

#### Scenario: Description update does not append invalidated event

- **GIVEN** a Change in `spec-approved` with active approval
- **WHEN** its description changes
- **THEN** no invalidated event is appended and the lifecycle remains `spec-approved`

### Requirement: Historical implementation detection

#### Scenario: Historical detection becomes true after implementing

- **GIVEN** a Change whose history already contains a `transitioned` event with `to: 'implementing'`
- **WHEN** historical implementation detection is evaluated
- **THEN** it reports that implementation may already exist

#### Scenario: Historical detection remains true after returning to designing

- **GIVEN** a Change whose history contains a `transitioned` event to `implementing`
- **AND** a later `transitioned` event returns it to `designing`
- **WHEN** historical implementation detection is evaluated
- **THEN** it still reports that implementation may already exist

#### Scenario: Historical detection stays false before implementing

- **GIVEN** a Change whose history has no `transitioned` event with `to: 'implementing'`
- **WHEN** historical implementation detection is evaluated
- **THEN** it reports that implementation may not yet exist

### Requirement: Implementation tracking state

#### Scenario: Change persists tracked files separately from confirmed links

- **GIVEN** a change has one tracked implementation file in `open` state
- **AND** one confirmed implementation link for a spec and file
- **WHEN** the change is persisted and reloaded
- **THEN** the tracked file state is restored separately from the confirmed link set

#### Scenario: Change persists removed tracked files explicitly

- **GIVEN** a change tracks `packages/core/src/deleted.ts` with state `removed`
- **WHEN** the change is persisted and reloaded
- **THEN** that tracked file still exists in `trackedImplementationFiles`
- **AND** its state remains `removed`

#### Scenario: Removed file does not return to resolved directly

- **GIVEN** a tracked implementation file is in `removed` state
- **WHEN** review state changes are requested without a refresh proving the file exists again
- **THEN** the file does not move directly to `resolved`

#### Scenario: Refresh-driven resurrection returns removed file to open

- **GIVEN** a tracked implementation file is in `removed` state
- **AND** refresh later confirms the file exists again
- **WHEN** implementation tracking is updated from that refresh result
- **THEN** the file state returns to `open`

#### Scenario: Symbol-level refinement does not create a duplicate file-level peer

- **GIVEN** a confirmed `spec + file` implementation link already exists
- **WHEN** a symbol is added to refine that link
- **THEN** the same `spec + file` set is enriched
- **AND** no duplicate peer link is created

### Requirement: Explicit vs container-only file links

#### Scenario: Removing the last symbol preserves explicit file link

- **GIVEN** a `spec + file` link whose file-level presence was explicitly created
- **AND** it has one remaining symbol refinement
- **WHEN** that symbol is removed
- **THEN** the file-level link remains

#### Scenario: Removing the last symbol may delete container-only file presence

- **GIVEN** a `spec + file` link exists only as the container for symbol-level links
- **AND** it has one remaining symbol refinement
- **WHEN** that symbol is removed
- **THEN** the whole `spec + file` set may disappear

### Requirement: Historical implementation detection guard

#### Scenario: Historical detection becomes true after implementing

- **GIVEN** a change whose history already contains a `transitioned` event with `to: 'implementing'`
- **WHEN** historical implementation detection is evaluated
- **THEN** it reports that implementation refresh may run

#### Scenario: Historical detection stays false before implementing

- **GIVEN** a change whose history has never transitioned to `implementing`
- **WHEN** historical implementation detection is evaluated
- **THEN** it reports that implementation refresh should not run

### Requirement: Explicit implementation tracking activation

#### Scenario: Explicit start records timestamp and activates tracking

- **GIVEN** a new `Change` entity with `isImplementationTrackingActive = false`
- **WHEN** calling `change.startImplementationTracking(timestamp)`
- **THEN** `isImplementationTrackingActive` becomes `true`
- **AND** `implementationTrackingStartedAt` matches the provided timestamp
- **AND** a subsequent call to `startImplementationTracking` does not overwrite the initial timestamp

### Requirement: Archive outcome history

#### Scenario: Failed archive attempt appends archive-failed event

- **GIVEN** a change has entered archive commit execution
- **AND** archive fails before completion
- **WHEN** the change history is inspected
- **THEN** it includes an `archive-failed` event with phase diagnostics for that attempt

#### Scenario: Successful batch restore rolls lifecycle back to archivable

- **GIVEN** a change in `archiving` state
- **AND** a commit-phase archive failure occurs
- **AND** batch canonical restore completes successfully
- **WHEN** the change is reloaded
- **THEN** the change is in `archivable` state

#### Scenario: Failed batch restore leaves change in archiving

- **GIVEN** a change in `archiving` state
- **AND** a commit-phase archive failure occurs
- **AND** batch canonical restore fails for at least one spec
- **WHEN** the change is reloaded
- **THEN** the change remains in `archiving` state

#### Scenario: Successful archive does not append a new active-change success event

- **GIVEN** a change archives successfully
- **WHEN** active-change history is considered
- **THEN** no new success event is appended there
- **AND** archive completion is represented by the archived record instead

### Requirement: Schema version

#### Scenario: Schema version mismatch warns

- **WHEN** a Change is loaded and the active schema's version differs from the `schemaVersion` recorded in the `created` event
- **THEN** specd emits a warning but the change remains fully usable

#### Scenario: Schema mismatch does not block archive

- **WHEN** a Change with a schema version mismatch is in `archivable` state
- **THEN** archiving proceeds normally — the mismatch warning is advisory only

#### Scenario: Schema name mismatch throws SchemaMismatchError

- **GIVEN** a change was created with schema name `schema-std`
- **AND** the active system schema is `custom-schema`
- **WHEN** the change is loaded or a use case is executed
- **THEN** `SchemaMismatchError` is thrown

#### Scenario: Schema version mismatch emits warning

- **GIVEN** a change was created with schema version 1
- **AND** the active system schema version is 2
- **WHEN** the change is loaded
- **THEN** a warning is emitted mentioning both versions
- **AND** the change remains usable

### Requirement: Drafting and discarding

#### Scenario: Draft requires identity

- **WHEN** a Change is drafted without providing a `by` identity
- **THEN** the operation fails with a validation error and no event is appended

#### Scenario: Draft succeeds before implementation has ever been reached

- **GIVEN** a Change whose history contains no `transitioned` event to `implementing`
- **WHEN** it is drafted with a valid identity
- **THEN** a `drafted` event is appended to history
- **AND** the change is moved to `drafts/`
- **AND** it retains its current lifecycle state

#### Scenario: Draft after historical implementation requires force

- **GIVEN** a Change whose history contains a `transitioned` event to `implementing`
- **WHEN** it is drafted without forcing the operation
- **THEN** the operation fails
- **AND** no `drafted` event is appended
- **AND** the failure explains that implementation may already exist and specs and code could be left out of sync

#### Scenario: Forced draft after historical implementation appends drafted event

- **GIVEN** a Change whose history contains a `transitioned` event to `implementing`
- **WHEN** it is drafted with a valid identity and the force override enabled
- **THEN** a `drafted` event is appended to history
- **AND** the change is moved to `drafts/`
- **AND** it retains its current lifecycle state

#### Scenario: Drafted change no longer appears in active changes

- **WHEN** a Change has a `drafted` event as its most recent `drafted`/`restored` event
- **THEN** the change is resolved from `drafts/`, not `changes/`

#### Scenario: Restore appends restored event

- **WHEN** a drafted Change is restored
- **THEN** a `restored` event is appended to history
- **AND** the change is moved back to `changes/`
- **AND** it resumes from its preserved lifecycle state

#### Scenario: Discard requires reason and identity

- **WHEN** a Change is discarded without providing a reason or `by` identity
- **THEN** the operation fails with a validation error and no event is appended

#### Scenario: Discard succeeds before implementation has ever been reached

- **GIVEN** a Change whose history contains no `transitioned` event to `implementing`
- **WHEN** the Change is discarded with a reason, identity, and optional superseding change names
- **THEN** a `discarded` event is appended to history
- **AND** the change is moved to `discarded/`

#### Scenario: Discard after historical implementation requires force

- **GIVEN** a Change whose history contains a `transitioned` event to `implementing`
- **WHEN** it is discarded without forcing the operation
- **THEN** the operation fails
- **AND** no `discarded` event is appended
- **AND** the failure explains that implementation may already exist and specs and code could be left out of sync

#### Scenario: Forced discard from drafts after historical implementation succeeds

- **GIVEN** a drafted Change whose history contains a `transitioned` event to `implementing`
- **WHEN** it is discarded with a reason, identity, and the force override enabled
- **THEN** a `discarded` event is appended
- **AND** the change is moved to `discarded/`
- **AND** it cannot be recovered

#### Scenario: Discard with supersededBy

- **WHEN** a Change is discarded with `supersededBy: ['new-auth-flow', 'cleanup-tokens']`
- **THEN** the `discarded` event stores those names for traceability

#### Scenario: Discarded change cannot be restored

- **WHEN** a discard operation is attempted to be reversed
- **THEN** no operation exists to move a change out of `discarded/`

### Requirement: Drafted read-only semantics

#### Scenario: Transition on drafted change via active API fails

- **GIVEN** a change exists only under `drafts/` with `isDrafted === true`
- **WHEN** `TransitionChange.execute` is called with its name
- **THEN** the use case fails with `ChangeNotFoundError` or does not mutate the drafted manifest

#### Scenario: Restore clears drafted status

- **GIVEN** a drafted change
- **WHEN** `RestoreChange.execute` completes
- **THEN** the change is active (`isDrafted === false`) and may be loaded via `ChangeRepository.get`

#### Scenario: Save outside mutateDraft throws read-only error

- **GIVEN** a persisted change with `isDrafted === true` loaded only for internal repository use
- **WHEN** `ChangeRepository.save(change)` is called outside `mutateDraft`
- **THEN** `DraftedChangeReadOnlyError` is thrown

#### Scenario: Inspection uses getDraft not get

- **GIVEN** a change exists only under `drafts/`
- **WHEN** application code loads it for read-only display
- **THEN** `GetDraft.execute({ name })` returns `DraftedChangeView`
- **AND** `ChangeRepository.get(name)` returns `null`

### Requirement: Artifact sync

#### Scenario: syncArtifacts appends artifacts-synced when schema artifact set changes

- **GIVEN** the schema artifact set changes for an existing Change
- **WHEN** artifact sync reconciles the artifact map
- **THEN** an `artifacts-synced` event is appended describing the added and removed files and artifact types

### Requirement: Lifecycle interpretation authority

#### Scenario: Dependency-aware lifecycle interpretation is external to Change

- **GIVEN** an artifact appears persisted as `complete`
- **AND** an upstream dependency requires review under the active schema DAG
- **WHEN** lifecycle interpretation is requested
- **THEN** the `Change` entity remains the source of persisted facts only
- **AND** `evaluateLifecycleVerdict` / `projectArtifacts` is responsible for deriving the dependency-aware lifecycle meaning

### Requirement: Task completion scope

#### Scenario: Non-task artifact does not create a task gate

- **GIVEN** an artifact does not declare a task-completion check
- **WHEN** lifecycle progress is evaluated
- **THEN** it is not blocked by inferred task completion

### Requirement: Validity fingerprint scope

#### Scenario: Conservative normalization ignores only declared whitespace differences

- **GIVEN** two linked text files differ only by BOM, line endings, trailing horizontal whitespace, blank-line whitespace, or final newline
- **WHEN** `text-v1` fingerprints them
- **THEN** they compare equal
- **AND** internal whitespace or any binary-byte difference remains significant

#### Scenario: Task artifacts do not invalidate evidence

- **GIVEN** an artifact type declares `hasTasks: true`
- **WHEN** only its task content changes
- **THEN** approval and verification fingerprints remain unchanged
- **AND** live task completion can still block transition or archive
