---
'@specd/specd': minor
---

20260816 - implementation-review-symbol-resolution: Provide conservative multilang symbol resolution for implementation review and impact across public exports, aliases, members, and inheritance.

Modified packages:

- @specd/cli
- @specd/code-graph
- @specd/core

Specs affected:

- `cli:change-implementation`
- `code-graph:resolve-symbol-reference`
- `sdk:build-implementation-review`
- `code-graph:symbol-model`
- `code-graph:language-adapter`
- `code-graph:traversal`
- `code-graph:composition`
- `cli:graph-impact`
- `code-graph:graph-store`
- `cli:graph-search`
- `code-graph:indexer`
- `code-graph:staleness-detection`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
- `cli:change-status`
- `sdk:composition`
- `code-graph:get-graph-health`
- `code-graph:workspace-integration`
- `cli:graph-index`
- `sdk:run-index-project-graph`
- `code-graph:index-project-graph`
- `cli:graph-stats`
- `core:vcs-adapter-port`
- `core:vcs-implementation-detector`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
