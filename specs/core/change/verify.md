# Verification: Change

## Requirements

### Requirement: Identity

#### Scenario: Change name immutable after creation

- **WHEN** a Change is created with name `add-auth-flow`
- **THEN** the name cannot be changed by any subsequent operation

### Requirement: Workspaces

#### Scenario: Single workspace change

- **WHEN** a Change is created with `workspaces: ['default']`
- **THEN** only the `default` workspace is active for `CompileContext`

#### Scenario: Multi-workspace change

- **WHEN** a Change is created with `workspaces: ['default', 'billing']`
- **THEN** both `default` and `billing` are active and both workspace-level context patterns are applied

#### Scenario: Workspace list immutable after creation

- **WHEN** a Change has been created with `workspaces: ['default']`
- **THEN** no operation may add or remove workspace IDs from the list

#### Scenario: Empty workspace list rejected at creation

- **WHEN** a Change is created with an empty `workspaces` list
- **THEN** the creation fails with a validation error

#### Scenario: Undeclared workspace ID rejected at creation

- **WHEN** a Change is created with `workspaces: ['unknown']` and no workspace named `unknown` exists in `specd.yaml`
- **THEN** the creation fails with a validation error

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

#### Scenario: Archive without signoff throws

- **WHEN** `approvals.signoff: true` and a Change is not in `archivable` state and archiving is attempted
- **THEN** `SignoffRequiredError` is thrown

### Requirement: Artifacts

#### Scenario: Status derived — complete

- **WHEN** an artifact's current file hash matches its `validatedHash`
- **THEN** `effectiveStatus` returns `complete`

#### Scenario: Status derived — missing

- **WHEN** an artifact's file does not exist
- **THEN** `effectiveStatus` returns `missing`

#### Scenario: Status derived — in-progress

- **WHEN** an artifact's file exists but its hash differs from `validatedHash`
- **THEN** `effectiveStatus` returns `in-progress`

#### Scenario: Dependency cascade — incomplete dependency

- **WHEN** artifact B requires artifact A, and artifact A is `in-progress`
- **THEN** `effectiveStatus` for artifact B returns `in-progress` even if B's own hash matches its `validatedHash`

#### Scenario: markComplete only from ValidateSpec

- **WHEN** any code path other than `ValidateSpec` calls `Artifact.markComplete(hash)`
- **THEN** this is a violation of the domain contract — no other use case may set an artifact to `complete`

### Requirement: Structural changes

#### Scenario: MODIFIED operation recorded as structural

- **WHEN** a delta merger detects a MODIFIED operation on a requirement block
- **THEN** a structural change entry with `type: MODIFIED` is added to the change

#### Scenario: REMOVED operation recorded as structural

- **WHEN** a delta merger detects a REMOVED operation on a requirement block
- **THEN** a structural change entry with `type: REMOVED` is added to the change

#### Scenario: ADDED operation not structural

- **WHEN** a delta merger detects only ADDED operations
- **THEN** no structural change entries are added

### Requirement: Approval records

#### Scenario: Sign-off recorded once

- **WHEN** a Change in `pending-signoff` is signed off with a reason and approver identity
- **THEN** a sign-off record is written to the manifest and the change transitions to `signed-off`

#### Scenario: Spec approval recorded once

- **WHEN** a Change in `pending-spec-approval` is approved with a reason and approver identity
- **THEN** an `ApprovalRecord` is written to the manifest and the change transitions to `spec-approved`

#### Scenario: Approval records not modified

- **WHEN** a Change already has an approval record for a gate
- **THEN** no subsequent operation may overwrite or modify it

#### Scenario: Two independent records

- **WHEN** both gates are enabled and a Change passes through both approval flows
- **THEN** the manifest contains two distinct records — one spec approval record, one sign-off record

### Requirement: Schema version

#### Scenario: Schema version mismatch warns

- **WHEN** a Change is loaded and the active schema's version differs from the version recorded in the manifest
- **THEN** specd emits a warning but the change remains fully usable

#### Scenario: Schema mismatch does not block archive

- **WHEN** a Change with a schema version mismatch is in `archivable` state
- **THEN** archiving proceeds normally — the mismatch warning is advisory only
