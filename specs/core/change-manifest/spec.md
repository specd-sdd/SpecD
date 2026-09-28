# Change Manifest

## Purpose

The Change entity's state must survive process restarts and be recoverable from disk alone, so there needs to be a single, well-defined file that captures everything. The change manifest (`manifest.json`) is that file — it persists identity, specs, artifacts, and the complete event history from which lifecycle state is derived. It lives inside the change's directory and is written and read exclusively by `FsChangeRepository`.

## Requirements

### Requirement: Manifest structure

Each new active change SHALL be persisted as `manifest.json` with top-level `manifestVersion: 2`. This version is independent of `schema.name` and `schema.version`.

Version 2 retains the existing identity, timestamps, schema identity, `specIds`, optional `specDependsOn`, artifact/file state, implementation tracking and links, and append-only `history`. It replaces `invalidationPolicy` with:

```jsonc
"invalidation": { "artifacts": "downstream", "workflow": "preserve" }
```

It additionally persists optional current `specApproval`, `signoff`, and `verification` projections. Approval records SHALL contain `status` (`valid`, `stale`, or `revoked`), actor, reason, decision time, and optional invalidation metadata. A spec-approval fingerprint SHALL contain the exact sorted, deduplicated canonical `specIds` approved together with the artifact fingerprint. Sign-off and verification SHALL persist their artifact fingerprint and the implementation fingerprint when known. Each fingerprint SHALL record its algorithm identifiers and a deterministically ordered map of canonical input keys or project-relative implementation paths to hashes.

A verification record SHALL distinguish the attempt baseline from completed evidence and record completion actor/time when valid or stale. For native v2 changes, absence means never completed or never approved. Missing or `null` implementation fingerprints are permitted only as adapted legacy unknown evidence; an observed empty map is a valid current snapshot.

Artifact files retain explicit state, `validatedHash`, and `hasDrift`. `history` remains append-only and lifecycle state remains derived from transition events. Projection updates MUST NOT remove, rewrite, or reorder prior events.

### Requirement: Manifest format compatibility

A missing `manifestVersion` SHALL be interpreted as v1. The loader SHALL validate the v1 shape, preserve its complete history, and adapt it in memory to the v2 domain projection. Legacy `invalidationPolicy` maps to `{ artifacts: <legacy value>, workflow: redesign }`; a missing legacy value maps to `{ artifacts: downstream, workflow: redesign }`.

Legacy approval and verification events SHALL produce the best historical projection available without inventing fingerprints or approved scope from current files. A v1 approval, or a transitional v2 approval record without its canonical `specIds` snapshot, has unknown scope freshness and cannot authorize a required spec gate until renewed. Legacy sign-off or verification without implementation evidence is unknown freshness and cannot authorize active forward progress or archive where current evidence is required.

Plain reads and archived inspection MUST NOT rewrite a v1 manifest. Its next actual mutation, including status reconciliation that detects invalidity, MAY write v2. A `manifestVersion` newer than the maximum supported version SHALL fail with a typed unsupported-manifest-version error before hydration.

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

### Requirement: Fingerprint serialization

Spec-approval scope entries SHALL be canonical, deduplicated, and serialized in deterministic lexical order. Artifact fingerprint keys SHALL remain stable and include artifact type plus file key. Implementation entries SHALL use normalized project-relative paths, be deduplicated, and serialize in deterministic lexical order. Equality includes the complete key set as well as each hash. Spec-approval equality additionally includes the complete canonical spec set; additions and removals SHALL remain distinguishable as `spec-added` and `spec-removed`, while reordering alone is equal.

Text entries SHALL identify `text-v1`; binary entries SHALL identify the byte-hash algorithm. Invalidity records SHALL retain the original approved or verified baseline and record the mismatch cause. Restoring matching bytes MUST NOT silently change a persisted `stale` or `revoked` projection back to `valid`.

### Requirement: Verification attempt event serialization

`verification-attempt-started` SHALL serialize actor, timestamp, current lifecycle state, attempt identity, and fingerprint algorithm identifiers for explicit verification start from any active state. Superseding an attempt preserves its baseline and identity in audit evidence. Successful completion records actor, time, attempt identity, and the verified fingerprint independently of lifecycle transitions. `verification-invalidated` SHALL serialize actor, timestamp, mandatory reason, and completed verification identity while leaving its persisted fingerprint untouched. Events MUST NOT serialize source contents.

Capturing the current attempt projection never removes earlier attempt, completion, invalidation, or approval events from `history`. No attempt event or manifest shape may represent `verifying → verifying`.

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
