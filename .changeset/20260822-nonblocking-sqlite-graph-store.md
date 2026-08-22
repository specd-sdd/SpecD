---
    "@specd/code-graph": patch
    "@specd/cli": patch
---

20260822 - nonblocking-sqlite-graph-store: Move all synchronous better-sqlite3 work (queries, schema, FTS, bulk commits) into one dedicated persistent worker thread behind a typed RPC protocol with bounded backpressure, keeping the CLI event loop responsive during indexing and impact queries. Introduces storage-neutral exact batch node APIs (getSymbolsByIds/getFilesByPaths/getDocumentsByPaths/getSpecsByIds), batched traversal and hotspot-hierarchy reads, pure display-path projection in the CLI, and bounded concurrency where no batch representation exists — eliminating the STORE_OVERLOAD failures observed on wide real-repository graphs. Verified end-to-end against six affected specs with wide-graph low-limit regressions (maxPendingOperations 16/32) and real-workload runs.

Specs affected:

- `code-graph:sqlite-graph-store`
- `code-graph:composition`
- `code-graph:graph-store`
- `code-graph:traversal`
- `cli:graph-impact`
- `cli:graph-hotspots`
