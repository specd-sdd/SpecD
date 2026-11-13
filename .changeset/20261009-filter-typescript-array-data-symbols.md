---
'@specd/code-graph': minor
---

20261009 - filter-typescript-array-data-symbols: Prevents anonymous object properties inside array data records from being indexed as code symbols by the TypeScript adapter, while retaining callable members and scalar properties on named dictionaries. The implementation preserves parser-derived ranges, deterministic analysis, and full source-content indexing, with coverage for wrapper expressions, nested records, callable boundaries, and indexed search.

Specs affected:

- `code-graph:typescript-language-adapter`
