---
    "@specd/core": minor
    "@specd/cli": minor
---

20260527 - archived-change-read-only: Make archived changes readable via a full read-only ArchivedChange loaded from archive manifests, while keeping index-based ArchivedChangeIndexEntry for fast listing. This change splits the archive read models, updates the ArchiveRepository port and FsArchiveRepository implementation, and enhances the CLI archive show command to display rich details from the archived manifest.

Specs affected:

- `core:archive-repository-port`
- `core:get-archived-change`
- `core:list-archived`
- `cli:archive-show`
- `cli:archive-list`
- `core:archived-change-index-entry`
