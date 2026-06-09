# Tasks: update-archive-reporting

## 1. Core Domain and Ports

- [x] 1.1 Update `ArchivedChangeIndexEntry` and result types
      `packages/core/src/domain/archived-change-index-entry.ts`: `ArchivedChangeIndexEntry` — add `specIds`, `schemaName`, `schemaVersion`
      Approach: update interface to include metadata needed for enriched listings
      (Req: list returns index entries)
- [x] 1.2 Update `ArchiveRepository` port signature
      `packages/core/src/application/ports/archive-repository.ts`: `ArchiveRepository.list()` — update to accept `ArchiveListOptions` and return `ArchiveListResult`
      Approach: change signature to support pagination and meta return
      (Req: list returns all archived changes in chronological order)
- [x] 1.3 Add meta file persistence to `ArchiveRepository` port
      `packages/core/src/application/ports/archive-repository.ts`: `ArchiveRepository` — add requirements for `.specd-index-meta.json` management
      Approach: update port documentation and abstract method definitions
      (Req: Archive index metadata persistence)

## 2. Infrastructure (FsArchiveRepository)

- [x] 2.1 Implement meta count persistence
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `_updateMetaCount`, `_readMetaCount` — internal methods to manage `.specd-index-meta.json`
      Approach: implement JSON read/write for `{ totalCount: number }` with atomic updates
      (Req: Archive index metadata persistence)
- [x] 2.2 Update `archive()` to increment meta count
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archive()` — call `_updateMetaCount(1)` on success
      Approach: increment the persisted total count during successful archival
      (Req: Archive index metadata maintenance)
- [x] 2.3 Update `reindex()` to refresh meta count
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `reindex()` — recalculate total count from manifests
      Approach: scan filesystem for manifests and rewrite the meta file
      (Req: Archive index metadata persistence)
- [x] 2.4 Implement paginated `list()`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `list()` — read `index.jsonl` and apply pagination
      Approach: read all lines, deduplicate, find `startAt` cursor or slice by `page/limit`, return with `meta` from meta file
      (Req: list returns index entries)

## 3. Application (Use Cases)

- [x] 3.1 Update `ListArchived` use case
      `packages/core/src/application/use-cases/list-archived.ts`: `ListArchived.execute()` — accept options and enforce default limit
      Approach: signature change; `options.limit ??= 100`; delegate to repository
      (Req: No input, Output)
- [x] 3.2 Update `ArchiveChange` to maintain metadata
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange.execute()` — (optional) ensure meta maintenance is called
      Approach: verify repository call handles it or add explicit call if needed (design says repo handles it)
      (Req: Archive index metadata maintenance)

## 4. CLI (Commands)

- [x] 4.1 Update `archive show` output
      `packages/cli/src/commands/archive/show.ts`: `registerArchiveShow` — display enriched metadata
      Approach: update text formatter to show description, specIds, and schema info
      (Req: Output format — text)
- [x] 4.2 Update `archive list` signature and rendering
      `packages/cli/src/commands/archive/list.ts`: `registerArchiveList` — add flags and update table
      Approach: add `--limit`, `--page`, `--start-at` via Commander; remove `WORKSPACE` column; add summary footer
      (Req: Command signature, Output format — text)

## 5. Testing and Validation

- [x] 5.1 Unit tests for `FsArchiveRepository` pagination
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`: new tests for pagination and meta count
      Approach: create repo, archive changes, verify meta file, list with various options
- [x] 5.2 Unit tests for `ListArchived` default limit
      `packages/core/test/application/use-cases/list-archived.spec.ts`: verify default 100 limit
      Approach: stub repo, call without limit, assert repo called with 100
- [x] 5.3 CLI integration tests for `archive list`
      `packages/cli/test/commands/archive/list.spec.ts`: verify table rendering and summary
      Approach: stub kernel, mock archived changes, verify stdout content
