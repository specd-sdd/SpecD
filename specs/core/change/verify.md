# Verification: Change

## Requirements

### Requirement: Identity

#### Scenario: Change name immutable after creation

- **WHEN** a Change is created with name `add-auth-flow`
- **THEN** the name cannot be changed by any subsequent operation

#### Scenario: updatedAt invariant on load

- **WHEN** a Change is loaded from manifest
- **THEN** `updatedAt` is present
- **AND** `updatedAt >= createdAt`

#### Scenario: Factory rejects updatedAt before createdAt

- **WHEN** manifest load supplies `updatedAt` earlier than `createdAt`
- **THEN** Change construction fails
- **AND** error explains invalid revision clock

#### Scenario: Identity fields remain immutable except revision

- **GIVEN** an existing Change entity
- **WHEN** caller attempts to mutate `name` or `createdAt`
- **THEN** mutation is rejected or ignored per entity rules
- **AND** `updatedAt` updates only via repository save paths

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
- **THEN** both `default` and `billing` are active and both workspace-level context patterns are applied

#### Scenario: Spec added after creation

- **WHEN** a new spec ID is added to the Change's `specIds`
- **THEN** an `invalidated` event with `cause: 'spec-change'` is appended and a `transitioned` event rolling back to `designing` is appended

#### Scenario: Orphaned specDependsOn removed when spec removed from specIds

- **GIVEN** a Change with `specIds: ['auth/login', 'auth/session']`
- **AND** `specDependsOn` has entries for both `'auth/login'` and `'auth/session'`
- **WHEN** `updateSpecIds(['auth/login'], actor)` is called
- **THEN** `specDependsOn` no longer has an entry for `'auth/session'`
- **AND** `specDependsOn` still has the entry for `'auth/login'`

### Requirement: Lifecycle

#### Scenario: Valid transition — drafting to designing

- **WHEN** a Change in `drafting` state is transitioned to `designing`
- **THEN** the `LifecycleEngine` confirms the transition is valid
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

#### Scenario: Designing to designing does not downgrade artifacts or approvals

- **GIVEN** a Change already in `designing` state with validated artifacts and an active spec approval
- **WHEN** the change is transitioned to `designing` again
- **THEN** no `invalidated` event is appended
- **AND** no artifact files are downgraded to `pending-review`
- **AND** the active spec approval remains valid
- **AND** a `transitioned` event with `from: 'designing'` and `to: 'designing'` is appended

### Requirement: Archiving escape transitions

#### Scenario: Archiving allows transition to archivable

- **GIVEN** a change in `archiving` state
- **WHEN** `TransitionChange` is invoked with target `archivable`
- **THEN** the transition succeeds

#### Scenario: Archiving allows transition to designing

- **GIVEN** a change in `archiving` state
- **WHEN** `TransitionChange` is invoked with target `designing`
- **THEN** the transition succeeds and artifact files are downgraded for review

#### Scenario: Archiving rejects transition to implementing

- **GIVEN** a change in `archiving` state
- **WHEN** `TransitionChange` is invoked with target `implementing`
- **THEN** `InvalidStateTransitionError` is thrown

### Requirement: Implementation and verification loop

#### Scenario: implementation-failure returns to implementing without downgrading unchanged artifacts

- **GIVEN** a Change in `verifying` state with validated artifacts
- **AND** verification concludes that only the implementation is wrong
- **WHEN** the change returns to `implementing`
- **THEN** unchanged validated artifacts remain `complete`
- **AND** no file is moved to `pending-review`

#### Scenario: artifact-review-required returns to designing

- **GIVEN** a Change in `verifying` state
- **AND** verification concludes that the desired behavior has changed
- **WHEN** the verification outcome is `artifact-review-required`
- **THEN** the change returns to `designing`

#### Scenario: drift during verification is not treated as implementation-only failure

- **GIVEN** a Change in `verifying` state
- **AND** a previously validated artifact file changes on disk
- **WHEN** drift is detected
- **THEN** the change is invalidated to `designing`
- **AND** the drifted file is marked `drifted-pending-review`

### Requirement: Spec approval gate

#### Scenario: Gate disabled — free transition to implementing

- **WHEN** `approvals.spec: false` (default) and a Change is in `ready` state
- **THEN** it transitions directly to `implementing` with no approval required

#### Scenario: Gate enabled — blocked until spec approved

- **WHEN** `approvals.spec: true` and a Change is in `ready` state
- **THEN** it transitions to `pending-spec-approval`, not `implementing`

#### Scenario: Gate enabled — implementing reachable after approval

- **WHEN** `approvals.spec: true` and a Change in `pending-spec-approval` receives approval
- **THEN** a `spec-approved` event is appended, then a `transitioned` event to `spec-approved` state, then to `implementing`

### Requirement: Signoff gate

#### Scenario: Gate disabled — free transition to archivable

- **WHEN** `approvals.signoff: false` (default) and a Change is in `done` state
- **THEN** it transitions directly to `archivable` regardless of change content

#### Scenario: Gate enabled — always blocked at done

- **WHEN** `approvals.signoff: true` and a Change is in `done` state
- **THEN** it transitions to `pending-signoff`, not `archivable` — regardless of whether changes are additions, modifications, or removals

#### Scenario: Gate enabled — archivable after signoff

- **WHEN** `approvals.signoff: true` and a Change in `pending-signoff` receives sign-off
- **THEN** a `signed-off` event is appended, then a `transitioned` event to `signed-off` state, then to `archivable`

#### Scenario: Archive from non-archivable state throws

- **WHEN** archiving is attempted on a Change not in `archivable` state
- **THEN** `InvalidStateTransitionError` is thrown

### Requirement: Artifacts

#### Scenario: File state is persisted explicitly

- **GIVEN** an artifact file stored in the manifest with `state: 'pending-review'`
- **WHEN** the Change is loaded
- **THEN** the file state is `pending-review`
- **AND** it is not recomputed from `validatedHash` alone

#### Scenario: Artifact aggregates to drifted-pending-review when any file drifted

- **GIVEN** an artifact with two files
- **AND** one file is `complete`
- **AND** one file is `drifted-pending-review`
- **WHEN** the artifact aggregate state is computed
- **THEN** the artifact state is `drifted-pending-review`

#### Scenario: Returning to designing downgrades files to pending-review

- **GIVEN** a change with validated artifacts
- **AND** one file is already `drifted-pending-review`
- **WHEN** the change returns to `designing`
- **THEN** every other file becomes `pending-review`
- **AND** the drifted file remains `drifted-pending-review`

#### Scenario: markComplete sets file and artifact state to complete

- **GIVEN** an artifact file in `in-progress`
- **WHEN** `markComplete(key, hash)` is called through validation
- **THEN** the file state becomes `complete`
- **AND** the parent artifact state is recomputed

### Requirement: Policy-aware invalidation

#### Scenario: Policy none keeps unaffected artifact states unchanged

- **GIVEN** a change with complete artifact files and effective invalidation policy `none`
- **WHEN** `Change.invalidate()` is called with cause `artifact-drift`
- **THEN** only change-level invalidation and history are applied
- **AND** no file is moved into a reopened review state solely because of that invalidation

#### Scenario: Downstream invalidation reopens the target set and descendants

- **GIVEN** a change with a DAG where `specs` has downstream descendants
- **WHEN** `Change.invalidate()` is called with effective policy `downstream` and a focused target set under `specs`
- **THEN** the focused target files are reopened
- **AND** all DAG descendants of that target set are reopened

#### Scenario: Downstream policy uses artifactDag descendants

- **GIVEN** schema-std `artifactDag` where invalidating `specs` expands to `verify` and `tasks`
- **WHEN** `Change.invalidate()` is called with effective policy `downstream`, focused targets under `specs`, and that `artifactDag`
- **THEN** files under `verify` and `tasks` are reopened according to policy
- **AND** expansion does not depend on persisted artifact `requires` maps on the change

#### Scenario: Repeated artifact-drift invalidation in designing is deduped

- **GIVEN** a change already in `designing`
- **AND** its most recent history event is `invalidated` with `cause: 'artifact-drift'` and affected set `{ specs: [core:change] }`
- **WHEN** `Change.invalidate()` is called again with `cause: 'artifact-drift'` and the same policy-expanded affected set while drift persists
- **THEN** no new `invalidated` event is appended
- **AND** no new `transitioned` event is appended
- **AND** history length is unchanged

#### Scenario: Deduped artifact-drift still materializes drift flags

- **GIVEN** a deduped artifact-drift invalidation as above
- **WHEN** the focused payload names a drifted file key
- **THEN** that file's `hasDrift` signal is materialized
- **AND** history length remains unchanged

#### Scenario: Manual invalidation is never deduped

- **GIVEN** a change already in `designing` with a prior `invalidated` event for `artifact-drift`
- **WHEN** `Change.invalidate()` is called with `cause: 'artifact-review-required'`
- **THEN** a new `invalidated` event is appended
- **AND** history length increases

#### Scenario: Artifact-drift with expanded affected set is not deduped

- **GIVEN** a change in `designing` with a prior `artifact-drift` invalidation affecting `{ specs: [core:change] }`
- **WHEN** `Change.invalidate()` is called with `artifact-drift` and policy expansion yields an additional drifted file key
- **THEN** a new `invalidated` event is appended
- **AND** the new event records the updated affected set

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
- **THEN** new events are appended to history; no existing event is modified or removed

#### Scenario: Invalidated event records artifact drift details

- **GIVEN** two validated spec files drift in the same invalidation pass
- **WHEN** the change is invalidated for artifact drift
- **THEN** the `invalidated` event contains `cause: 'artifact-drift'`
- **AND** it includes a human-readable `message`
- **AND** `affectedArtifacts` records the artifact type and both file keys

#### Scenario: Scope change invalidation records spec-change cause

- **WHEN** `specIds` are edited after prior validation
- **THEN** the appended `invalidated` event uses `cause: 'spec-change'`

#### Scenario: Review-required invalidation remains distinguishable from drift

- **GIVEN** a change returns to `designing` because verification requires artifact review
- **WHEN** the invalidation event is appended
- `THEN` its `cause` is `artifact-review-required`
- `AND` it is distinct from `artifact-drift`

#### Scenario: Description update appends description-updated event

- **GIVEN** a Change with description "Original"
- **WHEN** `updateDescription("New description", actor)` is called
- **THEN** a `description-updated` event is appended to history
- **AND** the event contains `description: "New description"`
- **AND** the event contains `by` with the full `ActorIdentity`

#### Scenario: Description update does not append invalidated event

- **GIVEN** a Change in `spec-approved` state with active approval
- **WHEN** `updateDescription("New description", actor)` is called
- **THEN** no `invalidated` event is appended
- **AND** the change remains in `spec-approved` state

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
- **AND** `LifecycleEngine` is responsible for deriving the dependency-aware lifecycle meaning
