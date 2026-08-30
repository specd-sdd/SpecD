---
'@specd/specd': patch
---

20260827 - repair-code-graph-coverage-indexing: Make forced and incremental code-graph indexing rebuild and preserve file and logical-symbol coverage, and detect inconsistent graph health.

Modified packages:

- @specd/code-graph
- @specd/cli

Specs affected:

- `code-graph:indexer`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `code-graph:get-graph-health`
- `cli:graph-index`
