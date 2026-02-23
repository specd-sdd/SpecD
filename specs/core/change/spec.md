# Change

## Overview

A Change is the central domain entity in specd. It represents a discrete, named unit of in-progress spec work — a coherent set of modifications across one or more workspaces that moves from initial drafting through implementation and into the archive. Every specd operation targets a Change. The Change enforces its own lifecycle and invariants; no external code may bypass them.

## Requirements

### Requirement: Identity

A Change has a unique, user-defined slug name (e.g. `add-auth-flow`). The name is set at creation and never changes. It is the primary handle used in all CLI commands and port interfaces. The underlying storage layer may prefix the name with a timestamp for ordering purposes, but that prefix is an infrastructure concern — it does not appear in the domain model.

### Requirement: Workspaces

A Change declares one or more workspace IDs it belongs to. Workspace IDs reference the keys declared in `specd.yaml` (e.g. `default`, `billing`). This list:

- must contain at least one workspace ID
- is set at creation time and is immutable thereafter
- determines which workspaces are considered active when `CompileContext` builds the context spec set for this change (see config spec — Context spec selection)

The declared workspace IDs are stored in the change manifest and read back verbatim. `CompileContext` does not infer workspaces from spec paths at compile time — it reads the list from the change.

Workspace IDs in the list must be validated against `specd.yaml` at creation time. Referencing an undeclared workspace ID is an error.

### Requirement: Lifecycle

A Change progresses through the following states:

```
drafting → designing → ready → implementing → done ──────────────────→ archivable
                                                   └→ pending-approval → approved ┘
```

| State              | Meaning                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `drafting`         | Initial state; the change has been created but no design work has started                   |
| `designing`        | The agent is elaborating the spec content                                                   |
| `ready`            | The spec is signed off; implementation may begin                                            |
| `implementing`     | Code is being written against the spec                                                      |
| `done`             | Implementation is complete                                                                  |
| `pending-approval` | The change contains structural modifications (MODIFIED/REMOVED) that require human sign-off |
| `approved`         | A human has reviewed and approved the structural changes                                    |
| `archivable`       | Terminal state; the change may be moved to the archive                                      |

Only the transitions shown above are valid. Any attempt to transition to a state not reachable from the current state throws `InvalidStateTransitionError`. `archivable` is terminal — no further transitions are possible.

### Requirement: Transition to archivable

From `done`, the change transitions to:

- `archivable` directly — when the change contains no structural modifications (no MODIFIED or REMOVED delta operations)
- `pending-approval` — when at least one structural modification is present

A change in `pending-approval` must be approved by a human before it can transition to `approved` and then to `archivable`. Attempting to archive a change that is not in `archivable` state throws `ApprovalRequiredError`.

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

ADDED operations are not structural — they do not require approval.

The structural change list is built by the delta merger as specs are modified. It is stored in the manifest and read back at load time. The presence of any structural change is what triggers the `pending-approval` branch when transitioning from `done`.

### Requirement: Approval

Approval is recorded as a single `ApprovalRecord` on the Change:

- **`reason`** — human-provided rationale
- **`approvedBy`** — git identity (name + email) of the approver
- **`approvedAt`** — timestamp of approval
- **`structuralChanges`** — the list of structural changes that were reviewed

An approval record is written once and never modified. After approval the change transitions to `approved` and then immediately to `archivable`.

### Requirement: Schema version

The change manifest records the name and version of the schema that was active when the change was created. This allows specd to detect schema drift. If the active schema's name or version differs from the recorded values when the change is loaded, a warning is emitted. The change remains fully usable — the warning is advisory. Archiving with a schema version mismatch is allowed.

## Constraints

- A Change must have at least one workspace ID
- Workspace IDs are validated against `specd.yaml` at creation time and immutable thereafter
- `ArtifactStatus` is never persisted — always derived at load time
- `Artifact.markComplete(hash)` may only be called from `ValidateSpec`
- `archivable` is the only state from which a change may be archived
- Structural changes (MODIFIED/REMOVED) require approval before the change becomes `archivable`
- The approval record is written once and never updated
- The schema name and version recorded at creation are never updated by subsequent operations

## Spec Dependencies

- [`specs/_global/config/spec.md`](../../_global/config/spec.md) — workspace IDs and active workspace semantics
- [`specs/_global/schema-format/spec.md`](../../_global/schema-format/spec.md) — artifact type declarations and dependency graph
- [`specs/core/storage/spec.md`](../storage/spec.md) — manifest format and persistence
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — structural change detection
