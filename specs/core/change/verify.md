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

#### Scenario: Valid transition — implementing to verifying when all task items complete

- **GIVEN** a Change in `implementing` state
- **AND** all artifacts in the `implementing` step's `requires` have zero matches for their `taskCompletionCheck.incompletePattern`
- **WHEN** the change is transitioned to `verifying`
- **THEN** a `transitioned` event with `from: 'implementing'` and `to: 'verifying'` is appended and deriving state returns `verifying`

#### Scenario: Default incompletePattern matches markdown unchecked checkboxes

- **GIVEN** an artifact with no `taskCompletionCheck` declared
- **AND** its file contains `- [ ] implement login` and `- [x] implement logout`
- **WHEN** the `implementing → verifying` transition is attempted
- **THEN** the default pattern `^\s*-\s+\[ \]` matches `- [ ] implement login` and the transition is blocked

#### Scenario: Custom incompletePattern blocks transition

- **GIVEN** an artifact declares `taskCompletionCheck.incompletePattern: '^\s*TODO:'`
- **AND** its file contains `TODO: implement login` and `DONE: implement logout`
- **WHEN** the `implementing → verifying` transition is attempted
- **THEN** the custom pattern matches `TODO: implement login` and the transition is blocked

#### Scenario: Invalid transition — implementing to verifying when a task item is incomplete

- **GIVEN** a Change in `implementing` state
- **AND** at least one artifact in the `implementing` step's `requires` has one or more matches for `taskCompletionCheck.incompletePattern`
- **WHEN** the change is transitioned to `verifying`
- **THEN** `InvalidStateTransitionError` is thrown and the state remains `implementing`

#### Scenario: Progress reported from both patterns

- **GIVEN** an artifact with `taskCompletionCheck.completePattern` and `taskCompletionCheck.incompletePattern` both declared
- **AND** the artifact file contains 3 complete items and 2 incomplete items
- **WHEN** the CLI reports task progress
- **THEN** it reports `3/5 tasks complete`

#### Scenario: Invalid transition — implementing to done (skipping verifying)

- **WHEN** a Change in `implementing` state is transitioned directly to `done`
- **THEN** `InvalidStateTransitionError` is thrown and the state remains `implementing`

#### Scenario: Valid transition — verifying back to implementing when verification fails

- **GIVEN** a Change in `verifying` state where verification has failed and changes are required
- **WHEN** the change is transitioned back to `implementing`
- **THEN** a `transitioned` event with `from: 'verifying'` and `to: 'implementing'` is appended
- **AND** no approval invalidation is triggered

#### Scenario: implementing ↔ verifying loop repeats until verification passes

- **GIVEN** a Change that has cycled through `implementing → verifying → implementing → verifying`
- **WHEN** verification passes on the second verifying round
- **THEN** the change transitions to `done` and the full cycle is recorded in history

#### Scenario: Valid transition — verifying to done

- **WHEN** a Change in `verifying` state transitions to `done`
- **THEN** a `transitioned` event with `from: 'verifying'` and `to: 'done'` is appended

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

#### Scenario: Status derived — skipped

- **GIVEN** an `optional: true` artifact with no file on disk
- **AND** its `validatedHash` is `"__skipped__"`
- **WHEN** `effectiveStatus` is derived
- **THEN** it returns `skipped`

#### Scenario: skipped persists across calls

- **GIVEN** an `optional: true` artifact with `validatedHash === "__skipped__"` persisted in the manifest
- **WHEN** `effectiveStatus` is derived in a subsequent CLI invocation
- **THEN** it returns `skipped` — the sentinel in the manifest is the source of truth

#### Scenario: skipping a non-optional artifact fails

- **WHEN** an attempt is made to skip an artifact with `optional: false`
- **THEN** the operation fails with an error and `validatedHash` is not modified

#### Scenario: invalidated event with driftedArtifactIds clears only downstream

- **GIVEN** a DAG: proposal → specs → verify, proposal → design, specs + design → tasks
- **AND** all artifacts are `complete`
- **WHEN** `invalidate('artifact-change', actor, ['tasks'])` is called
- **THEN** only `tasks.validatedHash` is cleared (no downstream dependents)
- **AND** `proposal`, `specs`, `verify`, and `design` remain `complete`

#### Scenario: invalidated event with driftedArtifactIds cascades downstream

- **GIVEN** a DAG: proposal → specs → verify, proposal → design, specs + design → tasks
- **AND** all artifacts are `complete`
- **WHEN** `invalidate('artifact-change', actor, ['specs'])` is called
- **THEN** `specs`, `verify`, and `tasks` are cleared (specs + its downstream)
- **AND** `proposal` and `design` remain `complete`

#### Scenario: invalidated event without driftedArtifactIds clears all

- **GIVEN** a change with one `complete` artifact and one `skipped` artifact
- **WHEN** `invalidate('artifact-change', actor)` is called without `driftedArtifactIds`
- **THEN** all `validatedHash` values are cleared — the `complete` artifact becomes `in-progress` and the `skipped` artifact becomes `missing`

#### Scenario: verifying → implementing clears only implementing.requires artifacts

- **GIVEN** a change with `implementing.requires: [tasks]` and `tasks` is `complete`
- **WHEN** the change transitions `verifying → implementing`
- **THEN** only `tasks.validatedHash` is cleared — other artifacts retain their status

#### Scenario: Dependency cascade — skipped optional satisfies dependency

- **GIVEN** artifact B requires artifact A, and artifact A is `optional: true` and `skipped`
- **WHEN** `effectiveStatus` for artifact B is derived
- **THEN** it is not blocked by A — `skipped` is treated as resolved

#### Scenario: Dependency cascade — incomplete dependency

- **WHEN** artifact B requires artifact A, and artifact A is `in-progress`
- **THEN** `effectiveStatus` for artifact B returns `in-progress` even if B's own cleaned hash matches its `validatedHash`

#### Scenario: markComplete only from ValidateArtifacts

- **WHEN** any code path other than `ValidateArtifacts` calls `Artifact.markComplete(hash)`
- **THEN** this is a violation of the domain contract — no other use case may set an artifact to `complete`

### Requirement: History and event sourcing

#### Scenario: History is append-only

- **WHEN** any operation is performed on a Change
- **THEN** new events are appended to history; no existing event is modified or removed

#### Scenario: State derived from last transitioned event

- **WHEN** history contains `transitioned` events with `to` values of `designing`, `ready`, `implementing`, `verifying`
- **THEN** deriving state returns `verifying` (the most recent `to` value)

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
