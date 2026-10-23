---
'@specd/code-graph': minor
---

20261023 - code-graph-package-resolution-hardening: Harden package resolution after code-graph-cross-workspace-imports: TS/Go prepare vs identity when the code root is below the package root, resolve-symbol-reference dotted-parser and deriveQualifiedName fallbacks beyond the spec, and missing tests (prepare read once, link without I/O, partial --workspace runs)

Specs affected:

- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:indexer`
- `code-graph:symbol-model`
- `code-graph:sqlite-graph-store`
- `code-graph:index-project-graph`
