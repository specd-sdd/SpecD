# ADR 0022: Split archive index and detail models

## Status

Proposed

## Context

Archived changes in `specd` were previously exposed through a slim `ArchivedChange` projection built solely from an `index.jsonl` file. This index-only approach enabled fast listing of thousands of archived changes but discarded rich metadata (description, history, artifact status, directory paths) present in each change's archived `manifest.json`.

As the platform evolved, teams needed to audit and diff past work through the CLI (`archive show`) and API read models, mirroring the rich read-only views already implemented for drafted and discarded changes.

## Decision

We split the archive read model into two distinct types based on access pattern:

1.  **`ArchivedChangeIndexEntry`**: A lightweight record for the `list()` port and index-driven UIs. It is constructed from the archive index without reading per-entry manifests.
2.  **`ArchivedChange`**: A full read-only detail model loaded from the archived `manifest.json`. It extends the shared `ReadOnlyChangeView` contract and includes archive-specific metadata (`archivedName`, `archivedAt`, `archivedBy`).

The `ArchiveRepository` port and its filesystem implementation (`FsArchiveRepository`) are updated to enforce this split: `list()` remains O(1) per entry (index-backed), while `get(name)` performs manifest I/O to return the full detail.

## Consequences

- **Rich Inspection**: The `archive show` command now displays a full overview of archived changes, including description, artifacts, and history summary.
- **Performance Preservation**: Listing commands remain fast as they are explicitly prevented from performing manifest I/O.
- **Type Safety**: The split prevents use cases from accidentally depending on rich fields during listing operations that are not backed by manifest reads.
- **Consistency**: The archive inspection pattern now aligns with the `drafts/` and `discarded/` lifecycle read paths.
