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
- **THEN** the workspace list becomes `['default', 'billing']`, all existing approval records are invalidated, and the change rolls back to `designing`

#### Scenario: Spec added after creation

- **WHEN** a new spec path is added to the Change's `specIds`
- **THEN** all existing approval records are invalidated and the change rolls back to `designing`

### Requirement: Lifecycle

#### Scenario: Valid transition succeeds

- **WHEN** a Change in `drafting` state is transitioned to `designing`
- **THEN** the state updates to `designing` with no error

#### Scenario: Invalid transition throws

- **WHEN** a Change in `drafting` state is transitioned to `archivable`
- **THEN** `InvalidStateTransitionError` is thrown and the state remains `drafting`

#### Scenario: archivable is terminal

- **WHEN** a Change in `archivable` state is transitioned to any other state
- **THEN** `InvalidStateTransitionError` is thrown

### Requirement: Spec approval gate

#### Scenario: Gate disabled — free transition to implementing

- **WHEN** `approvals.spec: false` (default) and a Change is in `ready` state
- **THEN** it transitions directly to `implementing` with no approval required

#### Scenario: Gate enabled — blocked until spec approved

- **WHEN** `approvals.spec: true` and a Change is in `ready` state
- **THEN** it transitions to `pending-spec-approval`, not `implementing`

#### Scenario: Gate enabled — implementing reachable after approval

- **WHEN** `approvals.spec: true` and a Change in `pending-spec-approval` receives approval
- **THEN** it transitions to `spec-approved` and then to `implementing`

### Requirement: Signoff gate

#### Scenario: Gate disabled — free transition to archivable

- **WHEN** `approvals.signoff: false` (default) and a Change is in `done` state
- **THEN** it transitions directly to `archivable` regardless of change content

#### Scenario: Gate enabled — always blocked at done

- **WHEN** `approvals.signoff: true` and a Change is in `done` state
- **THEN** it transitions to `pending-signoff`, not `archivable` — regardless of whether changes are additions, modifications, or removals

#### Scenario: Gate enabled — archivable after signoff

- **WHEN** `approvals.signoff: true` and a Change in `pending-signoff` receives sign-off
- **THEN** it transitions to `signed-off` and then to `archivable`

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

### Requirement: Approval records

#### Scenario: Spec approval recorded

- **WHEN** a Change in `pending-spec-approval` is approved
- **THEN** an approval record with reason, approver identity, timestamp, and all artifact hashes is appended to the spec approval history

#### Scenario: Sign-off recorded

- **WHEN** a Change in `pending-signoff` is signed off
- **THEN** a sign-off record with reason, approver identity, timestamp, and all artifact hashes is appended to the signoff history

#### Scenario: Artifact change invalidates approval

- **WHEN** an artifact's content changes after a spec approval record was written
- **THEN** the existing approval records are marked superseded, the change rolls back to `designing`

#### Scenario: Workspace change invalidates approval

- **WHEN** a workspace is added to the Change after a spec approval record was written
- **THEN** the existing approval records are marked superseded, the change rolls back to `designing`

#### Scenario: Multiple approval records in history

- **WHEN** a Change is approved, then modified (invalidating the approval), then approved again
- **THEN** the approval history contains two records — the first marked superseded, the second active

#### Scenario: Approval records never modified

- **WHEN** a Change already has approval records
- **THEN** no operation may overwrite or modify existing records — only append new ones

### Requirement: Schema version

#### Scenario: Schema version mismatch warns

- **WHEN** a Change is loaded and the active schema's version differs from the version recorded in the manifest
- **THEN** specd emits a warning but the change remains fully usable

#### Scenario: Schema mismatch does not block archive

- **WHEN** a Change with a schema version mismatch is in `archivable` state
- **THEN** archiving proceeds normally — the mismatch warning is advisory only

### Requirement: Drafting and discarding

#### Scenario: Draft requires identity

- **WHEN** a Change is drafted without providing a `draftedBy` identity
- **THEN** the operation fails with a validation error

#### Scenario: Draft moves change out of active changes

- **WHEN** a Change in `implementing` state is drafted with a valid identity
- **THEN** a `DraftRecord` is written to the manifest, the change is moved to `drafts/`, retains its `implementing` state, and no longer appears in the active changes list

#### Scenario: Restore recovers a drafted change

- **WHEN** a drafted Change is restored
- **THEN** it is moved back to `changes/` and resumes from its preserved state

#### Scenario: Discard requires reason and identity

- **WHEN** a Change is discarded without providing a reason or discarding identity
- **THEN** the operation fails with a validation error

#### Scenario: Discard records who discarded and why

- **WHEN** a Change is discarded with a reason, identity, and optional superseding change names
- **THEN** a `DiscardRecord` is written to the manifest before the change is moved to `discarded/`

#### Scenario: Discard from drafts

- **WHEN** a drafted Change is discarded
- **THEN** it is moved to `discarded/` with its `DiscardRecord` and cannot be recovered

#### Scenario: Discard with supersededBy

- **WHEN** a Change is discarded with `supersededBy: ['new-auth-flow', 'cleanup-tokens']`
- **THEN** the `DiscardRecord` stores those names for traceability

#### Scenario: Discarded change cannot be restored

- **WHEN** a discard operation is attempted to be reversed
- **THEN** no operation exists to move a change out of `discarded/`
