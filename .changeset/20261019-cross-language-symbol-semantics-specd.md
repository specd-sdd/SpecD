---
'@specd/specd': patch
---

20261019 - cross-language-symbol-semantics: Unify symbol semantics across TypeScript, Python, Go and PHP in the code graph: logical vs physical symbol identity, public/local bindings, resolution steps and hierarchy provenance (clause ranges), with covering-spec evidence on exports. Hardens the graph runtime: index lock v2 with stale recovery, schema-shape validation with SCHEMA_INCOMPATIBLE recovery, typed selector targets with an unresolved status, and updated SDK/CLI impact output and docs.

Modified packages:

- @specd/code-graph
- @specd/sdk
- @specd/cli

Specs affected:

- `code-graph:symbol-model`
- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:traversal`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `code-graph:indexer`
- `code-graph:composition`
- `sdk:run-graph-impact`
- `cli:graph-impact`
- `code-graph:staleness-detection`
- `code-graph:isolated-index-worker`
