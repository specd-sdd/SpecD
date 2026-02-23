# Change

## Overview

A Change is the central domain entity in specd. It represents a discrete, named unit of in-progress spec work — a coherent set of modifications across one or more workspaces that moves from initial drafting through implementation and into the archive. Every specd operation targets a Change. The Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`) and a `createdAt` timestamp recorded at creation time. Both are immutable. The name is the primary handle used in all CLI commands and port interfaces. The `createdAt` timestamp is the source of truth for ordering — the storage layer derives its directory name prefix from it (see storage spec), but that prefix is an infrastructure concern and does not appear in the domain model.

### Requirement: Workspaces

A Change declares one or more workspace IDs it belongs to. Workspace IDs reference the keys declared in `specd.yaml` (e.g. `default`, `billing`). This list:

- must contain at least one workspace ID
- is set at creation time and is immutable thereafter
- determines which workspaces are considered active when `CompileContext` builds the context spec set for this change (see config spec — Context spec selection)

The declared workspace IDs are stored in the change manifest and read back verbatim. `CompileContext` does not infer workspaces from spec paths at compile time — it reads the list from the change.

Workspace IDs in the list must be validated against `specd.yaml` at creation time. Referencing an undeclared workspace ID is an error.

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

When `approvals.spec: true`, the transition from `ready` to `implementing` is blocked. The change must first transition to `pending-spec-approval`, receive an explicit `ApprovalRecord` (approver identity, reason, timestamp), and then transition to `spec-approved` before `implementing` becomes reachable.

When `approvals.spec: false` (default), `ready → implementing` is a free transition. The `pending-spec-approval` and `spec-approved` states are unreachable.

### Requirement: Signoff gate

When `approvals.signoff: true`, the transition from `done` to `archivable` is always blocked — regardless of whether the change contains only new specs, modifications, or removals. The change must transition to `pending-signoff`, receive an explicit sign-off record (approver identity, reason, timestamp), and transition through `signed-off → archivable`.

When `approvals.signoff: false` (default), `done → archivable` is a free transition. Attempting to archive a change that is not in `archivable` state throws `SignoffRequiredError`.

### Requirement: Artifacts

A Change holds a set of artifacts — typed files whose types and dependency graph are declared by the active schema. Each artifact has:

- **`type`** — the artifact type ID from the schema (e.g. `proposal`, `specs`, `design`)
- **`filename`** — the file path within the change directory
- **`optional`** — whether the artifact is required for archiving
- **`requires`** — ordered list of artifact type IDs that must be complete before this artifact can be validated
- **`status`** — derived at load time: `missing` | `in-progress` | `complete`
- **`validatedHash`** — the SHA-256 hash recorded when the artifact was last validated

`ArtifactStatus` is never stored directly — it is computed on load by comparing the current file hash against `validatedHash`. An artifact whose hash matches `validatedHash` is `complete`; otherwise it is `missing` (file absent) or `in-progress` (file present but hash differs or unvalidated).

Effective status cascades: an artifact is `in-progress` if any artifact in its `requires` chain is not `complete`, even if its own hash matches. This prevents marking later artifacts as complete while earlier dependencies are stale.

`Artifact.markComplete(hash)` may only be called by the `ValidateSpec` use case. No other code path may set an artifact to `complete`.

### Requirement: Structural changes

A Change tracks structural modifications — individual requirement blocks that are MODIFIED or REMOVED across the specs it touches. Each structural change records:

- **`spec`** — the spec path
- **`type`** — `MODIFIED` or `REMOVED`
- **`requirement`** — the name of the affected requirement block

ADDED operations are not structural. The structural change list is informational — it is included in the sign-off record so the reviewer knows what is being signed off, but it does not gate the signoff flow. When `approvals.signoff: true`, sign-off is always required regardless of whether changes are additions, modifications, or removals.

The structural change list is built by the delta merger as specs are modified. It is stored in the manifest and read back at load time.

### Requirement: Approval records

Each approval gate produces its own record, stored independently on the Change. Both records share the same structure:

- **`reason`** — human-provided rationale
- **`approvedBy`** — git identity (name + email) of the approver
- **`approvedAt`** — timestamp of approval
- **`structuralChanges`** — the list of structural changes present at the time of sign-off (only on the sign-off record; absent on the spec approval record)

A Change may carry zero, one, or two records — one per gate, only if that gate was enabled and triggered. Each record is written once and never modified.

### Requirement: Schema version

The change manifest records the name and version of the schema that was active when the change was created. This allows specd to detect schema drift. If the active schema's name or version differs from the recorded values when the change is loaded, a warning is emitted. The change remains fully usable — the warning is advisory. Archiving with a schema version mismatch is allowed.

## Constraints

- `name` and `createdAt` are set at creation and never changed
- A Change must have at least one workspace ID
- Workspace IDs are validated against `specd.yaml` at creation time and immutable thereafter
- `ArtifactStatus` is never persisted — always derived at load time
- `Artifact.markComplete(hash)` may only be called from `ValidateSpec`
- `archivable` is the only state from which a change may be archived
- Both approval gates default to `false` — teams opt in via `approvals` in `specd.yaml`
- When `approvals.spec: true`, spec approval is required before `implementing`
- When `approvals.signoff: true`, sign-off is always required before `archivable`, regardless of change content
- Each approval record is written once and never updated; a change carries at most two records (one per gate)
- The schema name and version recorded at creation are never updated by subsequent operations

## Spec Dependencies

- [`specs/_global/config/spec.md`](../../_global/config/spec.md) — workspace IDs and active workspace semantics
- [`specs/_global/schema-format/spec.md`](../../_global/schema-format/spec.md) — artifact type declarations and dependency graph
- [`specs/core/storage/spec.md`](../storage/spec.md) — manifest format and persistence
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — structural change detection
