---
    "@specd/cli": minor
    "@specd/code-graph": minor
    "@specd/core": minor
---

20260602 - improve-code-graph-path-search: This change strengthens code-graph discovery, indexing, and search semantics across CLI, core, and both graph-store backends. It adds exact-match-aware graph search, searchable document nodes, normalized selector handling, and unified workspace orchestration through core. It also formalizes effective graph discovery config with global include/exclude rules, automatic filesystem-backed spec-root exclusion, stable workspace-vs-root ownership, and consistent fingerprinting/stat reporting.

Specs affected:

- `cli:graph-search`
- `cli:graph-impact`
- `code-graph:composition`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
- `cli:graph-index`
- `code-graph:indexer`
- `code-graph:symbol-model`
- `code-graph:graph-store`
- `core:config`
- `code-graph:document-model`
- `core:spec-repository-port`
- `core:list-workspaces`
- `core:list-specs`
- `core:search-specs`
- `core:get-spec-context`
- `core:spec-metadata`
- `cli:project-status`
- `cli:spec-list`
- `cli:spec-search`
- `cli:graph-stats`
- `core:workspace`
