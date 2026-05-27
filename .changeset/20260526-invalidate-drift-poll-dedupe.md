---
'@specd/core': patch
---

20260526 - invalidate-drift-poll-dedupe: Deduplicate artifact-drift invalidation during repeated change loads so status polling and repository reads stop rewriting manifests when the drift scope has not changed. The implementation makes artifact-drift invalidation idempotent in the domain, prevents no-op manifest writes during drift reconciliation and implementation-tracking refresh, and preserves honest polling behavior while keeping drift flags and validation recovery intact.

Specs affected:

- `core:change`
- `core:change-repository-port`
- `core:kernel`
- `core:get-status`
