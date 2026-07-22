# Tasks: remove-fs-cache-ttl

## 1. Spec deltas

- [x] 1.1 Validate fs-change-repository spec delta
      `specd-sdd/changes/20260722-170914-remove-fs-cache-ttl/deltas/core/fs-change-repository/spec.md.delta.yaml`
      Approach: confirm merged preview shows two-step freshness (no TTL step 3)
      (Req: Index freshness model)

- [x] 1.2 Validate fs-spec-repository and fs-archive-repository spec deltas
      `deltas/core/fs-spec-repository/spec.md.delta.yaml`, `deltas/core/fs-archive-repository/spec.md.delta.yaml`
      Approach: confirm merged text states no max-age TTL
      (Req: FsSpecIndexCache helper, Archive list index in fs-cache)

## 2. Core implementation

- [x] 2.1 Remove INDEX_TTL_MS constant
      `packages/core/src/infrastructure/fs/fs-index-cache-base.ts`: `INDEX_TTL_MS`
      Approach: delete the exported constant and its JSDoc comment
      (Req: Index freshness model)

- [x] 2.2 Simplify \_ensureFresh freshness sequence
      `packages/core/src/infrastructure/fs/fs-index-cache-base.ts`: `FsIndexCache._ensureFresh()`
      Approach: after `_isStale(meta)` returns false, return immediately; remove the `Date.now() - Date.parse(meta.generatedAt) > INDEX_TTL_MS` block
      (Req: Index freshness model)

- [x] 2.3 Update FsIndexCache documentation comments
      `packages/core/src/infrastructure/fs/fs-index-cache-base.ts`: class and `_ensureFresh` JSDoc
      Approach: replace "invalidated/mtime/TTL" wording with "invalidated/mtime" only
      (Req: Index freshness model)

## 3. Tests

- [x] 3.1 Remove TTL expiry unit test
      `packages/core/test/infrastructure/fs/fs-index-cache-base.spec.ts`
      Approach: delete `'rebuilds when TTL expires'` test and `INDEX_TTL_MS` import
      (Req: Index freshness model — removed TTL scenario)

- [x] 3.2 Add fresh-stamps-serve-despite-age test
      `packages/core/test/infrastructure/fs/fs-index-cache-base.spec.ts`
      Approach: fake timers; upsert with matching mtime; advance 300_001 ms; call `list()`; assert `rebuildCalls === 0`
      (Req: Index freshness model — Fresh stamps serve without time-based rebuild)

- [x] 3.3 Run fs-cache and repository test suites
      `packages/core/test/infrastructure/fs/`
      Approach: `pnpm --filter @specd/core test` scoped to fs-index-cache-base and repository specs
      (Req: all verify scenarios)

## 4. Verify deltas

- [x] 4.1 Validate verify deltas for all three specs
      `deltas/core/*/verify.md.delta.yaml`
      Approach: confirm TTL scenario removed from fs-change-repository; positive no-rebuild-on-age scenarios added for all three
      (Req: verify scenarios)
