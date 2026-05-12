---
'@specd/core': patch
---

20260512 - sync-archive-gitignore-with-runtime-artifacts: Move archive-local ignore ownership from init bootstrap to archive runtime so the archive directory remains self-healing when index artifacts are recreated. FsArchiveRepository now ensures .gitignore entries for .specd-index.jsonl and .staging across archive(), reindex(), and recovery/append index paths. InitProject keeps directory/bootstrap responsibilities but no longer writes archive-local ignore entries, with tests updated to verify the new boundary.

Specs affected:

- `core:storage`
- `core:init-project`
- `core:archive-repository-port`
