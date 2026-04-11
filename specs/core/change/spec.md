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

| State                   | Meaning                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `drafting`              | Initial state; the change has been created but no design work has started                     |
| `designing`             | The agent is elaborating the spec content                                                     |
| `ready`                 | The spec is complete; awaiting implementation (or spec approval if gate is enabled)           |
| `pending-spec-approval` | Waiting for human approval of the spec before implementation may begin                        |
| `spec-approved`         | Spec has been approved; implementation may begin                                              |
| `implementing`          | Code is being written against the spec; all tasks must be complete to transition to verifying |
| `verifying`             | The implementation is being verified against the spec scenarios                               |
| `done`                  | Verification is complete; the change is ready to archive                                      |
| `pending-signoff`       | Waiting for human sign-off on the completed work before archiving                             |
| `signed-off`            | Work has been signed off; the change may be archived                                          |
| `archivable`            | Terminal state; the change may be moved to the archive                                        |

Only the transitions shown above are valid. Any attempt to transition to a state not reachable from the current state throws `InvalidStateTransitionError`. `archivable` is terminal — no further transitions are possible.

The `implementing ↔ verifying` loop may repeat any number of times. The transition `implementing → verifying` is only valid when all tasks in the `tasks` artifact are complete. The transition `verifying → implementing` is taken when verification fails and changes are required — the tasks artifact is reset to `in-progress` to allow new tasks to be added before the next implementation round begins.

### Requirement: Implementation and verification loop

The `implementing` and `verifying` states form a loop that repeats until verification passes.

The transition `implementing → verifying` is gated by the workflow model's task completion gating rule (see [`specs/core/workflow-model/spec.md` — Requirement: Task completion gating](../workflow-model/spec.md)). Because the `verifying` step's `requires` includes `tasks` (which declares `taskCompletionCheck`), the transition is automatically blocked when incomplete task items remain. This is a content-level check on the artifact files, not a check on `effectiveStatus`.

The transition `verifying → implementing` is taken when verification fails and changes are required. No approval invalidation is triggered by this transition; the spec has not changed, only the implementation work has been found insufficient.

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
- **`requires`** — ordered list of artifact type IDs that must be complete before this artifact can be validated
- **`files`** — a `Map<string, ArtifactFile>` of tracked files, keyed by file key

For `scope: change` artifacts there is typically one file keyed by the artifact type id. For `scope: spec` artifacts there is one file per spec ID in `change.specIds`.

Each `ArtifactFile` value object has:

- **`key`** — identifier for this file within the artifact (artifact type id for `scope: change`, spec ID for `scope: spec`)
- **`filename`** — the file path within the change directory
- **`status`** — derived at load time: `missing` | `in-progress` | `complete` | `skipped`
- **`validatedHash`** — the hash recorded when the file was last validated, computed after applying `preHashCleanup` if declared in the schema. The sentinel value `"__skipped__"` is used when an optional artifact is explicitly marked as not produced.

`ArtifactStatus` is never stored directly on the file — it is always derived on load from `validatedHash` and file presence:

1. `validatedHash === "__skipped__"` → `skipped` (only valid for `optional: true` artifacts)
2. File absent (and no sentinel) → `missing`
3. File present and cleaned hash matches `validatedHash` → `complete`
4. File present but hash differs or `validatedHash` is unset → `in-progress`

The aggregated `status` getter on `ChangeArtifact` derives its value from all files:

- `complete` — all files are complete or skipped (and at least one file exists)
- `skipped` — all files are skipped (and at least one file exists)
- `missing` — all files are missing or there are no files
- `in-progress` — some files exist but not all are complete/skipped

`skipped` is only valid for `optional: true` artifacts. Attempting to skip a non-optional artifact throws an error.

The `skipped` state must be set explicitly by an actor — human or agent via a CLI command. The agent must be instructed (via the schema `instruction` or skill definition) to call that command when it decides not to produce an optional artifact. The specific CLI command is defined in the CLI spec.

`ChangeArtifact.markComplete(key, hash)` takes two arguments — the file key and the content hash — and delegates to the corresponding `ArtifactFile.markComplete(hash)`. `ChangeArtifact.markSkipped()` marks ALL files in the artifact as skipped. These may only be called by the `ValidateArtifacts` and skip use cases respectively. No other code path may set these values.

**Rollback:** `invalidate()` accepts an optional `driftedArtifactIds` parameter — a set of artifact type IDs whose content has actually changed. When provided, only the drifted artifacts and their downstream dependents (artifacts whose `requires` chain includes a drifted artifact) have their `validatedHash` cleared via `resetValidation()`. Upstream artifacts that the drifted artifacts depend on are left intact. When `driftedArtifactIds` is not provided, all artifacts are reset (backward-compatible fallback). For the `verifying → implementing` transition, only artifacts in the `implementing` step's `requires` list are reset.

Effective status cascades: an artifact is `in-progress` if any artifact in its `requires` chain is neither `complete` nor `skipped`, even if its own aggregated status matches. A `skipped` optional artifact satisfies the dependency — downstream artifacts and workflow steps treat it as resolved.

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
| `invalidated`      | `cause: 'spec-change' \| 'artifact-change'`                | When specIds or artifacts change, superseding approvals        |
| `drafted`          | `reason?: string`                                          | When a change is shelved to `drafts/`                          |
| `restored`         | _(none beyond common fields)_                              | When a drafted change is moved back to `changes/`              |
| `artifact-skipped` | `artifactId: string`, `reason?: string`                    | When an optional artifact is explicitly marked as not produced |
| `artifacts-synced` | `typesAdded`, `typesRemoved`, `filesAdded`, `filesRemoved` | When artifact sync reconciles the artifact map against schema  |
| `discarded`        | `reason: string`, `supersededBy?: string[]`                | When a change is permanently abandoned                         |

**Approval invalidation:** when the spec list or any artifact content changes, specd appends an `invalidated` event (with the appropriate `cause`) followed immediately by a `transitioned` event rolling back to `designing`. The invalidated approvals remain in history for audit purposes and are identified as superseded by the presence of the subsequent `invalidated` event. Invalidation can be triggered by use cases explicitly or by the repository layer automatically — `FsChangeRepository.get()` calls `invalidate('artifact-change', SYSTEM_ACTOR)` when it detects artifact file drift on disk (see [`specs/core/change-repository-port/spec.md`](../change-repository-port/spec.md)).

**Multiple approval cycles:** if a change is approved, then invalidated, then approved again, the history records all events. The active approval is the last `spec-approved` / `signed-off` event with no subsequent `invalidated` event.

### Requirement: Schema version

The `created` event records the `schemaName` and `schemaVersion` of the schema active at creation time.

A **`schemaName` mismatch** (e.g. `schema-std` → `custom-schema`) indicates structural incompatibility — different artifact types, formats, delta rules, and validations. When a use case (`ArchiveChange`, `ValidateArtifacts`, `CompileContext`) detects that `schema.name() !== change.schemaName`, it must throw `SchemaMismatchError` before performing any work. This is an error, not a warning.

A **`schemaVersion` mismatch** within the same schema name is advisory. A warning is emitted but the change remains fully usable. Archiving with a `schemaVersion` mismatch is allowed; a `schemaName` mismatch throws `SchemaMismatchError`.

### Requirement: Drafting and discarding

A change may be moved between storage locations without affecting its lifecycle state. All operations are recorded as events in history.

- **Draft** (`changes/` → `drafts/`) — shelves the change. Appends a `drafted` event with: Can be performed at any point before archiving. The change retains its full history and lifecycle state.
  - **`by`** — mandatory git identity (name + email) of the person shelving
  - **`at`** — timestamp
  - **`reason`** — optional explanation
- **Restore** (`drafts/` → `changes/`) — recovers a drafted change. Appends a `restored` event. The change resumes from its preserved state.
- **Discard** (`changes/` or `drafts/` → `discarded/`) — permanently abandons the change. Appends a `discarded` event with: Cannot be undone. A change may be drafted and restored multiple times before being discarded; the full cycle is preserved in history.
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
- Discarding a change requires a `discarded` event with mandatory `reason` and `by`; it is irreversible

## Spec Dependencies

- [`core:core/config`](../config/spec.md) — workspace IDs, active workspace semantics, approval gates config, storage locations
- [`core:core/schema-format`](../schema-format/spec.md) — artifact type declarations, dependency graph, `preHashCleanup`, `taskCompletionCheck`
- [`core:core/workflow-model`](../workflow-model/spec.md) — task completion gating rule, requires-based gating semantics
- [`core:core/change-manifest`](../change-manifest/spec.md) — manifest format and JSON serialization of events
- [`core:core/storage`](../storage/spec.md) — persistence mechanics, directory naming
- [`core:core/delta-format`](../delta-format/spec.md) — delta operations, `ArtifactParser` port
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for `specIds`
- [`core:core/workspace`](../workspace/spec.md) — workspace identity, primary workspace, active workspace semantics
