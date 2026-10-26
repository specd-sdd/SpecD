---
'@specd/specd': patch
---

20261026 - optimize-language-adapter-ast-traversals: Eliminate O(M\*N) AST traversals in language adapter member semantics and scope resolution to prevent indexing freezes on large files

Modified packages:

- @specd/code-graph

Specs affected:

- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
