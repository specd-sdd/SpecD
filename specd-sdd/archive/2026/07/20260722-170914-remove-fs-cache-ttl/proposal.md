# Proposal: remove-fs-cache-ttl

## Motivation

Filesystem list-index caches (`FsIndexCache` and bucket wrappers) apply a fixed 5-minute TTL as a third freshness check after invalidation and mtime comparison. That TTL forces periodic full rebuilds even when on-disk stamps are fresh, adding avoidable I/O with little correctness benefit now that every `list()`/`count()` already scans disk mtimes and write paths maintain the index.

## Current behaviour

On `list()` / `count()`, each fs-cache bucket helper applies:

1. `isInvalidated` → rebuild
2. mtime / `sourceFiles` mismatch → rebuild
3. `now - generatedAt > 300_000` ms → rebuild (even when stamps match)
4. serve from index

The TTL was introduced as a max-age safety net when VCS-based freshness was dropped during repository cache normalization. With explicit `invalidateCache()`, write-path upserts, and per-read stamp comparison, step 3 is largely redundant.

## Proposed solution

Remove the TTL step. Freshness becomes:

1. `isInvalidated` → rebuild
2. stamp mismatch → rebuild
3. serve from index

Delete `INDEX_TTL_MS` and the TTL branch in `FsIndexCache._ensureFresh()`. Update the three fs-repository specs that define or inherit freshness rules. Keep `generatedAt` in meta for observability.

External edits that preserve mtimes remain an edge case; callers use `invalidateCache()` or `specd storage reindex` as today.

## Specs affected

### New specs

_none_

### Modified specs

- `core:fs-change-repository`: Remove TTL from "Index freshness model" requirement; remove TTL verify scenario.
  - Depends on (added): none
  - Depends on (removed): none

- `core:fs-spec-repository`: Clarify inherited freshness is invalidation + mtime only (no max-age TTL).
  - Depends on (added): none
  - Depends on (removed): none

- `core:fs-archive-repository`: Clarify inherited freshness is invalidation + mtime only (no max-age TTL).
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Code:** `packages/core/src/infrastructure/fs/fs-index-cache-base.ts` (remove constant and TTL branch); `packages/core/test/infrastructure/fs/fs-index-cache-base.spec.ts` (remove TTL test).
- **Behaviour:** Indexes no longer rebuild solely because `generatedAt` is older than 5 minutes when stamps still match. All other freshness paths unchanged.
- **APIs:** No public API changes. `Repository.invalidateCache()` and `reindex()` unchanged.

## Technical context

- TTL constant: `INDEX_TTL_MS = 300_000` in `fs-index-cache-base.ts:13`.
- `_ensureFresh()` runs `_isStale()` (full stamp scan) before the TTL check, so TTL only adds rebuilds when stamps say "fresh".
- Bucket wrappers (`FsChangeIndexCache`, `FsSpecIndexCache`, `FsArchiveIndexCache`) delegate to `FsIndexCache`; no bucket-specific TTL logic.
- `core:storage` does not mention TTL; no delta required unless design adds a cross-cutting note.

**Alternatives rejected:**

- Increase TTL — reduces frequency but not redundancy.
- Configurable TTL — unnecessary complexity; rejected in the original cache normalization change.
- Keep TTL as safety net — user confirmed removal after analysis.

## Open questions

_none_
