---
    "@specd/code-graph": minor
    "@specd/cli": minor
    "@specd/sdk": minor
---

20260928 - language-agnostic-member-symbol-references: Code Graph stores a language-neutral dotted qualified name beside each owned logical member and matches Tipo.miembro and Tipo::miembro by equality in graph search and graph impact. Search still runs the original query through the existing symbol and full-text path, and impact lists every equal match instead of guessing one. Schema 12 indexes that spelling and rebuilds older derived storage.

Specs affected:

- `code-graph:symbol-model`
- `code-graph:language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `code-graph:indexer`
- `code-graph:composition`
- `code-graph:traversal`
- `cli:graph-search`
- `cli:graph-impact`
- `sdk:build-implementation-review`
