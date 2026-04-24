# Change Manifest

## Purpose

The Change entity's state must survive process restarts and be recoverable from disk alone, so there needs to be a single, well-defined file that captures everything. The change manifest (`manifest.json`) is that file — it persists identity, specs, artifacts, and the complete event history from which lifecycle state is derived. It lives inside the change's directory and is written and read exclusively by `FsChangeRepository`.

## Requirements

### Requirement: Manifest structure

Each change is persisted as a `manifest.json` file inside its change directory. Its top-level structure is:

```jsonc
// manifest.json
{
  "name": "add-auth-flow",
  "createdAt": "2024-03-15T10:00:00.000Z",
  "schema": {
    "name": "@specd/schema-std",
    "version": 2,
  },
  "specIds": ["default:auth/login", "default:auth/register"],
  "artifacts": [
    {
      "type": "proposal",
      "optional": false,
      "requires": [],
      "state": "complete",
      "files": [
        {
          "key": "proposal",
          "filename": "proposal.md",
          "state": "complete",
          "validatedHash": "sha256:abc123...",
        },
      ],
    },
    {
      "type": "specs",
      "optional": false,
      "requires": ["proposal"],
      "state": "drifted-pending-review",
      "files": [
        {
          "key": "default:auth/login",
          "filename": "specs/default/auth/login/spec.md",
          "state": "complete",
          "validatedHash": "sha256:def456...",
        },
        {
          "key": "default:auth/register",
          "filename": "specs/default/auth/register/spec.md",
          "state": "drifted-pending-review",
          "validatedHash": "sha256:ghi789...",
        },
      ],
    },
    {
      "type": "design",
      "optional": true,
      "requires": ["proposal"],
      "state": "skipped",
      "files": [
        {
          "key": "design",
          "filename": "design.md",
          "state": "skipped",
          "validatedHash": "__skipped__",
        },
      ],
    },
  ],
  "history": [
    {
      "type": "created",
      "at": "2024-03-15T10:00:00.000Z",
      "by": { "name": "Alice", "email": "alice@example.com" },
      "specIds": ["default:auth/login", "default:auth/register"],
      "schemaName": "@specd/schema-std",
      "schemaVersion": 2,
    },
    {
      "type": "transitioned",
      "at": "2024-03-15T10:01:00.000Z",
      "by": { "name": "Alice", "email": "alice@example.com" },
      "from": "drafting",
      "to": "designing",
    },
  ],
}
```

Field definitions:

- **`name`** — the change slug; immutable after creation
- **`createdAt`** — ISO 8601 timestamp; immutable after creation; source of truth for the directory prefix
- **`schema`** — `name` (string) and `version` (integer) of the schema active at creation; written once, never updated
- **`workspaces`** — optional; accepted on load for backward compatibility with older manifests but no longer written on save. Active workspaces are derived at runtime from `specIds` via `parseSpecId()`
- **`specIds`** — current snapshot of spec IDs; mutable
- **`specDependsOn`** (optional) — a record keyed by spec ID, each value being an array of spec ID strings representing that spec's declared dependencies. Captured at authoring time to ensure dependencies are tracked even before metadata is generated. Omitted from the manifest when empty.
- **`artifacts`** — array of artifact descriptors. Each artifact has `type`, `optional`, `requires`, `state`, and a `files` array of `ManifestArtifactFile` entries. Each file entry has `key`, `filename`, `state`, and `validatedHash`.
- **`state`** on both artifacts and files uses the `ArtifactStatus` domain values (`missing`, `in-progress`, `complete`, `skipped`, `pending-review`, `drifted-pending-review`). File state is the source of truth; artifact state is the persisted aggregate.
- **`validatedHash`** remains persisted for drift detection and approval signatures. It is `null` when not validated, a SHA-256 string when validated, or `"__skipped__"` when explicitly skipped.
- **`history`** — append-only array of typed events. The event types, their semantics, and the derivation rules (current state, active approval, draft status) are defined in [`specs/core/change/spec.md` — Requirement: History and event sourcing](../change/spec.md). This section defines only the JSON serialization of those events. The current lifecycle state is derived from the most recent `transitioned` event's `to` field.

The JSON serialization of each event type is:

```jsonc
// state transition
{ "type": "transitioned", "at": "...", "by": { "name": "...", "email": "..." }, "from": "drafting", "to": "designing" }

// spec gate approved
{ "type": "spec-approved", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "LGTM", "artifactHashes": { "proposal:proposal": "sha256:...", "specs:default:auth/login": "sha256:..." } }

// signoff gate passed
{ "type": "signed-off", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "Ship it", "artifactHashes": { "proposal:proposal": "sha256:...", "specs:default:auth/login": "sha256:..." } }

// approval invalidated
{
  "type": "invalidated",
  "at": "...",
  "by": { "name": "...", "email": "..." },
  "cause": "artifact-drift",
  "message": "Invalidated because validated artifacts drifted",
  "affectedArtifacts": [
    { "type": "specs", "files": ["default:auth/login", "default:auth/register"] }
  ]
}

// shelved to drafts/
{ "type": "drafted", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "parking for now" }

// restored from drafts/
{ "type": "restored", "at": "...", "by": { "name": "...", "email": "..." } }

// optional artifact explicitly marked as not produced
{ "type": "artifact-skipped", "at": "...", "by": { "name": "...", "email": "..." }, "artifactId": "design", "reason": "not needed for this change" }

// artifact sync reconciled the artifact map against the schema
{ "type": "artifacts-synced", "at": "...", "by": { "name": "specd", "email": "system@getspecd.dev" }, "typesAdded": ["tasks"], "typesRemoved": [], "filesAdded": [{ "type": "specs", "key": "default:auth/register" }], "filesRemoved": [] }

// permanently abandoned
{ "type": "discarded", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "superseded", "supersededBy": ["new-auth-flow"] }
```

On read, the manifest loader MUST also accept legacy historical invalidation events that persisted `"cause": "artifact-change"`. That legacy value is a backward-compatible alias for `"artifact-drift"` and MUST be normalized to the current domain cause during deserialization instead of being treated as corruption.

### Requirement: Artifact filenames use expected paths

Every `ManifestArtifactFile.filename` MUST be the expected change-directory path for that artifact, as defined by `core:core/change-layout`.

When a change is created or its spec scope changes, persisted spec-scoped artifact filenames MUST be resolved using the target spec's existence and the schema artifact's delta capability before the manifest is written. Existing specs with delta-capable artifacts MUST be persisted as `deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml`; new specs MUST be persisted as `specs/<workspace>/<capability-path>/<artifact-filename>`.

The manifest MUST NOT initially persist a `specs/...` filename for an existing delta-capable spec and rely on a later read, validation, or delta creation pass to repair it. The manifest is a user- and agent-visible contract from creation time.

When loading older manifests that contain a stale `specs/...` filename for an existing delta-capable spec, the repository MAY normalize the filename to the expected `deltas/...` path while preserving the file state and validation hash semantics.

### Requirement: Schema version

`schema.name` is the value of the `schema` field from `specd.yaml` at creation time. `schema.version` is the `version` integer from the schema's `schema.yaml`. Both are written once at change creation and never updated.

When a change is loaded and the active schema's name or version differs from what is recorded in the manifest, specd must emit a warning. The change remains usable — the warning is advisory, not a hard error. Archiving a change with a schema version mismatch must still be possible; the warning surfaces the mismatch so the user can decide whether to proceed.

### Requirement: Atomic writes

The manifest must be written atomically — by writing to a temporary file and then renaming it into place — to prevent partial reads if the process is interrupted mid-write.

## Constraints

- Artifact and file `state` are stored explicitly in the manifest; callers must not reconstruct steady-state status solely from `validatedHash`
- `validatedHash` has three valid values: `null` (not yet validated), a SHA-256 string (validated), or `"__skipped__"` (optional artifact explicitly not produced)
- If an older manifest is encountered without a `state` field on an artifact or file, loading defaults that missing state to `missing`
- If an older manifest is encountered with an `invalidated` event whose `cause` is `"artifact-change"`, loading must accept it and normalize it to the current artifact-drift semantics
- The manifest has no top-level `state` field; the current lifecycle state is always derived from the `history` array at load time
- The `history` array is append-only — existing events must never be modified or removed by any operation
- The `schema` field is written once at creation and must never be updated by subsequent operations

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — change event model and lifecycle derivation
- [`core:core/change-layout`](../change-layout/spec.md) — expected artifact paths for new spec files and delta files
- [`core:core/storage`](../storage/spec.md) — repository writes and atomic manifest handling
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — metadata files referenced by the manifest model
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` identifiers
- [`core:core/workspace`](../workspace/spec.md) — workspace semantics referenced by persisted spec IDs
