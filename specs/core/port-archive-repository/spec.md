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

### Requirement: archive rejects non-archivable state

When a change is not in `archivable` state and `options.force` is not `true`, `archive()` MUST throw `InvalidStateTransitionError`. The change directory MUST NOT be moved and no index entry MUST be written.

### Requirement: list returns all archived changes in chronological order

`list()` MUST return all archived changes in this workspace sorted chronologically, oldest first. The implementation MUST read from `index.jsonl`, deduplicating by name so that the last entry wins in case of duplicates introduced by manual recovery.

### Requirement: get returns an archived change or null

`get(name)` MUST accept a change name string and return the `ArchivedChange` with that name, or `null` if not found. The implementation MUST search `index.jsonl` from the end (most recent entries first) for efficient lookup. If the entry is not found in the index, the implementation MUST fall back to a filesystem scan (e.g. glob `**/*-<name>`) and append the recovered entry to `index.jsonl` for future lookups.

### Requirement: reindex rebuilds the archive index

`reindex()` MUST rebuild `index.jsonl` by scanning the archive directory for all manifest files, sorting entries by `archivedAt` in chronological order, and writing a clean index. The resulting file MUST be in chronological order (oldest first) so that git diffs show only added or removed lines — never reorderings.

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

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `archivable` state, `ActorIdentity`, lifecycle transitions
- [`specs/core/storage/spec.md`](../storage/spec.md) — archive pattern configuration, archive index format, directory naming
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — ArchiveChange use case that delegates to this port
