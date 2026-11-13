---
    "@specd/code-graph": patch
    "@specd/core": patch
    "@specd/sdk": patch
    "@specd/cli": patch
---

20261027 - bound-indexer-ast-resource-lifecycle: Bounded AST root lifetime per file with ParserResourceScope and per-file size limits (default 256 KiB, configurable via graph.maxFileBytes and graph.largeFilePaths exemptions), presentation-neutral typed indexing events, worker silence watchdog (10s threshold) and classified failure diagnostics. Note: Files strictly exceeding 256 KiB (262,144 bytes) are no longer indexed by default; to restore the previous behavior or index specific oversized files, set graph.maxFileBytes: 0 to disable the limit globally or list file patterns in graph.largeFilePaths. The first index run after upgrading rebuilds the graph, because the effective size settings are part of the derivation fingerprint. Graph health also gains coverageCompleteness and coverageWarnings, so a graph with size-skipped files is reported as complete-with-warnings instead of plainly complete.

Specs affected:

- `code-graph:indexer`
- `code-graph:isolated-index-worker`
- `core:config`
- `core:config-loader`
- `code-graph:index-project-graph`
- `code-graph:language-adapter`
- `sdk:run-index-project-graph`
- `cli:graph-index`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:get-graph-health`
- `cli:graph-stats`
