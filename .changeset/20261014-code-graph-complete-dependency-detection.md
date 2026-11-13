---
'@specd/code-graph': minor
---

20261014 - code-graph-complete-dependency-detection: Complete language adapter symbol extraction across TypeScript, Go, Python, and PHP with first-class Property kind and lexical scope stack management. Resolve overload sets cleanly across files and in selector resolution without false ambiguity, and add kind-tiered search ranking and interface hotspot filtering.

Specs affected:

- `code-graph:symbol-model`
- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:indexer`
- `code-graph:hotspots`
- `code-graph:sqlite-graph-store`
