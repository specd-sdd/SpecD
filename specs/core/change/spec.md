# Change

## Overview

A Change is the central domain entity in specd. It represents a discrete, named unit of in-progress spec work — a coherent set of modifications across one or more workspaces that moves from initial drafting through implementation and into the archive. Every specd operation targets a Change. The Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`) and a `createdAt` timestamp recorded at creation time. Both are immutable. The name is the primary handle used in all CLI commands and port interfaces. The `createdAt` timestamp is the source of truth for ordering — the storage layer derives its directory name prefix from it (see storage spec), but that prefix is an infrastructure concern and does not appear in the domain model.

### Requirement: Workspaces and specs

A Change declares:

- **`workspaces`** — one or more workspace IDs it belongs to (e.g. `['default', 'billing']`). Workspace IDs reference keys declared in `specd.yaml`. At least one is required.
- **`specIds`** — one or more spec paths being created or modified by this change (e.g. `['auth/login', 'billing/invoices']`). At least one is required.
- **`contextSpecIds`** — spec paths that provide context for this change but are not being modified. Populated when the change reaches `ready` state by taking the union of `dependsOn` from each spec's `.specd-metadata.yaml` (direct dependencies only). May be empty. Mutable — can be updated manually without triggering approval invalidation.

`workspaces` and `specIds` are validated against `specd.yaml` and the spec filesystem at creation time. Both are **mutable** after creation — workspaces and specs can be added or removed as the change scope evolves. Any modification to `workspaces` or `specIds` triggers approval invalidation (see Requirement: History and event sourcing). Modifications to `contextSpecIds` alone do not invalidate approvals — at most a warning is emitted if context specs change after an approval has been recorded.

`CompileContext` reads `workspaces` from the change manifest to determine which workspaces are active — it does not infer this from spec paths at compile time. It uses `contextSpecIds` as the starting point for context graph traversal, following `dependsOn` links in each spec's `.specd-metadata.yaml` transitively. See [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) for the `.specd-metadata.yaml` format.

### Requirement: Lifecycle

A Change progresses through the following states. Two approval gates are configurable in `specd.yaml` (`approvals.spec` and `approvals.signoff`, both default `false`); the dashed paths are only active when the corresponding gate is enabled:

```
drafting → designing → ready ──────────────────────────────────────── → implementing → done ──────────────────── → archivable
                             ╌→ pending-spec-approval → spec-approved ┘               ╌→ pending-signoff → signed-off ┘
                               (if approvals.spec: true)                                (if approvals.signoff: true)
```

| State                   | Meaning                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `drafting`              | Initial state; the change has been created but no design work has started           |
| `designing`             | The agent is elaborating the spec content                                           |
| `ready`                 | The spec is complete; awaiting implementation (or spec approval if gate is enabled) |
| `pending-spec-approval` | Waiting for human approval of the spec before implementation may begin              |
| `spec-approved`         | Spec has been approved; implementation may begin                                    |
| `implementing`          | Code is being written against the spec                                              |
| `done`                  | Implementation is complete                                                          |
| `pending-signoff`       | Waiting for human sign-off on the completed work before archiving                   |
| `signed-off`            | Work has been signed off; the change may be archived                                |
| `archivable`            | Terminal state; the change may be moved to the archive                              |

Only the transitions shown above are valid. Any attempt to transition to a state not reachable from the current state throws `InvalidStateTransitionError`. `archivable` is terminal — no further transitions are possible.

### Requirement: Spec approval gate

When `approvals.spec: true`, the transition from `ready` to `implementing` is blocked. The change must first transition to `pending-spec-approval`, receive an explicit approval (approver identity, reason, artifact hashes), and then transition to `spec-approved` before `implementing` becomes reachable.

When `approvals.spec: false` (default), `ready → implementing` is a free transition. The `pending-spec-approval` and `spec-approved` states are unreachable.

### Requirement: Signoff gate

When `approvals.signoff: true`, the transition from `done` to `archivable` is always blocked — regardless of whether the change contains only new specs, modifications, or removals. The change must transition to `pending-signoff`, receive an explicit sign-off (approver identity, reason, artifact hashes), and transition through `signed-off → archivable`.

When `approvals.signoff: false` (default), `done → archivable` is a free transition. Attempting to archive a change that is not in `archivable` state throws `InvalidStateTransitionError`.

### Requirement: Artifacts

A Change holds a set of artifacts — typed files whose types and dependency graph are declared by the active schema. Each artifact has:

- **`type`** — the artifact type ID from the schema (e.g. `proposal`, `specs`, `design`, `tasks`)
- **`filename`** — the file path within the change directory
- **`optional`** — whether the artifact is required for archiving
- **`requires`** — ordered list of artifact type IDs that must be complete before this artifact can be validated
- **`status`** — derived at load time: `missing` | `in-progress` | `complete`
- **`validatedHash`** — the hash recorded when the artifact was last validated, computed after applying `preHashCleanup` if declared in the schema

`ArtifactStatus` is never stored directly — it is computed on load by comparing the hash of the current file content (after `preHashCleanup`) against `validatedHash`. An artifact whose cleaned hash matches `validatedHash` is `complete`; otherwise it is `missing` (file absent) or `in-progress` (file present but hash differs or unvalidated).

Effective status cascades: an artifact is `in-progress` if any artifact in its `requires` chain is not `complete`, even if its own hash matches. This prevents marking later artifacts as complete while earlier dependencies are stale.

`Artifact.markComplete(hash)` may only be called by the `ValidateSpec` use case. No other code path may set an artifact to `complete`.

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

| Type            | Additional fields                                                 | When appended                                                        |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `created`       | `workspaces`, `specIds`, `schemaName`, `schemaVersion`            | Once, when the change is first created                               |
| `transitioned`  | `from: ChangeState`, `to: ChangeState`                            | Each lifecycle state transition                                      |
| `spec-approved` | `reason: string`, `artifactHashes: Record<string, string>`        | When the spec approval gate is passed                                |
| `signed-off`    | `reason: string`, `artifactHashes: Record<string, string>`        | When the signoff gate is passed                                      |
| `invalidated`   | `cause: 'workspace-change' \| 'spec-change' \| 'artifact-change'` | When workspaces, specIds, or artifacts change, superseding approvals |
| `drafted`       | `reason?: string`                                                 | When a change is shelved to `drafts/`                                |
| `restored`      | _(none beyond common fields)_                                     | When a drafted change is moved back to `changes/`                    |
| `discarded`     | `reason: string`, `supersededBy?: string[]`                       | When a change is permanently abandoned                               |

**Approval invalidation:** when the workspace list, spec list, or any artifact content changes, specd appends an `invalidated` event (with the appropriate `cause`) followed immediately by a `transitioned` event rolling back to `designing`. The invalidated approvals remain in history for audit purposes and are identified as superseded by the presence of the subsequent `invalidated` event.

**Multiple approval cycles:** if a change is approved, then invalidated, then approved again, the history records all events. The active approval is the last `spec-approved` / `signed-off` event with no subsequent `invalidated` event.

### Requirement: Schema version

The `created` event records the `schemaName` and `schemaVersion` of the schema active at creation time. When the change is loaded, specd compares these values against the currently active schema. If they differ, a warning is emitted. The change remains fully usable — the warning is advisory. Archiving with a schema version mismatch is allowed.

### Requirement: Drafting and discarding

A change may be moved between storage locations without affecting its lifecycle state. All operations are recorded as events in history.

- **Draft** (`changes/` → `drafts/`) — shelves the change. Appends a `drafted` event with:
  - **`by`** — mandatory git identity (name + email) of the person shelving
  - **`at`** — timestamp
  - **`reason`** — optional explanation

  Can be performed at any point before archiving. The change retains its full history and lifecycle state.

- **Restore** (`drafts/` → `changes/`) — recovers a drafted change. Appends a `restored` event. The change resumes from its preserved state.

- **Discard** (`changes/` or `drafts/` → `discarded/`) — permanently abandons the change. Appends a `discarded` event with:
  - **`reason`** — mandatory human-provided explanation
  - **`by`** — mandatory git identity (name + email) of the person discarding
  - **`at`** — timestamp
  - **`supersededBy`** — optional list of change names that replace this one

  Cannot be undone. A change may be drafted and restored multiple times before being discarded; the full cycle is preserved in history.

## Constraints

- `name` and `createdAt` are set at creation and never changed
- A Change must have at least one workspace ID and at least one spec ID
- Current lifecycle state is derived from history (last `transitioned` event); no state snapshot is stored
- Any modification to the workspace list, spec list, or any artifact content appends an `invalidated` event followed by a `transitioned` event back to `designing`
- `ArtifactStatus` is never persisted — always derived from cleaned hash vs `validatedHash`
- `Artifact.markComplete(hash)` may only be called from `ValidateSpec`
- `archivable` is the only state from which a change may be archived; attempting to archive from any other state throws `InvalidStateTransitionError`
- Both approval gates default to `false` — teams opt in via `approvals` in `specd.yaml`
- When `approvals.spec: true`, spec approval is required before `implementing`
- When `approvals.signoff: true`, sign-off is always required before `archivable`, regardless of change content
- History events are never modified or deleted; invalidated approvals are identifiable by a subsequent `invalidated` event
- Discarding a change requires a `discarded` event with mandatory `reason` and `by`; it is irreversible

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — workspace IDs, active workspace semantics, approval gates config, storage locations
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — artifact type declarations, dependency graph, `preHashCleanup`
- [`specs/core/change-manifest/spec.md`](../change-manifest/spec.md) — manifest format and JSON serialization of events
- [`specs/core/storage/spec.md`](../storage/spec.md) — persistence mechanics, directory naming
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — delta operations
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal
