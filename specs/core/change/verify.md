# Verification: Change

## Requirements

### Requirement: Identity

#### Scenario: Change name immutable after creation

- **WHEN** a Change is created with name `add-auth-flow`
- **THEN** the name cannot be changed by any subsequent operation

### Requirement: Workspaces and specs

#### Scenario: Single workspace change

- **WHEN** a Change is created with `workspaces: ['default']`
- **THEN** only the `default` workspace is active for `CompileContext`

#### Scenario: Multi-workspace change

- **WHEN** a Change is created with `workspaces: ['default', 'billing']`
- **THEN** both `default` and `billing` are active and both workspace-level context patterns are applied

#### Scenario: Empty workspace list rejected at creation

- **WHEN** a Change is created with an empty `workspaces` list
- **THEN** the creation fails with a validation error

#### Scenario: Undeclared workspace ID rejected at creation

- **WHEN** a Change is created with `workspaces: ['unknown']` and no workspace named `unknown` exists in `specd.yaml`
- **THEN** the creation fails with a validation error

#### Scenario: Workspace added after creation

- **WHEN** a Change has `workspaces: ['default']` and `billing` is added to the list
- **THEN** the workspace list becomes `['default', 'billing']`, an `invalidated` event with `cause: 'workspace-change'` is appended, a `transitioned` event rolling back to `designing` is appended, and any prior `spec-approved` or `signed-off` events are now superseded

#### Scenario: Spec added after creation

- **WHEN** a new spec path is added to the Change's `specIds`
- **THEN** an `invalidated` event with `cause: 'spec-change'` is appended and a `transitioned` event rolling back to `designing` is appended

### Requirement: Lifecycle

#### Scenario: Valid transition succeeds

- **WHEN** a Change in `drafting` state is transitioned to `designing`
- **THEN** a `transitioned` event with `from: 'drafting'` and `to: 'designing'` is appended and deriving state from history returns `designing`

#### Scenario: Invalid transition throws

- **WHEN** a Change in `drafting` state is transitioned to `archivable`
- **THEN** `InvalidStateTransitionError` is thrown, no event is appended, and the state remains `drafting`

#### Scenario: archivable is terminal

- **WHEN** a Change in `archivable` state is transitioned to any other state
- **THEN** `InvalidStateTransitionError` is thrown

#### Scenario: State derived from history — no snapshot

- **WHEN** a Change has a history containing two `transitioned` events ending with `to: 'implementing'`
- **THEN** deriving state from history returns `implementing` without reading any separate state field

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

#### Scenario: Status derived — complete

- **WHEN** the cleaned hash of an artifact's current file matches its `validatedHash`
- **THEN** `effectiveStatus` returns `complete`

#### Scenario: Status derived — missing

- **WHEN** an artifact's file does not exist
- **THEN** `effectiveStatus` returns `missing`

#### Scenario: Status derived — in-progress

- **WHEN** an artifact's cleaned file hash differs from `validatedHash`
- **THEN** `effectiveStatus` returns `in-progress`

#### Scenario: preHashCleanup applied before status comparison

- **WHEN** an artifact has `preHashCleanup` defined and a progress marker changes (e.g. a checkbox is checked)
- **THEN** `effectiveStatus` remains `complete` — the cleaned hash is unchanged

#### Scenario: Dependency cascade — incomplete dependency

- **WHEN** artifact B requires artifact A, and artifact A is `in-progress`
- **THEN** `effectiveStatus` for artifact B returns `in-progress` even if B's own cleaned hash matches its `validatedHash`

#### Scenario: markComplete only from ValidateSpec

- **WHEN** any code path other than `ValidateSpec` calls `Artifact.markComplete(hash)`
- **THEN** this is a violation of the domain contract — no other use case may set an artifact to `complete`

### Requirement: History and event sourcing

#### Scenario: History is append-only

- **WHEN** any operation is performed on a Change
- **THEN** new events are appended to history; no existing event is modified or removed

#### Scenario: State derived from last transitioned event

- **WHEN** history contains `transitioned` events with `to` values of `designing`, `ready`, `implementing`
- **THEN** deriving state returns `implementing` (the most recent `to` value)

#### Scenario: Draft status derived from history

- **WHEN** history contains a `drafted` event followed by no `restored` event
- **THEN** the change is considered currently shelved in `drafts/`

#### Scenario: Draft/restore cycle tracked

- **WHEN** a Change is drafted, then restored, then drafted again
- **THEN** history contains two `drafted` events and one `restored` event, and the change is currently shelved

#### Scenario: Active approval derived from history

- **WHEN** a `spec-approved` event exists in history and no subsequent `invalidated` event exists
- **THEN** that approval is the active spec approval and its `artifactHashes` represent the current approved signature

#### Scenario: Approval superseded by subsequent invalidated event

- **WHEN** a `spec-approved` event exists in history followed by an `invalidated` event
- **THEN** the prior `spec-approved` event is superseded — there is no active spec approval

#### Scenario: Multiple approval cycles in history

- **WHEN** a Change is spec-approved, then invalidated, then spec-approved again
- **THEN** history contains two `spec-approved` events; the first is superseded by the `invalidated` event; the second is the active approval

#### Scenario: Approval events never modified

- **WHEN** a Change already has `spec-approved` or `signed-off` events in history
- **THEN** no operation may overwrite or modify those events — only new events are appended

#### Scenario: Artifact change triggers invalidation

- **WHEN** an artifact's `validatedHash` is updated (i.e. its content changed after a prior approval)
- **THEN** an `invalidated` event with `cause: 'artifact-change'` is appended and a `transitioned` event back to `designing` is appended

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

#### Scenario: Draft appends drafted event

- **WHEN** a Change in `implementing` state is drafted with a valid identity
- **THEN** a `drafted` event is appended to history, the change is moved to `drafts/`, and it retains its `implementing` lifecycle state

#### Scenario: Drafted change no longer appears in active changes

- **WHEN** a Change has a `drafted` event as its most recent `drafted`/`restored` event
- **THEN** the change is resolved from `drafts/`, not `changes/`

#### Scenario: Restore appends restored event

- **WHEN** a drafted Change is restored
- **THEN** a `restored` event is appended to history, the change is moved back to `changes/`, and it resumes from its preserved lifecycle state

#### Scenario: Discard requires reason and identity

- **WHEN** a Change is discarded without providing a reason or `by` identity
- **THEN** the operation fails with a validation error and no event is appended

#### Scenario: Discard appends discarded event

- **WHEN** a Change is discarded with a reason, identity, and optional superseding change names
- **THEN** a `discarded` event is appended to history and the change is moved to `discarded/`

#### Scenario: Discard from drafts

- **WHEN** a drafted Change is discarded
- **THEN** a `discarded` event is appended, the change is moved to `discarded/`, and it cannot be recovered

#### Scenario: Discard with supersededBy

- **WHEN** a Change is discarded with `supersededBy: ['new-auth-flow', 'cleanup-tokens']`
- **THEN** the `discarded` event stores those names for traceability

#### Scenario: Discarded change cannot be restored

- **WHEN** a discard operation is attempted to be reversed
- **THEN** no operation exists to move a change out of `discarded/`
