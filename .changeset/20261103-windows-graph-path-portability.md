---
'@specd/code-graph': minor
---

20261103 - windows-graph-path-portability: Introduce portable graph-path helpers (resolveGraphPath, UNC/drive absolute detection) so Windows FS resolves match forward-slash graph keys. Adopts them in PHP require/include and explain drive-letter outsides, hardens TS/Python relative imports, and unblocks Windows CI path-identity failures without test-only skips for separators.

Specs affected:

- `code-graph:graph-path-identity`
- `code-graph:php-language-adapter`
- `code-graph:explain-graph-path`
- `code-graph:typescript-language-adapter`
- `code-graph:python-language-adapter`
