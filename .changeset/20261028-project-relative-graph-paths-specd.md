---
'@specd/specd': minor
---

20261028 - project-relative-graph-paths: Interprets every path and pattern in specd.yaml relative to the project root across all graph keys and levels, so a pattern always refers to the same file wherever it is evaluated. Workspace-local excludes can no longer override global ones. Adds a graph why command (cli -> sdk -> code-graph ExplainGraphPath) that reports which rule excludes or classifies a path, using the same evaluation functions as the indexer.

Modified packages:

- @specd/core
- @specd/code-graph
- @specd/cli
- @specd/sdk

Specs affected:

- `core:config`
- `code-graph:indexer`
- `code-graph:workspace-integration`
- `cli:graph-index`
- `code-graph:explain-graph-path`
- `sdk:run-graph-why`
- `cli:graph-why`
