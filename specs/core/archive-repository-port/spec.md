# ArchiveRepository Port

## Purpose

Archiving completed changes must be decoupled from their active-change storage so the archive can enforce its own append-only semantics and indexing strategy independently. `ArchiveRepository` is the application-layer port for archiving and querying archived changes within a single workspace, extending the shared `Repository` base class. The archive is append-only — once a change is archived it is never mutated — and an `index.jsonl` file at the archive root provides O(1) appends and fast lookup without scanning the filesystem.

## Requirements

### Requirement: Inheritance from Repository base

`ArchiveRepository` MUST extend `Repository`. The `workspace()`, `ownership()`, and `isExternal()` accessors MUST reflect the values provided at construction time and MUST NOT change during the lifetime of the instance.

### Requirement: archive moves a change to the archive

`archive(change, options?)` MUST move the change directory from the active changes location to the archive, create an `ArchivedChange` record, persist its manifest, and append an entry to `index.jsonl`. The method MUST return an object containing the `ArchivedChange` and the `archiveDirPath`.

The implementation MUST verify that the change is in `archivable` state before proceeding. This state check is intentionally redundant with the `ArchiveChange` use case — it exists as a safety guard to prevent accidental archival if the repository is called directly.

When `options.force` is `true`, the state check MUST be skipped, allowing archival from any state (e.g. for recovery or administrative operations).

When `options.actor` is provided, the `ActorIdentity` MUST be recorded in the archived change manifest as `archivedBy`.

The destination path MUST be computed from the archive pattern configured at construction time (e.g. `{{year}}/{{change.archivedName}}`). The source path MUST be resolved from the change name using the changes path configuration.

### Requirement: archive persists through a staged commit

`archive(change, options?)` MUST treat archive persistence as a staged commit rather than a sequence of partially visible permanent writes.

When archive storage needs to materialize multiple durable effects, the repository MUST prepare the destination state so that a failure before commit does not leave a partially committed archive result visible as a successful archive.

### Requirement: Archive path confinement

Archive path resolution derived from archive patterns, stored index entries, or recovered manifest locations MUST remain confined to the configured archive root.

Implementations MUST reject any derived path that would escape the archive root or reinterpret archive metadata as an unchecked arbitrary filesystem path.

### Requirement: Archive repository debug logging

Implementations SHOULD emit debug-level logs for archive path resolution, staged commit start, staged commit completion, and confinement-related archive failures.

These logs MUST follow the project's global logging conventions.

### Requirement: archive rejects non-archivable state

When a change is not in `archivable` state and `options.force` is not `true`, `archive()` MUST throw `InvalidStateTransitionError`. The change directory MUST NOT be moved and no index entry MUST be written.

### Requirement: list returns all archived changes in chronological order

`list(options?)` MUST return archived changes in this workspace sorted by canonical order: `archivedAt` descending (newest → oldest).

`ArchiveListOptions` extends `ListOptions` with:

- `includeArchivedBy?: boolean` — when `true`, projected entries MAY include `archivedBy`; when `false` or omitted, `archivedBy` MUST NOT appear

Pagination uses shared `ListOptions` / `ListResult` from [`core:repository-port`](../repository-port/spec.md). The former `startAt` cursor is replaced by `after: { key, id? }` where `after.key` is `archivedAt` ISO-8601 and `after.id` is the change `name` tiebreak.

Pagination has **no default `limit`**. When `limit` is omitted, `list()` returns the full archive index and `meta.limit` equals `meta.total` per [`core:repository-port`](../repository-port/spec.md).

### Requirement: list returns index entries

`list(options?)` MUST return `ListResult<ArchiveListEntry>`:

```typescript
interface ArchiveListResult {
  items: ArchiveListEntry[]
  meta: ListMeta
}
```

The implementation MUST satisfy this requirement without reading `manifest.json` for every entry. `includeArchivedBy` controls projection of `archivedBy` only; implementations MUST NOT perform extra reads to satisfy the flag.

`meta.total` and `count()` MUST read from the same index source.

### Requirement: Archive list count

`ArchiveRepository` MUST expose `count()` returning the total number of archived changes in this workspace. The value MUST match `list().meta.total` and MUST be served from the same fs-cache index source. `count()` MUST NOT scan every archive manifest.

### Requirement: get returns an archived change or null

`get(name)` MUST accept a change name string and return the full `ArchivedChange` with that name, or `null` if not found.

The implementation MUST search `index.jsonl` from the end (most recent entries first) for efficient lookup. If the entry is not found in the index, the implementation MUST fall back to a filesystem scan (e.g. glob `**/*-<name>`) and append the recovered entry to `index.jsonl` for future lookups.

When an entry is found (either from the index or recovery), the implementation MUST read the archived directory's `manifest.json` and construct the returned `ArchivedChange` from that manifest so that callers can inspect the archived change with full read-only detail.

### Requirement: fs implementation maintains archive runtime ignore rules

When the filesystem implementation creates or maintains runtime archive artifacts, it MUST maintain archive-local ignore rules for staging artifacts.

`FsArchiveRepository` MUST ensure that the archive root `.gitignore` contains an entry for `.staging`.

List index files live under `{configPath}/tmp/fs-cache/archive/` and are governed by `{configPath}/tmp/.gitignore`, not the archive root `.gitignore`. On rebuild/migration, obsolete root-local `.specd-index.jsonl` / `.specd-index-meta.json` gitignore entries MAY be removed while keeping `.staging`.

This guarantee MUST be provided by runtime archive behavior, not only by project initialization.

### Requirement: archivePath returns the absolute path for an archived change

`archivePath(entry)` MUST accept either a full `ArchivedChange` or an `ArchiveListEntry` and return the absolute filesystem path to the archived directory. The accepted parameter type MUST NOT require a `workspaces` field on the entry — `ArchiveListEntry` has no `workspaces` field (see [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md)), so `archivePath` MUST be resolvable from `name`, `archivedName`, and `archivedAt` alone.

This mirrors `ChangeRepository.changePath(change)` for active changes. The path MUST be resolved from the archive pattern and root directory configured at construction time — the caller does not need to know the archive directory structure.

Archive patterns MUST NOT support a `{{change.workspace}}` token: a change has no single primary workspace, and `archivePath` MUST NOT derive or require one from `workspaces[0]` or `specIds[0]`. See [`core:storage`](../storage/spec.md) for the normative supported-variable catalog.

This method is used by `RunStepHooks` and `GetHookInstructions` to build the `change.path` template variable when operating on archived changes.

### Requirement: internalPaths returns absolute storage paths

`internalPaths()` MUST return an array of absolute filesystem paths to internal specd management directories owned by the repository, or `undefined` when the concept does not apply.

Returning `undefined` signals that internal-path exclusion is not applicable (e.g. remote backends that do not manage local filesystem directories). Implementations MUST NOT return an empty array to signal inapplicability; an empty array means "no paths to exclude".

For `FsArchiveRepository`, this MUST include:

- the absolute path to the archive root directory

These paths are used by implementation discovery to avoid tracking specd's own metadata.

### Requirement: reindex rebuilds the archive index

`reindex()` MUST rebuild the archive list index under `{configPath}/tmp/fs-cache/archive/` by scanning archive directories for manifest files, projecting `ArchiveListEntry` rows, sorting by `archivedAt` descending, and writing a clean fs-cache index via atomic publish.

On first rebuild or migration, implementations MUST delete legacy `.specd-index.jsonl` and `.specd-index-meta.json` from the archive root if present (ignore ENOENT). Normal `list` / `count` cache hits MUST NOT scan or delete root-local legacy files.

Implementations MUST NOT write or maintain a root-local archive list index as part of normal list/count operation.

### Requirement: Archive index metadata persistence

Filesystem implementations MUST maintain `.specd-index-meta.json` alongside `.specd-index.jsonl` under `{configPath}/tmp/fs-cache/archive/`.

- The meta file MUST contain `totalCount`, `generatedAt`, and `isInvalidated` per the shared fs-cache index helper contract.
- `archive()` MUST upsert the archive list entry and update `totalCount` through the helper.
- `reindex()` MUST recalculate `totalCount` and refresh the meta file.
- `list()` and `count()` MUST use this meta file (after freshness checks) for `meta.total` and `count()` respectively.

Root-local archive index metadata files are obsolete and MUST NOT be updated after migration.

### Requirement: Abstract class with abstract methods

`ArchiveRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`archive`, `list`, `count`, `get`, `reindex`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

### Requirement: Append-only archive semantics

Once a change is archived, the resulting `ArchivedChange` record and its directory contents MUST NOT be mutated. The archive is append-only. No method on `ArchiveRepository` permits modification of an existing archived entry.

## Constraints

- The archive is append-only — archived changes are never modified after creation
- Archive list indexes live under `{configPath}/tmp/fs-cache/archive/`, not at the archive root
- Canonical archive list sort is `archivedAt` descending (newest → oldest)
- List pagination has no default `limit`; when omitted, `list()` returns the full archive index and `meta.limit` equals `meta.total` per `core:repository-port`
- `archive()` upserts the archive list entry through the fs-cache helper
- `get()` loads full detail from the archived directory `manifest.json`; list/count use index entries only
- The `force` option on `archive()` bypasses the state check entirely
- `ArchivedChange` is immutable once created — no setters, no mutation methods

## Spec Dependencies

- [`core:repository-port`](../repository-port/spec.md) — `Repository` base class, shared list pagination types, and `invalidateCache()`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`core:change`](../change/spec.md) — Change entity, `archivable` state, `ActorIdentity`, lifecycle transitions
- [`core:storage`](../storage/spec.md) — archive pattern configuration, fs-cache layout, directory naming
- [`core:archive-change`](../archive-change/spec.md) — ArchiveChange use case that delegates to this port
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging requirements for archive staging, path resolution, and failure diagnostics
- [`core:archived-change-index-entry`](../archived-change-index-entry/spec.md) — `ArchiveListEntry` row type returned by `list()` and accepted by `archivePath()`
- [`core:read-only-change-view`](../read-only-change-view/spec.md) — shared read-only surface for manifest-backed archive reads
