# Storage

## Purpose

The domain and application layers must remain agnostic to where changes, drafts, and archives physically live, so that future storage backends can be swapped without touching business logic. specd's storage layer achieves this through port interfaces in `@specd/core` with adapter-specific implementations; the v1 implementation ships one adapter for all storage ports: `fs` (local filesystem).

## Requirements

### Requirement: Change directory naming

Active change directories must use the format `YYYYMMDD-HHmmss-<name>`, where the timestamp is the moment the change was created. The prefix must be a filesystem convention only — it must not appear in the domain model, the change manifest, or any CLI argument. `FsChangeRepository` must resolve a change by name using a glob pattern `*-<name>`.

### Requirement: Change directory listing order

`ChangeRepository.list()` must return changes in creation order (oldest first). With the `fs` adapter, this is achieved by sorting directory entries by name, which is chronological given the timestamp prefix.

### Requirement: Artifact status derivation

Artifact status (`missing`, `in-progress`, `complete`, `skipped`) must be derived at load time — it must not be stored directly in the manifest. The manifest stores only `validatedHash` per artifact. `FsChangeRepository` must compute status using this precedence:

1. `validatedHash === "__skipped__"` → `skipped` (only valid for `optional: true` artifacts)
2. File absent (and no sentinel) → `missing`
3. File present and cleaned hash matches `validatedHash` → `complete`
4. File present but hash differs or `validatedHash` is `null` → `in-progress`

"Cleaned hash" means: read the file content, apply the artifact type's `preHashCleanup` rules in order (the same rules `ValidateArtifacts` applies before computing `validatedHash`), then compute SHA-256 of the result. `FsChangeRepository` must have access to the schema's artifact types at load time so that it can retrieve the `preHashCleanup` array for each artifact type. If no `preHashCleanup` rules are defined for an artifact type, the raw content is hashed directly.

### Requirement: Artifact dependency cascade

`Change.effectiveStatus(type)` must cascade through the artifact dependency graph. An artifact whose own hash matches its `validatedHash` must still be reported as `in-progress` if any artifact in its `requires` chain is neither `complete` nor `skipped`. A `skipped` optional artifact satisfies the dependency — it does not block downstream artifacts.

### Requirement: ValidateArtifacts is the sole path to complete

`Artifact.markComplete(hash)` must only be called by the `ValidateArtifacts` use case. `Artifact.markSkipped()` must only be called by the skip use case (sets `validatedHash` to `"__skipped__"`). No other code path may set these values.

### Requirement: Archive pattern configuration

The `fs` archive adapter must support a configurable `pattern` field in `specd.yaml` under `storage.archive.pattern`. The pattern controls the directory structure within the archive root. Supported variables: `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`. The default pattern must be `{{change.archivedName}}`.

### Requirement: Scope excluded from archive pattern

`{{change.scope}}` must not be a supported archive pattern variable. Scope paths use `/` as a segment separator, which produces ambiguous slugs when normalized for use in directory names.

### Requirement: Archive index

`FsArchiveRepository` must maintain an `index.jsonl` at the archive root. Each line must be a JSON object with `name` and `path` fields. The file must be kept in chronological order (oldest first, newest last) so that git diffs only show lines added at the bottom or lines removed — never reorderings. `archive(change)` must append one line at the end (O(1)). `get(name)` must scan the file from the end without loading it fully into memory; if not found, it must fall back to a recursive glob `**/*-<name>` and append the recovered entry. `reindex()` must be declared on the `ArchiveRepository` port. The `fs` adapter implements it by globbing all `manifest.json` files under the archive root, sorting entries by `archivedAt`, and writing a clean `index.jsonl` in chronological order. Other adapters implement it according to their storage mechanism. `specd storage reindex` calls the port method — it has no knowledge of the underlying implementation.

### Requirement: Named storage factories

Kernel composition SHALL support named storage factories for repository-backed capabilities. A storage factory SHALL be selected by adapter name and SHALL be responsible for creating the repository implementation needed for that storage mode.

When storage selection requires workspace-specific VCS or null-VCS handling, that responsibility SHALL remain within the selected storage factory rather than leaking into unrelated composition paths.

### Requirement: Archive pattern date variables are zero-padded

`{{month}}` and `{{day}}` must be zero-padded to two digits. `{{year}}` is four digits. This ensures lexicographic sort produces chronological order.

### Requirement: Change manifest format

The format of `manifest.json` — its fields, event shapes, and schema version behavior — is defined in [`specs/core/change-manifest/spec.md`](../change-manifest/spec.md). `FsChangeRepository` reads and writes the manifest according to that format and must write it atomically (temp file + rename) to prevent partial reads.

## Constraints

- Manifest files must be written atomically (write to temp file, then rename) to prevent partial reads
- Archive index entries must use forward slashes as path separators regardless of host OS
- The timestamp in a change directory name must be derived from `change.createdAt`, not from the system clock at write time

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — infrastructure layer constraints
- [`core:core/change`](../change/spec.md) — Change domain model; defines event types, lifecycle states, and derivation rules serialized in the manifest
- [`core:core/change-manifest`](../change-manifest/spec.md) — manifest format, event shapes, and schema version behavior

## ADRs

- [ADR-0007: Archive Organization](../../../docs/adr/0007-archive-organization.md)
- [ADR-0008: Change Directory Naming](../../../docs/adr/0008-change-directory-naming.md)
- [ADR-0009: Artifact Status Derivation](../../../docs/adr/0009-artifact-status-derivation.md)
