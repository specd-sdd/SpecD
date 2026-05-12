# Tasks: improve-graph-search-discovery

## 1. Implementation

- [x] 1.1 Update SQLite sanitization logic to use OR
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `sanitizeFtsQuery` — change token joining from `AND` to `OR` to enable discovery mode.
      Approach: Replace `tokens.join(' AND ')` with `tokens.join(' OR ')`.
      (Req: SQLite full-text search)
- [x] 1.2 Update Ladybug sanitization logic to use OR
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `sanitizeFtsQuery` — change token joining from `AND` to `OR` to enable discovery mode.
      Approach: Replace `tokens.join(' AND ')` with `tokens.join(' OR ')`.
      (Req: Full-text search implementation)

## 2. Verification

- [x] 2.1 Add SQLite integration test for discovery and precision
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: new test cases — verify multi-term queries return results from different files and rank density higher.
      Approach: Add tests for "Multi-token search uses OR logic for discovery" and "BM25 ranking prioritizes multiple matches for precision" scenarios.
- [x] 2.2 Manual E2E verification
      CLI: `graph search` — verify that terms in different symbols are now discoverable together.
      Approach: Run `node packages/cli/dist/index.js graph search "effectiveStatus findBlockingParent" --symbols` and confirm symbols for both terms are returned.
