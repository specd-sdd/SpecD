# Verification: Change

## Requirements

### Requirement: Identity

#### Scenario: Change name immutable after creation

- **WHEN** a Change is created with name `add-auth-flow`
- **THEN** the name cannot be changed by any subsequent operation

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
- **THEN** a `transitioned` event with `from: 'drafting'` and `to: 'designing'` is appended and deriving state returns `designing`

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

#### Scenario: Requires satisfied only by complete or skipped

- **GIVEN** artifact B requires artifact A
- **AND** artifact A is `pending-review`
- **WHEN** dependency satisfaction is evaluated
- **THEN** artifact A does not satisfy the requirement

#### Scenario: markComplete sets file and artifact state to complete

- **GIVEN** an artifact file in `in-progress`
- **WHEN** `markComplete(key, hash)` is called through validation
- **THEN** the file state becomes `complete`
- **AND** the parent artifact state is recomputed

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
- **THEN** its `cause` is `artifact-review-required`
- **AND** it is distinct from `artifact-drift`

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

### Requirement: Schema version

#### Scenario: Schema version mismatch warns

- **WHEN** a Change is loaded and the active schema's version differs from the `schemaVersion` recorded in the `created` event
- **THEN** specd emits a warning but the change remains fully usable

#### Scenario: Schema mismatch does not block archive

- **WHEN** a Change with a schema version mismatch is in `archivable` state
- **THEN** archiving proceeds normally — the mismatch warning is advisory only

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

### Requirement: History and event sourcing

#### Scenario: Description update appends description-updated event

- **GIVEN** a Change with description "Original"
- **WHEN** `updateDescription("New description", actor)` is called
- **THEN** a `description-updated` event is appended to history
- **AND** the event contains `description: "New description"`
- **AND** the event contains `by` with the actor identity

#### Scenario: Description update does not append invalidated event

- **GIVEN** a Change in `spec-approved` state with active approval
- **WHEN** `updateDescription("New description", actor)` is called
- **THEN** no `invalidated` event is appended
- **AND** the change remains in `spec-approved` state
