# Change

## Overview

A Change is the central domain entity in specd. It represents a discrete, named unit of in-progress spec work — a coherent set of modifications across one or more workspaces that moves from initial drafting through implementation and into the archive. Every specd operation targets a Change. The Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`) and a `createdAt` timestamp recorded at creation time. Both are immutable. The name is the primary handle used in all CLI commands and port interfaces. The `createdAt` timestamp is the source of truth for ordering — the storage layer derives its directory name prefix from it (see storage spec), but that prefix is an infrastructure concern and does not appear in the domain model.

### Requirement: Workspaces and specs

A Change declares:

- **`workspaces`** — one or more workspace IDs it belongs to (e.g. `['default', 'billing']`). Workspace IDs reference keys declared in `specd.yaml`. At least one is required.
- **`specIds`** — one or more spec paths that are part of this change (e.g. `['auth/login', 'billing/invoices']`). At least one is required.

Both lists are validated against `specd.yaml` and the spec filesystem at creation time. Both are **mutable** after creation — workspaces and specs can be added or removed as the change scope evolves. However, any modification to either list invalidates all existing approval records (see Requirement: Approval records).

`CompileContext` reads `workspaces` from the change manifest to determine which workspaces are active — it does not infer this from spec paths at compile time.

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

When `approvals.spec: true`, the transition from `ready` to `implementing` is blocked. The change must first transition to `pending-spec-approval`, receive an explicit approval record (approver identity, reason, timestamp, artifact hashes), and then transition to `spec-approved` before `implementing` becomes reachable.

When `approvals.spec: false` (default), `ready → implementing` is a free transition. The `pending-spec-approval` and `spec-approved` states are unreachable.

### Requirement: Signoff gate

When `approvals.signoff: true`, the transition from `done` to `archivable` is always blocked — regardless of whether the change contains only new specs, modifications, or removals. The change must transition to `pending-signoff`, receive an explicit sign-off record (approver identity, reason, timestamp, artifact hashes), and transition through `signed-off → archivable`.

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

### Requirement: Approval records

Each approval gate maintains an **ordered list** of approval records on the Change. A new record is appended each time the gate is passed. Each record captures the state of the change at the moment of approval:

- **`reason`** — human-provided rationale
- **`approvedBy`** — git identity (name + email) of the approver
- **`approvedAt`** — timestamp of approval
- **`artifactHashes`** — map of artifact type → cleaned hash for every artifact present at approval time (the complete signature of the change at that moment)

An approval record is written once and never modified. The list grows if the change goes through the same gate multiple times (e.g. after workspace or artifact changes invalidate a prior approval).

**Invalidation:** any change to the workspace list, spec list, or any artifact content invalidates all existing approval records. Invalidation rolls the change back to `designing`. The invalidated records are retained in the history for audit purposes but are marked as superseded.

### Requirement: Schema version

The change manifest records the name and version of the schema that was active when the change was created. This allows specd to detect schema drift. If the active schema's name or version differs from the recorded values when the change is loaded, a warning is emitted. The change remains fully usable — the warning is advisory. Archiving with a schema version mismatch is allowed.

### Requirement: Drafting and discarding

A change may be moved between storage locations without affecting its internal state:

- **Draft** (`changes/` → `drafts/`) — shelves the change. The change retains its lifecycle state and all records. Can be performed at any point before archiving.
- **Restore** (`drafts/` → `changes/`) — recovers a drafted change. It resumes from its preserved state.
- **Discard** (`changes/` or `drafts/` → `discarded/`) — permanently abandons the change. Requires a `DiscardRecord` with:
  - **`reason`** — mandatory human-provided explanation
  - **`discardedBy`** — git identity (name + email) of the person discarding
  - **`discardedAt`** — timestamp
  - **`supersededBy`** — optional list of change names that replace this one

  The `DiscardRecord` is stored in the manifest. Cannot be undone.

## Constraints

- `name` and `createdAt` are set at creation and never changed
- A Change must have at least one workspace ID and at least one spec ID
- Any modification to the workspace list, spec list, or any artifact content invalidates all approval records and rolls back to `designing`
- `ArtifactStatus` is never persisted — always derived from cleaned hash vs `validatedHash`
- `Artifact.markComplete(hash)` may only be called from `ValidateSpec`
- `archivable` is the only state from which a change may be archived; attempting to archive from any other state throws `InvalidStateTransitionError`
- Both approval gates default to `false` — teams opt in via `approvals` in `specd.yaml`
- When `approvals.spec: true`, spec approval is required before `implementing`
- When `approvals.signoff: true`, sign-off is always required before `archivable`, regardless of change content
- Approval records are never modified; invalidated records are retained as history marked superseded
- Discarding a change requires a `DiscardRecord` with mandatory `reason` and `discardedBy`; it is irreversible

## Spec Dependencies

- [`specs/_global/config/spec.md`](../../_global/config/spec.md) — workspace IDs, active workspace semantics, approval gates config, storage locations
- [`specs/_global/schema-format/spec.md`](../../_global/schema-format/spec.md) — artifact type declarations, dependency graph, `preHashCleanup`
- [`specs/core/storage/spec.md`](../storage/spec.md) — manifest format and persistence
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — delta operations
