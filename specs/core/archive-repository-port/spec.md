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

`list(options?)` MUST return archived changes in this workspace sorted chronologically (oldest first).

```typescript
interface ArchiveListOptions {
  limit?: number
  page?: number
  startAt?: string
}
```

- `limit`: maximum number of entries to return. Defaults to 100 if not provided.
- `page`: 1-based page index. Mutually exclusive with `startAt`.
- `startAt`: name of the change to start after (exclusive keyset cursor). Mutually exclusive with `page`.

### Requirement: list returns index entries

`list(options?)` MUST return a result object containing the entries and metadata:

```typescript
interface ArchiveListResult {
  items: ArchivedChangeIndexEntry[]
  meta: {
    total: number
    count: number
    limit: number
    page?: number
    startAt?: string
  }
}
```

The implementation MUST satisfy this requirement without reading `manifest.json` files for every entry.

### Requirement: get returns an archived change or null

`get(name)` MUST accept a change name string and return the full `ArchivedChange` with that name, or `null` if not found.

The implementation MUST search `index.jsonl` from the end (most recent entries first) for efficient lookup. If the entry is not found in the index, the implementation MUST fall back to a filesystem scan (e.g. glob `**/*-<name>`) and append the recovered entry to `index.jsonl` for future lookups.

When an entry is found (either from the index or recovery), the implementation MUST read the archived directory's `manifest.json` and construct the returned `ArchivedChange` from that manifest so that callers can inspect the archived change with full read-only detail.

### Requirement: fs implementation maintains archive runtime ignore rules

When the filesystem implementation creates or maintains runtime archive artifacts, it MUST also maintain archive-local ignore rules for those artifacts.

`FsArchiveRepository` MUST ensure that the archive root `.gitignore` contains entries for `.specd-index.jsonl` and `.staging`.

This guarantee MUST be provided by runtime archive behavior, not only by project initialization.

The guarantee MUST cover archive creation, `reindex()`, and runtime index recovery or append paths that recreate or maintain `.specd-index.jsonl`.

### Requirement: archivePath returns the absolute path for an archived change

`archivePath(entry)` MUST accept either a full `ArchivedChange` or an `ArchivedChangeIndexEntry` and return the absolute filesystem path to the archived directory.

This mirrors `ChangeRepository.changePath(change)` for active changes. The path MUST be resolved from the archive pattern and root directory configured at construction time — the caller does not need to know the archive directory structure.

This method is used by `RunStepHooks` and `GetHookInstructions` to build the `change.path` template variable when operating on archived changes.

### Requirement: reindex rebuilds the archive index

`reindex()` MUST rebuild `index.jsonl` by scanning the archive directory for all manifest files, sorting entries by `archivedAt` in chronological order, and writing a clean index. The resulting file MUST be in chronological order (oldest first) so that git diffs show only added or removed lines — never reorderings.

### Requirement: Archive index metadata persistence

The repository implementation SHALL maintain a metadata file `.specd-index-meta.json` at the archive root.

- The file MUST contain the `totalCount` of archived changes.
- `archive()` MUST update this count on success.
- `reindex()` MUST recalculate the `totalCount` and refresh the metadata file.
- `list()` SHOULD use this metadata file to provide the `total` count in its result.

### Requirement: Abstract class with abstract methods

`ArchiveRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`archive`, `list`, `get`, `reindex`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

### Requirement: Append-only archive semantics

Once a change is archived, the resulting `ArchivedChange` record and its directory contents MUST NOT be mutated. The archive is append-only. No method on `ArchiveRepository` permits modification of an existing archived entry.

## Constraints

- The archive is append-only — archived changes are never modified after creation
- `index.jsonl` entries MUST use forward slashes as path separators regardless of host OS
- `index.jsonl` MUST be kept in chronological order (oldest first, newest last) so git diffs only show lines added at the bottom or removed — never reorderings
- `archive()` appends exactly one line to `index.jsonl` (O(1) append)
- `get()` searches from the end of `index.jsonl` for most-recent-first lookup; falls back to filesystem scan if not found
- The `force` option on `archive()` bypasses the state check entirely
- `ArchivedChange` is immutable once created — no setters, no mutation methods

## Spec Dependencies

- [`core:repository-port`](../repository-port/spec.md) — `Repository` base class, `RepositoryConfig`, shared accessors
- [`default:_global/architecture`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`core:change`](../change/spec.md) — Change entity, `archivable` state, `ActorIdentity`, lifecycle transitions
- [`core:storage`](../storage/spec.md) — archive pattern configuration, archive index format, directory naming
- [`core:archive-change`](../archive-change/spec.md) — ArchiveChange use case that delegates to this port
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging requirements for archive staging, path resolution, and failure diagnostics
- `core:archived-change-index-entry` — index row type returned by `list()` and accepted by `archivePath()`
- [`core:read-only-change-view`](../read-only-change-view/spec.md) — shared read-only surface for manifest-backed archive reads
