---
'@specd/specd': minor
---

20260825 - centralize-graph-index-worker: Centralizes graph-index isolation, locking, IPC validation, and child-process lifecycle inside Code Graph, with a curated SDK facade and a CLI delivery task. It separates forced logical reindexing from closed-store physical recovery, preserves typed recovery diagnostics and materialized spec metadata, and adds regression coverage for worker startup, protocol, backpressure, cleanup, and SQLite recovery paths.

Modified packages:

- @specd/code-graph
- @specd/cli

Specs affected:

- `code-graph:isolated-index-worker`
- `sdk:composition`
- `cli:graph-index`
- `code-graph:composition`
- `code-graph:index-project-graph`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `sdk:run-index-project-graph`
- `sdk:with-open-graph-provider`
