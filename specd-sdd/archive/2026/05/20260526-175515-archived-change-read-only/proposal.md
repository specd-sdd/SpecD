# Proposal: archived-change-read-only

## Motivation

Archived changes retain a full change directory on disk (manifest, proposal, design, deltas, specs, reports), but specd exposes only a slim index projection through `ArchiveRepository.get()` and minimal CLI output. Teams auditing or diffing past work cannot inspect archived changes through the same read models used for drafted and discarded changes without reading the filesystem manually.

## Current behaviour

- `ArchiveRepository.list()` and `get()` return `ArchivedChange` built from `index.jsonl` (or a single manifest read on `get` fallback) with summary fields only: name, `archivedAt`, `archivedBy`, artifact type IDs, `specIds`, schema identity. No `description`, `history`, or per-artifact status/hash map.
- `ListArchived` and `GetArchivedChange` delegate to that port; callers receive the summary entity.
- `archive show` prints name, hardcoded `archivable` state, specs, and schema — not description, artifact DAG, archive timestamps, or directory path.
- `archive list` already surfaces index-oriented fields (`archivedName`, `archivedAt`, `artifacts` types) suitable for tables; it does not need manifest I/O per row.
- On disk, archived directories under `storage.archivePath` are complete; the gap is API and CLI projection, not storage loss.

## Proposed solution

Split archive read models by access pattern, mirroring `drafted-change-read-only`:

1. **`ArchivedChangeIndexEntry`** — lightweight row for `list()` and index-driven UIs (no `manifest.json` read per entry).
2. **`ArchivedChange`** — full read-only detail for `get(name)`, loaded from `manifest.json` in the archive directory, aligned with `ReadOnlyChangeView` fields where applicable, plus archive metadata (`archivedAt`, `archivedBy`, `archivedName`).

`get(name)` loads the manifest and projects a read-only facade; `list()` stays index-only. Archive remains append-only — no mutation API for archived changes. CLI `archive show` becomes a true inspection command; `archive list` continues to use index entries.

## Specs affected

### New specs

- `core:archived-change-index-entry`: Defines the index row type and fields required for fast listing without manifest I/O.
  - Depends on: `core:change`, `core:storage`

### Modified specs

- `core:archive-repository-port`: `list()` returns `ArchivedChangeIndexEntry[]`; `get()` returns full `ArchivedChange` from manifest; `archivePath()` accepts detail or index entry by contract; `archive()` still returns summary suitable for index append.
  - Depends on (added): `core:archived-change-index-entry`, `core:read-only-change-view`

- `core:get-archived-change`: Returns full read-only `ArchivedChange` (manifest-backed), not index summary.
  - Depends on (added): `core:archived-change-index-entry`, `core:read-only-change-view`

- `core:list-archived`: Returns `ArchivedChangeIndexEntry[]` instead of `ArchivedChange[]`.
  - Depends on (added): `core:archived-change-index-entry`

- `cli:archive-show`: Rich text/JSON/toon output from full `ArchivedChange` (description, artifacts, history summary, archive metadata, path hint).
  - Depends on (added): `core:read-only-change-view`

- `cli:archive-list`: Align with `ArchivedChangeIndexEntry` from `ListArchived`; no behavioural regression on list performance.
  - Depends on (added): `core:archived-change-index-entry`

## Impact

| Area                                                        | Impact                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/core/src/domain/entities/archived-change.ts`      | Redefine as full read-only detail (likely facade over manifest-loaded `Change`)   |
| New domain module                                           | `ArchivedChangeIndexEntry` type                                                   |
| `packages/core/src/domain/read-only-change-view.ts`         | Optional `ArchivedChange` interface extension or `toArchivedChangeView` factory   |
| `packages/core/src/infrastructure/fs/archive-repository.ts` | Split `_buildArchivedChange` vs index entry builder; `get()` loads manifest       |
| `packages/core/src/application/ports/archive-repository.ts` | Return type changes on `list` / `get`                                             |
| Use cases                                                   | `GetArchivedChange`, `ListArchived`; `ArchiveChange` return type from `archive()` |
| `packages/cli/src/commands/archive/show.ts`, `list.ts`      | Rich show; list types aligned                                                     |
| Tests                                                       | Archive repository, use cases, CLI archive commands                               |
| Consumers                                                   | Any code assuming `ArchivedChange` is index-sized breaks; internal monorepo only  |

## Technical context

- **Agreed with user:** `ArchivedChange` is the **full read-only detail** type; `ArchivedChangeIndexEntry` is the **index/list** type. Not a separate `ArchivedChangeView` name unless it aliases the same contract as `ReadOnlyChangeView`.
- **Agreed with user:** `list` must stay fast (index-only); `get(name)` must be full (manifest I/O acceptable).
- **Pattern:** Reuse read-only facade approach from `drafted-change-read-only` (`ReadOnlyChangeFacade`); do not return mutable `Change` from archive read paths.
- **Existing code:** `FsArchiveRepository._loadManifest()` already parses `manifest.json`; `_buildArchivedChange()` today discards rich fields. Index enrichment in `index.jsonl` matches current `IndexEntry` shape — list can map entries without manifest reads.
- **Type contract:** Full `ArchivedChange` extends `ReadOnlyChangeView` and adds archive metadata (`archivedAt`, `archivedBy`, `archivedName`).
- **CLI state:** `archive show` reports lifecycle `state` derived from the archived manifest (not hardcoded), and uses archive metadata separately to indicate storage.
- **Hooks:** `archivePath(...)` must accept both the full `ArchivedChange` and `ArchivedChangeIndexEntry` (minimum `name` + `archivedName`) so hooks and listings can resolve paths without forcing manifest I/O.
- **Rejected:** Keeping `ArchivedChange` as summary only and adding `ArchivedChangeView` for detail — user chose the opposite naming. Single type with lazy loading for both list and get — rejected in favour of explicit index vs detail types.

## Open questions

1. Future follow-up (out of scope): `archive context` / spec-preview against archive directory paths?
