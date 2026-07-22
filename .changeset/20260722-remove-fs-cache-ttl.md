---
'@specd/core': patch
---

20260722 - remove-fs-cache-ttl: Remove the 5-minute TTL from fs-cache index freshness; rely on invalidation flag and mtime comparison only.

Specs affected:

- `core:fs-change-repository`
- `core:fs-spec-repository`
- `core:fs-archive-repository`
