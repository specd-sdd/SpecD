# Proposal: update-archive-reporting

## Motivation

The `ArchiveChange` contract was recently updated to include more metadata, but the CLI commands `archive show` and `archive list` do not yet take full advantage of this. `archive list` specifically has a redundant `WORKSPACE` column and lacks pagination, which is necessary as the archive grows. We need to improve metadata display and implement efficient listing with pagination.

## Current behaviour

- `archive show` displays basic metadata but its text output formatting could be improved to better utilize the updated `ArchivedChange` model.
- `archive list` displays a `WORKSPACE` column derived from the first spec's workspace, which is redundant and no longer explicitly stored as a single value.
- `archive list` lacks pagination, showing all archived changes at once, which can be slow and overwhelming for large projects.
- There is no central metadata file for the archive index, requiring a full index scan to determine the total number of archived changes.

## Proposed solution

- **`archive show`**: Update text output to display `specIds` and improve formatting of metadata.
- **`archive list`**:
  - Remove the `WORKSPACE` column from the text output.
  - Implement pagination with `--limit` (default 100), `--page`, and `--start-at` (exclusive).
  - Add a summary line: "Showing X archived changes out of Y. Increase limit or specify another page."
- **Core Performance**:
  - Introduce `.specd-index-meta.json` to store the total count of archived changes.
  - Update `ArchiveRepository` to manage this meta file during archiving and re-indexing.
  - Update `ListArchived` and `ArchiveRepository.list()` to support pagination options.

## Specs affected

### New specs

- none

### Modified specs

- `cli:archive-show`: Update output display requirements.
  - Depends on (added): none
- `cli:archive-list`: Remove `WORKSPACE` requirement, add pagination requirements (`--limit`, `--page`, `--start-at`), and update output summary requirements.
  - Depends on (added): none
- `core:archive-change`: Update to ensure `.specd-index-meta.json` is maintained during archiving.
  - Depends on (added): none
- `core:list-archived`: Update to support pagination input.
  - Depends on (added): none
- `core:archive-repository-port`: Add pagination support to `list()` and introduce meta file management.
  - Depends on (added): none

## Impact

- **CLI**: `archive show` and `archive list` commands.
- **Core Application**: `ArchiveChange` and `ListArchived` use cases.
- **Core Infrastructure**: `FsArchiveRepository` (meta file management, paginated index reading).
- **Data Model**: New `.specd-index-meta.json` file in the archive root.

## Technical context

- `ArchiveRepository.list()` currently reads the entire `index.jsonl`. For pagination, it might still read it (as it's JSONL) but should return a sliced result and the total count.
- `.specd-index-meta.json` will contain `{ totalCount: number }`.
- `start-at` is an exclusive cursor based on the archived change name (or slug).

## Open questions

- none
