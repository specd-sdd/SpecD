# Change Manifest

## Overview

The change manifest (`manifest.json`) is the single source of truth for a change. It lives inside the change's directory and persists the full state of the Change domain entity — identity, workspaces, specs, artifacts, and the complete event history from which lifecycle state is derived. It is written and read exclusively by `FsChangeRepository`.

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
  "workspaces": ["default"],
  "specIds": ["auth/login", "auth/register"],
  "contextSpecIds": ["_global/config", "_global/schema-format"],
  "artifacts": [
    {
      "type": "proposal",
      "filename": "proposal.md",
      "optional": false,
      "requires": [],
      "validatedHash": "sha256:abc123...",
    },
    {
      "type": "specs",
      "filename": "specs.md",
      "optional": false,
      "requires": ["proposal"],
      "validatedHash": null,
    },
    {
      "type": "design",
      "filename": "design.md",
      "optional": true,
      "requires": ["proposal"],
      "validatedHash": "__skipped__", // optional artifact explicitly not produced
    },
  ],
  "history": [
    {
      "type": "created",
      "at": "2024-03-15T10:00:00.000Z",
      "by": { "name": "Alice", "email": "alice@example.com" },
      "workspaces": ["default"],
      "specIds": ["auth/login", "auth/register"],
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
- **`workspaces`** — current snapshot of active workspace IDs; mutable
- **`specIds`** — current snapshot of spec paths; mutable
- **`contextSpecIds`** — current snapshot of context dependency spec paths; populated at `ready` state from each spec's `.specd-metadata.yaml` `dependsOn` field (direct deps only); mutable; does not trigger approval invalidation when modified
- **`artifacts`** — array of artifact descriptors; `validatedHash` is `null` when the artifact has not been validated, a SHA-256 string when validated, or `"__skipped__"` when an optional artifact has been explicitly marked as not produced. `ArtifactStatus` is never stored — it is derived at load time from `validatedHash` and file presence
- **`history`** — append-only array of typed events. The event types, their semantics, and the derivation rules (current state, active approval, draft status) are defined in [`specs/core/change/spec.md` — Requirement: History and event sourcing](../change/spec.md). This section defines only the JSON serialization of those events. The current lifecycle state is derived from the most recent `transitioned` event's `to` field.

The JSON serialization of each event type is:

```jsonc
// state transition
{ "type": "transitioned", "at": "...", "by": { "name": "...", "email": "..." }, "from": "drafting", "to": "designing" }

// spec gate approved
{ "type": "spec-approved", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "LGTM", "artifactHashes": { "proposal": "sha256:...", "specs": "sha256:..." } }

// signoff gate passed
{ "type": "signed-off", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "Ship it", "artifactHashes": { "proposal": "sha256:...", "specs": "sha256:..." } }

// approval invalidated (prior spec-approved/signed-off events are superseded)
{ "type": "invalidated", "at": "...", "by": { "name": "...", "email": "..." }, "cause": "workspace-change" }
// cause values: "workspace-change" | "spec-change" | "artifact-change"

// shelved to drafts/
{ "type": "drafted", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "parking for now" }

// restored from drafts/
{ "type": "restored", "at": "...", "by": { "name": "...", "email": "..." } }

// optional artifact explicitly marked as not produced
{ "type": "artifact-skipped", "at": "...", "by": { "name": "...", "email": "..." }, "artifactId": "design", "reason": "not needed for this change" }

// permanently abandoned
{ "type": "discarded", "at": "...", "by": { "name": "...", "email": "..." }, "reason": "superseded", "supersededBy": ["new-auth-flow"] }
```

### Requirement: Schema version

`schema.name` is the value of the `schema` field from `specd.yaml` at creation time. `schema.version` is the `version` integer from the schema's `schema.yaml`. Both are written once at change creation and never updated.

When a change is loaded and the active schema's name or version differs from what is recorded in the manifest, specd must emit a warning. The change remains usable — the warning is advisory, not a hard error. Archiving a change with a schema version mismatch must still be possible; the warning surfaces the mismatch so the user can decide whether to proceed.

### Requirement: Atomic writes

The manifest must be written atomically — by writing to a temporary file and then renaming it into place — to prevent partial reads if the process is interrupted mid-write.

## Constraints

- `ArtifactStatus` is never stored in the manifest — it is always derived from `validatedHash` and file presence at load time
- `validatedHash` has three valid values: `null` (not yet validated), a SHA-256 string (validated), or `"__skipped__"` (optional artifact explicitly not produced)
- The manifest has no `state` field; the current lifecycle state is always derived from the `history` array at load time
- The `history` array is append-only — existing events must never be modified or removed by any operation
- The `schema` field is written once at creation and must never be updated by subsequent operations
- `contextSpecIds` modifications do not append an `invalidated` event and do not trigger approval invalidation

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change domain model; defines event types, lifecycle states, and derivation rules serialized in the manifest
- [`specs/core/storage/spec.md`](../storage/spec.md) — `FsChangeRepository` reads and writes the manifest; atomic write constraint
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, source of `contextSpecIds`
