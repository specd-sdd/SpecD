# Storage

## Purpose

The domain and application layers must remain agnostic to where changes, drafts, and archives physically live, so that future storage backends can be swapped without touching business logic. specd's storage layer achieves this through port interfaces in `@specd/core` with adapter-specific implementations; the v1 implementation ships one adapter for all storage ports: `fs` (local filesystem).

## Requirements

### Requirement: Change directory naming

Active change directories must use the format `YYYYMMDD-HHmmss-<name>`, where the timestamp is the moment the change was created. The prefix must be a filesystem convention only — it must not appear in the domain model, the change manifest, or any CLI argument. `FsChangeRepository` must resolve a change by name using a glob pattern `*-<name>`.

### Requirement: Change directory listing order

`ChangeRepository.list()` MUST return active changes in canonical sort order: `createdAt` ascending (oldest first). With the `fs` adapter, this order is owned by the active-changes index helper under `{configPath}/tmp/fs-cache/changes/` — not by sorting directory entries at list time.

### Requirement: Artifact status derivation

Artifact status (`missing`, `in-progress`, `complete`, `skipped`) must be derived at load time — it must not be stored directly in the manifest. The manifest stores only `validatedHash` per artifact. `FsChangeRepository` must compute status using this precedence:

1. `validatedHash === "__skipped__"` → `skipped` (only valid for `optional: true` artifacts)
2. File absent (and no sentinel) → `missing`
3. File present and cleaned hash matches `validatedHash` → `complete`
4. File present but hash differs or `validatedHash` is `null` → `in-progress`

"Cleaned hash" means: read the file content, apply the artifact type's `preHashCleanup` rules in order (the same rules `ValidateArtifacts` applies before computing `validatedHash`), then compute SHA-256 of the result. `FsChangeRepository` must have access to the schema's artifact types at load time so that it can retrieve the `preHashCleanup` array for each artifact type. If no `preHashCleanup` rules are defined for an artifact type, the raw content is hashed directly.

To prevent false-drift detection and unnecessary write operations on uninitialized repositories, status derivation (including comparing current hashes to `validatedHash`) and drift invalidations must only be performed when the repository is fully initialized with resolved artifact types (i.e. `artifactTypes.length > 0`). If the repository is not initialized with artifact types, drift detection is bypassed.

### Requirement: Artifact dependency cascade

`Change.effectiveStatus(type)` must cascade through the artifact dependency graph. An artifact whose own hash matches its `validatedHash` must still be reported as `in-progress` if any artifact in its `requires` chain is neither `complete` nor `skipped`. A `skipped` optional artifact satisfies the dependency — it does not block downstream artifacts.

### Requirement: ValidateArtifacts is the sole path to complete

`Artifact.markComplete(hash)` must only be called by the `ValidateArtifacts` use case. `Artifact.markSkipped()` must only be called by the skip use case (sets `validatedHash` to `"__skipped__"`). No other code path may set these values.

### Requirement: Archive pattern configuration

The `fs` archive adapter must support a configurable `pattern` field in `specd.yaml` under `storage.archive.pattern`. The pattern controls the directory structure within the archive root. Supported variables: `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`. The default pattern must be `{{change.archivedName}}`.

### Requirement: Scope excluded from archive pattern

`{{change.scope}}` must not be a supported archive pattern variable. Scope paths use `/` as a segment separator, which produces ambiguous slugs when normalized for use in directory names.

### Requirement: Workspace excluded from archive pattern

`{{change.workspace}}` MUST NOT be a supported archive pattern variable. A change has no single primary workspace — only workspaces touched via `specIds` (see [`core:change`](../change/spec.md)). The normative supported-variable catalog for `storage.archive.pattern` is `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`; it MUST NOT include any per-change workspace token.

Implementations MUST reject a configured pattern containing `{{change.workspace}}` the same way they reject `{{change.scope}}` — by throwing `UnsupportedPatternError` at construction time, not by leaving the token unexpanded or substituting a fallback value.

### Requirement: Archive index

Filesystem-backed archive listing MUST use a list index under `{configPath}/tmp/fs-cache/archive/`, not a root-local index at the archive storage root.

Each fs-cache bucket directory contains:

- `.specd-index.jsonl` — one JSON object per line with wire shape `{ entry, sourceMtime?, sourceFiles? }` where `entry` is the public list-entry payload for that bucket and freshness fields are helper-only (never returned from `list()`).
- `.specd-index-meta.json` — `{ totalCount, generatedAt, isInvalidated }`.

For archive, each line's `entry` is an `ArchiveListEntry`; `sourceMtime` records the manifest mtime used for freshness.

`ArchiveRepository.reindex()` MUST rebuild the archive list index in `fs-cache/archive/` by scanning archived manifests. It MUST NOT write or maintain `.specd-index.jsonl` / `.specd-index-meta.json` at the archive root as part of normal list/count operation.

`get(name)` MAY still resolve archive paths by scanning stored manifests or other adapter-specific lookup — it MUST NOT depend on a root-local JSONL index for routine reads.

On first use or forced rebuild, implementations MUST migrate from any legacy root-local `.specd-index.jsonl` / `.specd-index-meta.json` by rebuilding into `fs-cache/archive/` (migrate and forget — no dual-read compatibility).

Orphan cleanup: when `reindex()` or the first full rebuild materializes `fs-cache/archive/`, delete legacy `.specd-index.jsonl` and `.specd-index-meta.json` from the archive root if present (ignore ENOENT). Normal `list()` / `count()` cache hits MUST NOT scan or delete root-local legacy files.

`specd storage reindex` invokes port `reindex()` methods only — see [`cli:storage-reindex`](../../cli/storage-reindex/spec.md). Storage specs MUST NOT require the CLI to know JSONL layout.

### Requirement: Archive runtime ignore hygiene

Fs-backed archive storage MUST maintain an archive-local `.gitignore` for runtime archive artifacts.

`FsArchiveRepository` MUST ensure that the archive root ignores `.staging`.

Legacy root-local index files (`.specd-index.jsonl`, `.specd-index-meta.json`) are obsolete; orphan cleanup removes them on rebuild/migration only. Runtime archive behavior MUST NOT re-add index-only ignore lines for those files after migration.

This guarantee MUST be exercised by runtime archive behavior rather than relying on project bootstrap state alone, so archive ignore hygiene remains correct after archive directory relocation, recreation, or index recovery.

`FsArchiveRepository` MAY centralize this behavior in a shared internal archive-directory preparation helper, but the runtime guarantee MUST cover archive creation and staged commit paths.

### Requirement: Named storage factories

Kernel composition SHALL support named storage factories for repository-backed capabilities. A storage factory SHALL be selected by adapter name and SHALL be responsible for creating the repository implementation needed for that storage mode.

When storage selection requires workspace-specific VCS or null-VCS handling, that responsibility SHALL remain within the selected storage factory rather than leaking into unrelated composition paths.

### Requirement: Archive pattern date variables are zero-padded

`{{month}}` and `{{day}}` must be zero-padded to two digits. `{{year}}` is four digits. This ensures lexicographic sort produces chronological order.

### Requirement: Change manifest format

The format of `manifest.json` — its fields, event shapes, and schema version behavior — is defined in [`core:change-manifest`](../change-manifest/spec.md). `FsChangeRepository` reads and writes the manifest according to that format and must write it atomically (temp file + rename) to prevent partial reads.

### Requirement: Repository path confinement

Fs-backed repositories MUST treat path confinement as a storage invariant.

Change, spec, archive, and metadata operations MUST reject any derived path that would escape their configured storage root or address an arbitrary untracked file outside the permitted artifact set for the operation.

### Requirement: Staged archive persistence

Fs-backed archive persistence MUST prefer staged commit semantics over ad hoc rollback.

When archive requires multiple durable updates, storage behavior MUST prepare the complete result first and only then expose the committed archive result, so failures before commit do not leave partially visible permanent archive state.

### Requirement: Storage debug logging

Fs-backed repositories SHOULD emit debug-level logs for tracked artifact resolution, path-confinement rejections, staged archive commit progress, and archive failure diagnostics.

These logs MUST follow the project's global logging conventions.

### Requirement: Change locks directory placement

The `FsChangeRepository` implementation derives its change lock directory path internally
from the `configPath` field: `{configPath}/tmp/change-locks`. This directory is distinct
from the changes storage root and allows per-change lock files to be co-located with
other config-scoped temporary artifacts.

The `configPath` field is part of the `ChangeRepositoryConfig` port contract, provided
at construction time. The repository derives the locks directory internally as
`path.join(configPath, 'tmp', 'change-locks')`.

### Requirement: Filesystem list index cache layout

Fs-backed list/count implementations MUST store derived list indexes under:

```text
{configPath}/tmp/fs-cache/
  archive/
  changes/
  drafts/
  discarded/
  specs/<workspace>/
```

Each bucket directory contains `.specd-index.jsonl` and `.specd-index-meta.json` as defined in the archive index requirement. Change buckets store `sourceMtime` from `manifest.json`. Spec buckets store `sourceFiles` with per-file mtimes used for freshness.

Repositories MUST NOT read or write these cache files directly except through dedicated index helper classes (`FsChangeIndexCache`, `FsSpecIndexCache`). Helpers own canonical sort, pagination, freshness, regeneration, and per-bucket locking.

Index entries store the full CLI-usable list-entry payload; port `include*` flags are response projection only.

### Requirement: configPath tmp gitignore

Fs-backed repositories and project initialisation MUST ensure `{configPath}/tmp/.gitignore` exists with normative contents:

```gitignore
*
!.gitignore
```

Meaning: ignore all tmp artifacts (`fs-cache/`, change-locks, and other runtime files) while allowing the ignore rule file itself to remain un-ignored.

Runtime repository behaviour MUST create or update this file idempotently when tmp paths are first used. `initProject` MUST create the same file for new projects (see [`core:config-writer-port`](../config-writer-port/spec.md)).

## Constraints

- Manifest files must be written atomically (write to temp file, then rename) to prevent partial reads
- Fs-cache index entries MUST use forward slashes as path separators in serialized path fields regardless of host OS
- The timestamp in a change directory name must be derived from `change.createdAt`, not from the system clock at write time
- Derived list indexes under `{configPath}/tmp/fs-cache/` are runtime caches and MUST NOT be committed to version control

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — infrastructure layer constraints
- [`core:change`](../change/spec.md) — Change domain model; defines event types, lifecycle states, and derivation rules serialized in the manifest
- [`core:change-manifest`](../change-manifest/spec.md) — manifest format, event shapes, and schema version behavior
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging requirements for repository diagnostics and staged archive persistence

## ADRs

- [ADR-0007: Archive Organization](../../../docs/adr/0007-archive-organization.md)
- [ADR-0008: Change Directory Naming](../../../docs/adr/0008-change-directory-naming.md)
- [ADR-0009: Artifact Status Derivation](../../../docs/adr/0009-artifact-status-derivation.md)
