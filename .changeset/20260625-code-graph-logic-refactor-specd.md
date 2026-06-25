---
'@specd/specd': patch
---

20260625 - code-graph-logic-refactor: Refactor code-graph business logic from cli to code-graph package for reuse across adapters.

Modified packages:

- @specd/cli
- @specd/code-graph

Specs affected:

- `cli:graph-index`
- `cli:graph-stats`
- `cli:graph-impact`
- `code-graph:traversal`
- `code-graph:staleness-detection`
- `code-graph:composition`
