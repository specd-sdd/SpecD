---
'@specd/code-graph': patch
---

20261008 - fix-sqlite-delete-file-variable-limit: Hardens SQLite graph-store cleanup and collection-backed reads against SQLite's host-parameter limit by replacing file-local symbol expansion with subqueries and applying budget-aware worker-side chunking. It preserves atomic mutation, deterministic lookup, and empty-batch behavior, with regressions for large-file cleanup and direct upsert rollback after cleanup begins.

Specs affected:

- `code-graph:sqlite-graph-store`
