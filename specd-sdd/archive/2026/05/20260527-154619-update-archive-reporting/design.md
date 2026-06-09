# Design: update-archive-reporting

## Non-goals

- Adding `description` to `ArchivedChangeIndexEntry` or `index.jsonl` (keeping index lightweight).
- Implementing filtering logic beyond basic pagination (limit, page, start-at).
- Updating external workspaces' archive logic (focusing on `FsArchiveRepository`).

## Affected areas

- `ArchivedChangeIndexEntry` in `packages/core/src/domain/archived-change-index-entry.ts`
  Change: Add `specIds`, `schemaName`, `schemaVersion` (already present in some forms, but ensure they are part of the canonical index row).
  Impact: Central record for archive listings.
- `ArchiveRepository` in `packages/core/src/application/ports/archive-repository.ts`
  Change: Update `list()` to accept `ArchiveListOptions` and return `ArchiveListResult`.
  Impact: HIGH. All repository implementations and use cases depend on this.
- `FsArchiveRepository` in `packages/core/src/infrastructure/fs/archive-repository.ts`
  Change: Implement pagination logic for `index.jsonl` and manage `.specd-index-meta.json`. Default `limit: 100` is enforced here. `page` and `startAt` are mutually exclusive starting points.
  Impact: Implementation of the port.
- `ListArchived` in `packages/core/src/application/use-cases/list-archived.ts`
  Change: Accept pagination options and delegate directly to repository.
  Impact: Use case API change.
- `ArchiveChange` in `packages/core/src/application/use-cases/archive-change.ts`
  Change: Update `.specd-index-meta.json` on successful archive.
  Impact: CRITICAL. Archiving workflow.
- `archive show` in `packages/cli/src/commands/archive/show.ts`
  Change: Display `description`, `specIds`, and `schema`.
- `archive list` in `packages/cli/src/commands/archive/list.ts`
  Change: Add pagination flags, remove `WORKSPACE`, and add summary footer.

## New constructs

### `.specd-index-meta.json`

- **Location**: Archive root directory (e.g., `.specd/archive/.specd-index-meta.json`).
- **Shape**: `{ "totalCount": number }`.
- **Responsibility**: Provides O(1) access to the total count of archived changes.
- **Relationships**: Managed by `FsArchiveRepository` during `archive()` and `reindex()`.

## Approach

1. **Domain/Port Update**: Update `ArchivedChangeIndexEntry`, `ArchiveListOptions`, and `ArchiveListResult` in `@specd/core`.
2. **Infrastructure (FsArchiveRepository)**:
   - Implement `_updateMetaCount(delta: number)` and `_readMetaCount(): number`.
   - Update `archive()` to increment count.
   - Update `reindex()` to recalculate count.
   - Implement `list(options)`:
     - Read `index.jsonl`.
     - Default `limit: 100` if not provided in `options`.
     - Apply starting point: `page` (offset = (page-1)\*limit) OR `startAt` (find exclusive cursor).
     - Apply `limit` slicing.
     - Return `ArchiveListResult` with items and meta.
3. **Use Case (ListArchived)**:
   - Update signature to accept options.
   - Delegate directly to repository.
4. **CLI (archive show/list)**:
   - Update `archive show` text/json output.
   - Update `archive list` to parse flags and render the paginated result + summary.

## Key decisions

- **Decision** → Default `limit` enforced at repository level.
- **Rationale** → Ensures all index-backed listings (even those bypassing the use case if any) have a safe default.
- **Alternatives rejected** → Enforcing at use case level (too far from data source).

- **Decision** → `.specd-index-meta.json` for total count.
- **Rationale** → Fast access for the "Showing X of Y" summary without reading the full index.
- **Alternatives rejected** → Reading the full index every time (slow for large archives).

## Trade-offs

- [Risk] Metadata file drift → [Mitigation] `reindex()` and atomic updates in `archive()`.

## Spec impact

### `core:archive-repository-port`

- Direct dependents: `core:archive-change`, `core:list-archived`, `core:get-archived-change`.
- `core:list-archived`: Signature update required (handled).
- `core:archive-change`: Needs to call count update (handled).

## Dependency map

```mermaid
graph TD
  CLI_List[archive list] --> ListArchived
  CLI_Show[archive show] --> GetArchivedChange
  ListArchived --> ArchiveRepo[ArchiveRepository Port]
  ArchiveChange --> ArchiveRepo
  ArchiveRepo <|-- FsArchiveRepo[FsArchiveRepository]
  FsArchiveRepo --> IndexFile[.specd-index.jsonl]
  FsArchiveRepo --> MetaFile[.specd-index-meta.json]
```

```
┌──────────────┐      ┌──────────────┐
│ archive list │─────▶│ ListArchived │
└──────────────┘      └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐      ┌───────────────┐
                      │ ArchiveRepo  │◀─────┤ ArchiveChange │
                      └──────┬───────┘      └───────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │ FsArchiveRepo│
                      └──────┬───────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
      ┌──────────────┐              ┌──────────────┐
      │ index.jsonl  │              │ index-meta   │
      └──────────────┘              └──────────────┘
```

## Migration / Rollback

- New meta file will be created on the first `archive()` or manual `reindex()`.
- Rollback: Delete `.specd-index-meta.json`; `ArchiveRepository` should handle its absence gracefully.

## Testing

### Automated tests

- `packages/core/test/infrastructure/fs/archive-repository.spec.ts`:
  - Test `archive()` updates meta count.
  - Test `reindex()` updates meta count.
  - Test `list()` with `limit`, `page`, and `startAt`.
  - Test `list()` default limit of 100.
- `packages/core/test/application/use-cases/list-archived.spec.ts`:
  - Verify direct delegation of options.
- `packages/cli/test/commands/archive/list.spec.ts`:
  - Test flag parsing and summary rendering.

### Manual / E2E verification

- Run `specd archive list` on a repo with archived changes: verify columns and summary.
- Run `specd archive list --limit 1`: verify summary shows "Showing 1 archived changes of X".
- Run `specd archive show <name>`: verify description (if any) and specIds/schema are shown.

## Open questions

- none
