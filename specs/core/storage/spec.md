# Storage

## Overview

specd's storage layer is defined by port interfaces in `@specd/core`. All storage behavior is adapter-specific; the domain and application layers have no knowledge of where data lives. The v1 implementation ships one adapter for all storage ports: `fs` (local filesystem).

## Requirements

### Requirement: Change directory naming

Active change directories must use the format `YYYYMMDD-HHmmss-<name>`, where the timestamp is the moment the change was created. The prefix must be a filesystem convention only — it must not appear in the domain model, the change manifest, or any CLI argument. `FsChangeRepository` must resolve a change by name using a glob pattern `*-<name>`.

### Requirement: Change directory listing order

`ChangeRepository.list()` must return changes in creation order (oldest first). With the `fs` adapter, this is achieved by sorting directory entries by name, which is chronological given the timestamp prefix.

### Requirement: Artifact status derivation

Artifact status (`missing`, `in-progress`, `complete`) must be derived at load time — it must not be stored directly in the manifest. The manifest stores only `validatedHash` per artifact. `FsChangeRepository` must compute status by comparing the current SHA-256 hash of each artifact file against the stored `validatedHash`.

### Requirement: Artifact dependency cascade

`Change.effectiveStatus(type)` must cascade through the artifact dependency graph. An artifact whose own hash matches its `validatedHash` must still be reported as `in-progress` if any artifact in its `requires` chain is not `complete`.

### Requirement: ValidateSpec is the sole path to `complete`

`Artifact.markComplete(hash)` must only be called by the `ValidateSpec` use case. No other use case, adapter, or external code path may mark an artifact as complete.

### Requirement: Archive pattern configuration

The `fs` archive adapter must support a configurable `pattern` field in `specd.yaml` under `storage.archive.pattern`. The pattern controls the directory structure within the archive root. Supported variables: `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`. The default pattern must be `{{change.archivedName}}`.

### Requirement: Scope excluded from archive pattern

`{{change.scope}}` must not be a supported archive pattern variable. Scope paths use `/` as a segment separator, which produces ambiguous slugs when normalized for use in directory names.

### Requirement: Archive index

`FsArchiveRepository` must maintain an `index.jsonl` at the archive root. Each line must be a JSON object with `name` and `path` fields. The file must be kept in chronological order (oldest first, newest last) so that git diffs only show lines added at the bottom or lines removed — never reorderings. `archive(change)` must append one line at the end (O(1)). `get(name)` must scan the file from the end without loading it fully into memory; if not found, it must fall back to a recursive glob `**/*-<name>` and append the recovered entry. `reindex()` must be declared on the `ArchiveRepository` port. The `fs` adapter implements it by globbing all `manifest.json` files under the archive root, sorting entries by `archivedAt`, and writing a clean `index.jsonl` in chronological order. Other adapters implement it according to their storage mechanism. `specd storage reindex` calls the port method — it has no knowledge of the underlying implementation.

### Requirement: Archive pattern date variables are zero-padded

`{{month}}` and `{{day}}` must be zero-padded to two digits. `{{year}}` is four digits. This ensures lexicographic sort produces chronological order.

### Requirement: Schema version recorded in change manifest

The change manifest must record the name and version of the schema that was active when the change was created. This allows specd to detect if the active schema has changed since the change was opened.

```jsonc
// manifest.json (excerpt)
{
  "schema": {
    "name": "@specd/schema-std",
    "version": 2,
  },
}
```

`schema.name` is the value of the `schema` field from `specd.yaml` at creation time. `schema.version` is the `version` integer from the schema's `schema.yaml`. Both are written once at change creation and never updated.

When a change is loaded and the active schema's name or version differs from what is recorded in the manifest, specd must emit a warning. The change remains usable — the warning is advisory, not a hard error. Archiving a change with a schema version mismatch must still be possible; the warning surfaces the mismatch so the user can decide whether to proceed.

## Constraints

- Manifest files must be written atomically (write to temp file, then rename) to prevent partial reads
- `FsChangeRepository` must not store `ArtifactStatus` in the manifest — only `validatedHash`
- Archive index entries must use forward slashes as path separators regardless of host OS
- The timestamp in a change directory name must be derived from `change.createdAt`, not from the system clock at write time
- The `schema` field in the change manifest is written once at creation and must never be updated by subsequent operations

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — infrastructure layer constraints

## ADRs

- [ADR-0007: Archive Organization](../../../docs/adr/0007-archive-organization.md)
- [ADR-0008: Change Directory Naming](../../../docs/adr/0008-change-directory-naming.md)
- [ADR-0009: Artifact Status Derivation](../../../docs/adr/0009-artifact-status-derivation.md)
