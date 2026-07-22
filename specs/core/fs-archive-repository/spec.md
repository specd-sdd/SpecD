# FsArchiveRepository

## Purpose

`FsArchiveRepository` is the filesystem-backed implementation of the `ArchiveRepository` port. It manages archived changes, validating configuration options strictly against its Zod schema while receiving runtime dependencies (like paths of active changes and drafts) via its `context: ArchiveRepositoryConfig` parameter.

## Requirements

### Requirement: Validate options at construction

`FsArchiveRepository` SHALL accept:

1. `context: ArchiveRepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`) and core runtime dependencies (`changesPath`, `draftsPath`).
2. `config: FsArchiveRepositoryConfig` containing filesystem configuration options (`path`, `pattern`).

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` are validated, and that no runtime dependencies or workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`
- `pattern?: string`

The constructor MUST verify that the physical directories for the archive (`path`), active changes (`context.changesPath`), and drafts (`context.draftsPath`) exist on disk. If any of these paths do not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsArchiveRepository` SHALL expose a creator function `createFsArchiveStorageFactory()` that returns an `ArchiveStorageFactory` instance.

This factory SHALL construct and return `FsArchiveRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

### Requirement: Archive list index in fs-cache

`FsArchiveRepository` MUST maintain its archive list index under `{configPath}/tmp/fs-cache/archive/` via an `FsChangeIndexCache`-style index helper (same wire shapes and `mutate`/freshness rules as change buckets — invalidation flag, then manifest mtime comparison, with no max-age TTL).

`list()`, `count()`, and `reindex()` MUST delegate to that helper. The repository MUST NOT read or write root-local `.specd-index.jsonl` or `.specd-index-meta.json` during normal operation.

Canonical sort: `archivedAt` descending (newest → oldest).

On first use or `reindex()`, the helper MUST rebuild from archived manifests under the archive storage root. This is a migrate-and-forget cutover — no dual-read of legacy root index files.

### Requirement: Legacy archive root index orphan cleanup

When `reindex()` or the first full rebuild materializes `fs-cache/archive/`, `FsArchiveRepository` MUST delete legacy `.specd-index.jsonl` and `.specd-index-meta.json` from the archive root if present (ignore ENOENT).

It MAY remove obsolete index-only lines from the archive-root `.gitignore` while keeping `.staging`.

Normal `list()` / `count()` cache hits MUST NOT scan or delete root-local legacy files.

After `archive(change)`, the helper MUST upsert/append the archive list entry and invalidate or update the source change bucket index as required by the change repository.

### Requirement: Archive pattern expansion has no workspace token

`FsArchiveRepository` MUST expand archive path patterns using only `{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, and `{{change.archivedName}}`. Pattern expansion MUST NOT accept or substitute a workspace value — `archive()` and `archivePath()` MUST resolve the relative archive directory from `name`, `archivedName`, and `archivedAt` alone, without reading `workspaces[0]`, `specIds[0]`, or any other derived workspace value.

If the configured pattern contains the literal token `{{change.workspace}}`, the constructor MUST throw `UnsupportedPatternError` (the same error type already thrown for `{{change.scope}}`), with a reason explaining that a change has no single primary workspace. Implementations MUST NOT silently leave the token unexpanded and MUST NOT fall back to `'default'`.

## Constraints

- `FsArchiveRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `ArchiveRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout and archive index migration
- [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md) — `ArchiveListEntry` shape
- [`core:archive-repository-port`](../archive-repository-port/spec.md) — list/count/reindex port contract
