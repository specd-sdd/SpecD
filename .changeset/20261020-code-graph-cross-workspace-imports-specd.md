---
'@specd/specd': minor
---

20261020 - code-graph-cross-workspace-imports: Resolve package-specifier imports across workspaces through each package's published entry surface instead of a same-name search, so impact, hotspots, and coverage see cross-package dependents. The public `LanguageAdapter` contract now declares resolution services as facets, registration validates adapter shape, and a later registration for a language replaces the earlier adapter.

Modified packages:

- @specd/code-graph
- @specd/sdk
- @specd/cli

Specs affected:

- `code-graph:language-adapter`
- `code-graph:workspace-integration`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:resolve-symbol-reference`
- `code-graph:indexer`
