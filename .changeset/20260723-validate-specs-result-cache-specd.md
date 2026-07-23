---
'@specd/specd': patch
---

20260723 - validate-specs-result-cache: Cache ValidateSpecs results under fs-cache with mtime+fingerprint freshness to skip expensive revalidation on spec validate --all

Modified packages:

- @specd/core
- @specd/code-graph

Specs affected:

- `core:validate-specs`
- `core:storage`
- `core:validation-result-cache-port`
- `core:spec-repository-port`
- `core:fs-spec-repository`
- `core:get-spec`
- `core:search-specs`
- `core:spec-lock`
- `core:spec-metadata`
- `code-graph:workspace-integration`
- `default:_global/conventions`
