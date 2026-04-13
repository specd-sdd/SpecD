# Change

## Purpose

Without a single entity that owns spec work end-to-end, lifecycle state, approval gates, and artifact tracking would scatter across uncoordinated subsystems. A Change is the central domain entity in specd — a discrete, named unit of in-progress spec work covering one or more workspaces that moves from drafting through implementation and into the archive. Every specd operation targets a Change, and the Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`) and a `createdAt` timestamp recorded at creation time. Both are immutable. The name is the primary handle used in all CLI commands and port interfaces. The `createdAt` timestamp is the source of truth for ordering — the storage layer derives its directory name prefix from it (see storage spec), but that prefix is an infrastructure concern and does not appear in the domain model.

### Requirement: Workspaces and specs

A Change declares:

- **`specIds`** — zero or more spec IDs being created or modified by this change (e.g. `['auth/login', 'billing:invoices']`). An empty list is allowed (e.g. when a change is first created but specs have not yet been assigned).
- **`workspaces`** — a **computed getter** derived at runtime from `specIds` by extracting the workspace component of each spec ID via `parseSpecId()`. It is not a declared or persisted field. When `specIds` is empty, `workspaces` is empty.
- **`specDependsOn`** — an optional map from spec ID to an array of spec IDs representing per-spec declared dependencies. Captured during change authoring to track dependencies independently of `.specd-metadata.yaml`. Used by `CompileContext` as the highest-priority source for `dependsOn` resolution. Not subject to approval invalidation — updating `specDependsOn` does not trigger an `invalidated` event.

`specIds` have their workspace component validated against `specd.yaml` at creation time (the spec path itself is not validated against the filesystem, since a change may create new specs that don't yet exist). `specIds` is **mutable** after creation — specs can be added or removed as the change scope evolves. Any modification to `specIds` triggers approval invalidation (see Requirement: History and event sourcing).

When `specIds` is updated via `updateSpecIds()`, any `specDependsOn` entry whose key is not present in the new set of spec IDs SHALL be removed. This prevents orphaned dependency entries from persisting through save/load round-trips and from causing `CompileContext` to resolve unnecessary transitive dependencies.

`CompileContext` derives the active workspaces from `specIds` via the `workspaces` getter. It resolves `dependsOn` entries directly from `change.specIds` by reading each spec's `.specd-metadata.yaml`, then follows links transitively. This resolution happens dynamically on every execution, not as a snapshot. See [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) for the `.specd-metadata.yaml` format.

### Requirement: Lifecycle

A Change progresses through the following states. Two approval gates are configurable in `specd.yaml` (`approvals.spec` and `approvals.signoff`, both default `false`); the dashed paths are only active when the corresponding gate is enabled:

```
drafting → designing → ready ──────────────────────────────────────── → implementing ⇄ verifying → done ──────────────────── → archivable
                             ╌→ pending-spec-approval → spec-approved ┘                            ╌→ pending-signoff → signed-off ┘
                               (if approvals.spec: true)                                              (if approvals.signoff: true)
```

| State                   | Meaning                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `drafting`              | Initial state; the change has been created but no design work has started                          |
| `designing`             | The agent is elaborating or revising the change artifacts                                          |
| `ready`                 | The design artifact set is complete; awaiting implementation (or spec approval if gate is enabled) |
| `pending-spec-approval` | Waiting for human approval of the spec before implementation may begin                             |
| `spec-approved`         | Spec has been approved; implementation may begin                                                   |
| `implementing`          | Code is being written against the current artifacts and task set                                   |
| `verifying`             | The implementation is being verified against the current verify scenarios                          |
| `done`                  | Verification is complete; the change is ready to archive                                           |
| `pending-signoff`       | Waiting for human sign-off on the completed work before archiving                                  |
| `signed-off`            | Work has been signed off; the change may be archived                                               |
| `archivable`            | Final archival checks have passed and the change may be moved to the archive                       |

Only the transitions shown above are valid. Any attempt to transition to a state not reachable from the current state throws `InvalidStateTransitionError`.

The `implementing ↔ verifying` loop may repeat any number of times. The transition `implementing → verifying` is only valid when all tasks in the `tasks` artifact are complete. The transition `verifying → implementing` is valid only for implementation-only failures: the current artifacts still describe the intended behavior and the required fix fits within the already-defined tasks. If verification concludes that the artifacts themselves must be revised, or that new tasks are required before implementation can resume, the change returns to `designing` instead.

Every state except `drafting` MAY return to `designing`. However, when the change is already in `designing` (a `designing → designing` transition), this is a state-preserving re-entry and MUST NOT trigger approval invalidation or artifact downgrade.

Returning to `designing` from a later state (e.g. `implementing → designing`, `ready → designing`) does not imply that artifacts drifted; it means the artifact set must be reviewed again before work can proceed.

### Requirement: Implementation and verification loop

The `implementing` and `verifying` states form a loop that repeats until verification passes.

The transition `implementing → verifying` is gated by the workflow model's task completion gating rule (see [`specs/core/workflow-model/spec.md` — Requirement: Task completion gating](../workflow-model/spec.md)). Because the `verifying` step's `requires` includes `tasks` (which declares `taskCompletionCheck`), the transition is automatically blocked when incomplete task items remain. This is a content-level check on the artifact files, not a check on approval state.

Verification has two distinct outcomes:

- **`implementation-failure`** — the code does not satisfy the current artifacts, but the artifacts still correctly describe the intended behavior and the required fix fits within the existing task set. This outcome returns the change to `implementing` without invalidating or downgrading unchanged artifacts.
- **`artifact-review-required`** — the desired behavior has changed, the current artifacts are no longer sufficient, or the required fix would introduce tasks not already defined. This outcome returns the change to `designing`, where the artifacts are reviewed and updated.

Actual artifact drift is handled separately from verification outcomes. If any validated artifact file changes on disk and enters `drifted-pending-review`, the change is invalidated back to `designing` regardless of the current lifecycle state.

The loop may repeat any number of times. History records each round in full.

### Requirement: Spec approval gate

When `approvals.spec: true`, the transition from `ready` to `implementing` is blocked. The change must first transition to `pending-spec-approval`, receive an explicit approval (approver identity, reason, artifact hashes), and then transition to `spec-approved` before `implementing` becomes reachable.

When `approvals.spec: false` (default), `ready → implementing` is a free transition. The `pending-spec-approval` and `spec-approved` states are unreachable.

### Requirement: Signoff gate

When `approvals.signoff: true`, the transition from `done` to `archivable` is always blocked — regardless of whether the change contains only new specs, modifications, or removals. The change must transition to `pending-signoff`, receive an explicit sign-off (approver identity, reason, artifact hashes), and transition through `signed-off → archivable`.

When `approvals.signoff: false` (default), `done → archivable` is a free transition. Attempting to archive a change that is not in `archivable` state throws `InvalidStateTransitionError`.

### Requirement: Artifacts

A Change holds a set of artifacts — typed files whose types and dependency graph are declared by the active schema. Each artifact is a `ChangeArtifact` that contains zero or more `ArtifactFile` entries — one per file the artifact produces.

A `ChangeArtifact` has:

- **`type`** — the artifact type ID from the schema (e.g. `proposal`, `specs`, `design`, `tasks`)
- **`optional`** — whether the artifact is required for archiving
- **`requires`** — ordered list of artifact type IDs that must be complete before this artifact can satisfy downstream dependencies
- **`state`** — the persisted aggregate state of the artifact
- **`files`** — a `Map<string, ArtifactFile>` of tracked files, keyed by file key

For `scope: change` artifacts there is typically one file keyed by the artifact type id. For `scope: spec` artifacts there is one file per spec ID in `change.specIds`.

Each `ArtifactFile` value object has:

- **`key`** — identifier for this file within the artifact (artifact type id for `scope: change`, spec ID for `scope: spec`)
- **`filename`** — the file path within the change directory
- **`state`** — the persisted file state; this is the source of truth at file level
- **`validatedHash`** — the hash recorded when the file was last validated, computed after applying `preHashCleanup` if declared in the schema. The sentinel value `"__skipped__"` is used when an optional artifact is explicitly marked as not produced.

Allowed `state` values for both artifacts and files are:

- `missing`
- `in-progress`
- `complete`
- `skipped`
- `pending-review`
- `drifted-pending-review`

State semantics are:

- `missing` — the expected file is absent or, for backward-compatible loads, no explicit state was persisted
- `in-progress` — the file exists and is being authored or revised, but has not yet been revalidated
- `complete` — the file has been validated and remains accepted as the current source of truth
- `skipped` — the optional file was explicitly marked as not produced
- `pending-review` — the file was previously validated, but the change returned to `designing` and the file must be reviewed again against the current change intent
- `drifted-pending-review` — the file was previously validated, later changed on disk, and now requires explicit review

`validatedHash` still participates in drift detection and approval signatures, but it is no longer the source of truth for artifact status. A file's current state is read from its persisted `state`, and hash comparison is one of the mechanisms that may change that state.

The aggregated `state` on `ChangeArtifact` is materialized from file states and is also persisted:

- `drifted-pending-review` — at least one file is `drifted-pending-review`
- `pending-review` — no file is `drifted-pending-review`, and at least one file is `pending-review`
- `complete` — all files are `complete` or `skipped`, and at least one file exists
- `skipped` — all files are `skipped`, and at least one file exists
- `missing` — all files are `missing`, or the artifact has no files
- `in-progress` — any remaining mixed or partially-authored state

`skipped` is only valid for `optional: true` artifacts. Attempting to skip a non-optional artifact throws an error.

The `skipped` state must be set explicitly by an actor — human or agent via a CLI command. The agent must be instructed (via the schema `instruction` or skill definition) to call that command when it decides not to produce an optional artifact. The specific CLI command is defined in the CLI spec.

`ChangeArtifact.markComplete(key, hash)` takes two arguments — the file key and the content hash — and delegates to the corresponding `ArtifactFile.markComplete(hash)`. A successful completion sets the file state to `complete`, updates `validatedHash`, and recomputes the parent artifact state. `ChangeArtifact.markSkipped()` marks ALL files in the artifact as `skipped`. These may only be called by the `ValidateArtifacts` and skip use cases respectively. No other code path may set these values.

Returning to `designing` changes review state at file level. Every file in every artifact moves to `pending-review`, except files already marked `drifted-pending-review`, which keep that more specific state. The same downgrade applies when scope changes while the change already remains in `designing`: previously validated files are no longer treated as complete until they are reviewed again.

Dependency satisfaction is driven by the persisted artifact `state`. Only artifacts in `complete` or `skipped` satisfy `requires`. Artifacts in `missing`, `in-progress`, `pending-review`, or `drifted-pending-review` block dependents.

**Rollback:** `invalidate()` accepts affected artifact/file detail for the files whose validated content actually drifted. When drift is reported, those files are set to `drifted-pending-review`, their parent artifacts are recomputed, and all other files are downgraded to `pending-review` as part of the return to `designing`. Upstream files are not marked drifted unless their own validated content changed.

### Requirement: Artifact sync

A Change can reconcile its artifact map against the current schema's artifact types via the `syncArtifacts(artifactTypes)` method. This method:

1. Compares the current artifact map against the provided `artifactTypes` array.
2. Adds new artifact types and their expected files (based on scope and specIds).
3. Removes artifact types no longer in the schema.
4. For existing artifacts, adds files for new spec IDs and removes files for spec IDs no longer in the change.
5. Returns `true` if any changes were made, `false` if the artifact map was already in sync.
6. When changes are made, appends an `ArtifactsSyncedEvent` to history with the `SYSTEM_ACTOR` identity.

`SYSTEM_ACTOR` is a constant `{ name: 'specd', email: 'system@specd.dev' }` used for automated operations like artifact sync. It is not a user actor and does not require VCS resolution.

### Requirement: History and event sourcing

The change manifest contains an **append-only `history` array** of typed events. Every significant operation appends one or more events. Events are never modified or removed.

The **current lifecycle state** of a Change is derived entirely from its history: the `to` field of the most recent `transitioned` event. If no `transitioned` event exists, the state is `drafting`. No separate state snapshot is stored. The JSON serialization of these events in `manifest.json` is defined in [`specs/core/change-manifest/spec.md` — Requirement: Manifest structure](../change-manifest/spec.md).

The **current draft/active status** is derived from history: if the most recent `drafted` or `restored` event is of type `drafted`, the change is currently shelved in `drafts/`; otherwise it is active in `changes/`.

The **active approval** for each gate is the most recent `spec-approved` or `signed-off` event that has not been superseded by a subsequent `invalidated` event.

All events share common fields:

- **`type`** — identifies the event kind
- **`at`** — ISO 8601 timestamp
- **`by`** — git identity (`name` + `email`) of the actor, mandatory on all events

Event types:

| Type               | Additional fields                                          | When appended                                                  |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `created`          | `specIds`, `schemaName`, `schemaVersion`                   | Once, when the change is first created                         |
| `transitioned`     | `from: ChangeState`, `to: ChangeState`                     | Each lifecycle state transition                                |
| `spec-approved`    | `reason: string`, `artifactHashes: Record<string, string>` | When the spec approval gate is passed                          |
| `signed-off`       | `reason: string`, `artifactHashes: Record<string, string>` | When the signoff gate is passed                                |
| `invalidated`      | `cause`, `message`, `affectedArtifacts`                    | When scope or artifact review invalidates prior approvals      |
| `drafted`          | `reason?: string`                                          | When a change is shelved to `drafts/`                          |
| `restored`         | _(none beyond common fields)_                              | When a drafted change is moved back to `changes/`              |
| `artifact-skipped` | `artifactId: string`, `reason?: string`                    | When an optional artifact is explicitly marked as not produced |
| `artifacts-synced` | `typesAdded`, `typesRemoved`, `filesAdded`, `filesRemoved` | When artifact sync reconciles the artifact map against schema  |
| `discarded`        | `reason: string`, `supersededBy?: string[]`                | When a change is permanently abandoned                         |

`invalidated.cause` is explicit and machine-readable:

- `spec-change` — the change scope changed (for example, `specIds` were edited)
- `artifact-drift` — one or more validated artifact files changed on disk
- `artifact-review-required` — the change returned to `designing` because the artifacts must be revised even though no drifted file was detected

`invalidated.message` is a clear human-readable explanation, not a one-word label. `invalidated.affectedArtifacts` is a structured list of the affected artifact types and file keys so callers can explain exactly what triggered the review:

- `type` — artifact type ID
- `files` — list of file keys, using the artifact file key for `scope: change` and the spec ID for `scope: spec`

Approval invalidation caused by artifact drift MUST capture the full set of affected files before the event is appended. If multiple files drift in the same invalidation pass, they are recorded in the same `invalidated` event.

### Requirement: Historical implementation detection

A Change SHALL treat any historical transition to `implementing` as evidence that implementation may already exist, even if the current lifecycle state later returns to `designing`, `verifying`, or another non-terminal state.

This detection is temporary and pragmatic. Until specd can detect whether a change has actually modified code files, the system SHALL derive this signal by scanning the append-only history for any `transitioned` event whose `to` field is `implementing`.

The signal is historical, not state-based. It remains true once reached unless the project later introduces a more precise file-level implementation detector.

### Requirement: Schema version

The `created` event records the `schemaName` and `schemaVersion` of the schema active at creation time.

A **`schemaName` mismatch** (e.g. `schema-std` → `custom-schema`) indicates structural incompatibility — different artifact types, formats, delta rules, and validations. When a use case (`ArchiveChange`, `ValidateArtifacts`, `CompileContext`) detects that `schema.name() !== change.schemaName`, it must throw `SchemaMismatchError` before performing any work. This is an error, not a warning.

A **`schemaVersion` mismatch** within the same schema name is advisory. A warning is emitted but the change remains fully usable. Archiving with a `schemaVersion` mismatch is allowed; a `schemaName` mismatch throws `SchemaMismatchError`.

### Requirement: Drafting and discarding

A change may be moved between storage locations without affecting its lifecycle state. All operations are recorded as events in history.

- **Draft** (`changes/` → `drafts/`) — shelves the change. Appends a `drafted` event with: Drafting remains orthogonal to the current lifecycle state, but it is guarded by historical implementation detection. If the change has ever reached `implementing`, drafting SHALL fail by default because implementation may already exist and shelving the change would risk leaving permanent specs and code out of sync. The operation MAY proceed only when the caller explicitly forces it.
  - **`by`** — mandatory git identity (name + email) of the person shelving
  - **`at`** — timestamp
  - **`reason`** — optional explanation
- **Restore** (`drafts/` → `changes/`) — recovers a drafted change. Appends a `restored` event. The change resumes from its preserved state.
- **Discard** (`changes/` or `drafts/` → `discarded/`) — permanently abandons the change. Appends a `discarded` event with: Discarding is irreversible. A change may be drafted and restored multiple times before being discarded; the full cycle is preserved in history. If the change has ever reached `implementing`, discarding SHALL fail by default because implementation may already exist and abandoning the workflow would risk leaving permanent specs and code out of sync. The operation MAY proceed only when the caller explicitly forces it.
  - **`reason`** — mandatory human-provided explanation
  - **`by`** — mandatory git identity (name + email) of the person discarding
  - **`at`** — timestamp
  - **`supersededBy`** — optional list of change names that replace this one

## Constraints

- `name` and `createdAt` are set at creation and never changed
- `workspaces` is a computed getter derived from `specIds` via `parseSpecId()` — it is not a declared or persisted field
- `specIds` may be empty (empty specIds results in empty workspaces)
- Current lifecycle state is derived from history (last `transitioned` event); no state snapshot is stored
- Any modification to the spec list or any artifact content appends an `invalidated` event followed by a `transitioned` event back to `designing` — this may be triggered by use cases or automatically by `FsChangeRepository.get()` using `SYSTEM_ACTOR`
- A `designing → designing` transition MUST NOT trigger approval invalidation or artifact downgrade — re-entering the same step is not a backward transition
- `ChangeArtifact` contains a `files: Map<string, ArtifactFile>` — artifact status is aggregated from per-file statuses
- `ArtifactFile` status is never stored directly — always derived from `validatedHash` and file presence
- `validatedHash === "__skipped__"` is the sentinel for `skipped` status — only valid on `optional: true` artifacts
- `skipped` is only valid for `optional: true` artifacts; attempting to skip a non-optional artifact throws an error
- `skipped` satisfies the dependency in `requires` chains and workflow step availability checks — treated as resolved
- On `invalidated` event: all file `validatedHash` values are cleared via `resetValidation()` — resets `complete` → `in-progress` and `skipped` → `missing` uniformly
- On `verifying → implementing`: only artifacts in `implementing.requires` are reset
- `ChangeArtifact.markComplete(key, hash)` may only be called from `ValidateArtifacts`
- `ChangeArtifact.markSkipped()` marks ALL files and may only be called from the skip use case
- `syncArtifacts(artifactTypes)` reconciles the artifact map against the schema; appends `artifacts-synced` event with `SYSTEM_ACTOR` when changes occur
- `archivable` is the only state from which a change may be archived; attempting to archive from any other state throws `InvalidStateTransitionError`
- Both approval gates default to `false` — teams opt in via `approvals` in `specd.yaml`
- When `approvals.spec: true`, spec approval is required before `implementing`
- When `approvals.signoff: true`, sign-off is always required before `archivable`, regardless of change content
- Task completion gating is enforced generically by the workflow model — any step that requires an artifact with `taskCompletionCheck` is automatically gated (see [`specs/core/workflow-model/spec.md`](../workflow-model/spec.md))
- `verifying → implementing` does not trigger approval invalidation
- History events are never modified or deleted; invalidated approvals are identifiable by a subsequent `invalidated` event
- Historical implementation detection is derived from append-only history by scanning for any `transitioned` event whose `to` field is `implementing`
- Drafting or discarding after historical implementation requires an explicit force override because implementation may already exist and specs and code could otherwise be left out of sync
- Discarding a change requires a `discarded` event with mandatory `reason` and `by`; it is irreversible

## Spec Dependencies

- [`core:core/change-manifest`](../change-manifest/spec.md) — manifest serialization of artifact and history state
- [`core:core/workflow-model`](../workflow-model/spec.md) — workflow step semantics and requires gating
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — dependency metadata resolution used during context compilation
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` identifiers for spec-scoped files
- [`default:_global/architecture`](../../_global/architecture/spec.md) — domain ownership of lifecycle and artifact invariants
