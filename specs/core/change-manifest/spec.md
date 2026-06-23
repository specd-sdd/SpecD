# Change Manifest

## Purpose

The Change entity's state must survive process restarts and be recoverable from disk alone, so there needs to be a single, well-defined file that captures everything. The change manifest (`manifest.json`) is that file — it persists identity, specs, artifacts, and the complete event history from which lifecycle state is derived. It lives inside the change's directory and is written and read exclusively by `FsChangeRepository`.

## Requirements

### Requirement: Manifest structure

Each change is persisted as a manifest.json file inside its change directory. It contains:

```jsonc
{
  "name": "add-oauth-login",
  "createdAt": "2026-05-15T10:00:00.000Z",
  "schema": { "name": "schema-std", "version": 1 },
  "specIds": ["core:change"],
  "invalidationPolicy": "downstream",
  "trackedImplementationFiles": [
    { "file": "packages/core/src/domain/entities/change.ts", "state": "open" },
    { "file": "packages/core/src/domain/entities/removed-file.ts", "state": "removed" },
  ],
  "implementationLinks": [
    {
      "specId": "core:change",
      "file": "packages/core/src/domain/entities/change.ts",
      "fileLinkExplicit": true,
      "symbols": ["Change.transition"],
    },
  ],
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
          "validatedHash": "sha256:...",
          "hasDrift": false,
        },
      ],
    },
  ],
  "history": [],
}
```

Field definitions:

- `name` — the change slug; immutable after creation
- `createdAt` — ISO 8601 timestamp; immutable after creation; source of truth for the directory prefix
- `schema` — name (string) and version (integer) of the schema active at creation; written once, never updated
- `workspaces` — optional; accepted on load for backward compatibility with older manifests but no longer written on save. Active workspaces are derived at runtime from specIds via parseSpecId()
- `specIds` — current snapshot of spec IDs; mutable
- `invalidationPolicy` — the change's persisted invalidation policy (`none`, `surgical`, `downstream`, `global`)
- `trackedImplementationFiles` — optional array of tracked implementation file entries; each entry requires `file` and `state`, where `file` is a raw project-relative path and `state` is one of `open`, `resolved`, `ignored`, or `removed`
- `implementationLinks` — optional array of confirmed implementation links; each entry requires `specId`, `file`, and `fileLinkExplicit`, and may include `symbols`
- `fileLinkExplicit: false` is valid only when `symbols` is present and non-empty, because that shape means the file-level presence exists only as the container for symbol-level links
- `specDependsOn` (optional) — a record keyed by spec ID, each value being an array of spec ID strings representing that spec's current in-change declared dependencies. For existing persisted specs, the entry MUST be seeded when the spec first enters the change scope from spec-lock.json, then legacy metadata.json.dependsOn, then an empty set when neither exists. These entries are archive-time inputs to sidecar and metadata generation, not the long-term archived record.
- `artifacts` — array of artifact descriptors. Each artifact has type, optional, requires, state, and a files array of ManifestArtifactFile entries. Each file entry has key, filename, state, validatedHash, and hasDrift.
- state on both artifacts and files uses the ArtifactStatus domain values (missing, in-progress, complete, skipped, pending-review, drifted-pending-review). File state is the source of truth; artifact state is the persisted aggregate.
- validatedHash remains persisted as the last successfully validated baseline only. It is null when not validated, a SHA-256 string when validated, or "**skipped**" when explicitly skipped. It MUST NOT be interpreted as proof that the file still exists or is still complete on disk.
- hasDrift is persisted per file and indicates whether the file's current state differs from the validated baseline
- `history` — append-only array of typed events. The event types, their semantics, and the derivation rules (current state, active approval, draft status) are defined in [specs/core/change/spec.md — Requirement: History and event sourcing](../change/spec.md). This section defines only the JSON serialization of those events. The current lifecycle state is derived from the most recent transitioned event's to field. Each event contains common fields: type, at, and by. The by field is an ActorIdentity object (defined in core:change) which includes name, email, and optional provider, providerId, and metadata.

The JSON serialization of each event type is unchanged.

### Requirement: Archive outcome history events

The active change manifest history MUST preserve explicit failed-archive traceability.

The `archive-failed` event is appended when an archive attempt fails after archive execution begins but before a successful archive commit is completed.

`archive-failed` MUST include:

- `step` — the archive phase in which the failure occurred
- `message` — a human-readable diagnostic summary
- `commitStarted` — whether staged archive commit had already begun

Successful archive completion MUST remain traceable through the archived manifest metadata (`archivedAt`, `archivedBy`, and archive location data) rather than by appending a new active-change history event after the change has ceased to be an active change.

A failed pre-commit archive attempt MUST NOT by itself imply that archive completed or that permanent specs were partially accepted.

### Requirement: Artifact filenames use expected paths

Every `ManifestArtifactFile.filename` MUST be the expected change-directory path for that artifact, as defined by `core:change-layout`.

When a change is created or its spec scope changes, persisted spec-scoped artifact filenames MUST be resolved using the target spec's existence and the schema artifact's delta capability before the manifest is written. Existing specs with delta-capable artifacts MUST be persisted as `deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml`; new specs MUST be persisted as `specs/<workspace>/<capability-path>/<artifact-filename>`.

The manifest MUST NOT initially persist a `specs/...` filename for an existing delta-capable spec and rely on a later read, validation, or delta creation pass to repair it. The manifest is a user- and agent-visible contract from creation time.

When loading older manifests that contain a stale `specs/...` filename for an existing delta-capable spec, the repository MAY normalize the filename to the expected `deltas/...` path while preserving the file state and validation hash semantics.

### Requirement: Filename normalization preserves tracked intent

Manifest filename normalization MUST preserve the tracked artifact representation already validated for the change.

Loading or syncing a manifest MUST NOT reinterpret a tracked direct `specs/...` filename as a delta-backed `deltas/...` filename merely because the repository now contains a partially materialized spec directory or some other partial side effect from a failed archive attempt.

Any normalization that changes the representation class of a tracked artifact file MUST be rejected unless it is explicitly proven to preserve the same artifact semantics for that exact artifact file.

### Requirement: Schema version

`schema.name` is the value of the `schema` field from `specd.yaml` at creation time. `schema.version` is the `version` integer from the schema's `schema.yaml`. Both are written once at change creation and never updated.

When a change is loaded and the active schema's version differs from what is recorded in the manifest, specd MUST emit a warning. The change remains usable — the version mismatch warning is advisory, not a hard error. Archiving a change with a schema version mismatch MUST still be possible; the warning surfaces the mismatch so the user can decide whether to proceed.

When a change is loaded and the active schema's name differs from what is recorded in the manifest, the repository MUST reject the load with `SchemaMismatchError`. A schema-name mismatch indicates that the change was created against a different schema family rather than a later compatible revision of the same schema.

The manifest's schema fields remain persisted facts only; enforcement behavior is defined by the change and repository contracts that consume them.

### Requirement: Atomic writes

The manifest must be written atomically — by writing to a temporary file and then renaming it into place — to prevent partial reads if the process is interrupted mid-write.

## Constraints

- Artifact and file state are stored explicitly in the manifest; callers must not reconstruct steady-state status solely from validatedHash
- File presence and canonical file state MUST be checked before any interpretation of validatedHash
- validatedHash has three valid values: null (not yet validated), a SHA-256 string (validated), or "**skipped**" (optional artifact explicitly not produced)
- hasDrift is persisted per file and records whether the current file state differs from the validated baseline
- If an older manifest is encountered without a state field on an artifact or file, loading defaults that missing state to missing
- If an older manifest is encountered with an invalidated event whose cause is "artifact-change", loading must accept it and normalize it to the current artifact-drift semantics
- The manifest has no top-level state field; the current lifecycle state is always derived from the history array at load time
- The history array is append-only — existing events must never be modified or removed by any operation
- The schema field is written once at creation and must never be updated by subsequent operations

## Spec Dependencies

- [core:change](../change/spec.md) — change event model and lifecycle derivation
- [core:change-layout](../change-layout/spec.md) — expected artifact paths
- [core:storage](../storage/spec.md) — repository writes
- [core:spec-metadata](../spec-metadata/spec.md) — metadata files
- [core:spec-id-format](../spec-id-format/spec.md) — identifiers
- [core:workspace](../workspace/spec.md) — workspace semantics
