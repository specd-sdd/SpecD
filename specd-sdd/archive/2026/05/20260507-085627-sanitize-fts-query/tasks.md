# Tasks: sanitize-fts-query

## 1. FTS sanitization utility

- [x] 1.1 Create `sanitizeFtsQuery()` pure function
      `packages/code-graph/src/infrastructure/sanitize-fts-query.ts`: new file — exports `sanitizeFtsQuery(query: string): string`
      Approach: trim input, split on whitespace, filter empty tokens, wrap each in double quotes (doubling internal quotes), join with `AND`. Return empty string if no tokens.
      (Req: SQLite full-text search, Full-text search implementation)

- [x] 1.2 Add unit tests for `sanitizeFtsQuery()`
      `packages/code-graph/test/infrastructure/sanitize-fts-query.spec.ts`: new file — tests for simple words, multiple words, hyphenated terms, FTS operators, special characters, empty/whitespace input
      Approach: test each edge case — `"hello"` → `"\"hello\""`, `"pending-parent-artifact-review"` → `"\"pending-parent-artifact-review\""`, `"AND OR NOT"` → `"\"AND\" OR \"NOT\""`, empty string stays empty
      (Req: SQLite full-text search, scenario: queries with hyphens do not crash FTS5)

## 2. SQLite FTS integration

- [x] 2.1 Apply `sanitizeFtsQuery()` in `SQLiteGraphStore.searchSymbols()`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSymbols()` (line 447) — apply `sanitizeFtsQuery(options.query)` before passing to MATCH
      Approach: replace `const query = options.query.trim()` with `const query = sanitizeFtsQuery(options.query)`. Import `sanitizeFtsQuery` from `../sanitize-fts-query.js`.
      (Req: SQLite full-text search)

- [x] 2.2 Apply `sanitizeFtsQuery()` in `SQLiteGraphStore.searchSpecs()`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSpecs()` (line 505) — same change as 2.1
      Approach: identical pattern — `const query = sanitizeFtsQuery(options.query)`.
      (Req: SQLite full-text search)

- [x] 2.3 Add SQLite search tests for FTS sanitization
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: add describe block for FTS sanitization edge cases
      Approach: test search with hyphenated query, FTS operators as literals, special characters. Verify no `SqliteError` thrown and results returned.
      (Req: SQLite full-text search, scenario: queries with hyphens do not crash FTS5, scenario: queries with FTS5 operators are treated as literal text)

## 3. Ladybug FTS integration

- [x] 3.1 ~~Apply `sanitizeFtsQuery()` in `LadybugGraphStore.searchSymbols()`~~ — SKIPPED: Ladybug FTS normalizes queries internally (replaces special chars with spaces, lowercases, then tokenizes). No FTS sanitization needed.
- [x] 3.2 ~~Apply `sanitizeFtsQuery()` in `LadybugGraphStore.searchSpecs()`~~ — SKIPPED: same reason as 3.1

- [x] 3.3 ~~Add Ladybug search tests for FTS sanitization~~ — SKIPPED: Ladybug FTS normalizes queries internally, no sanitization tests needed

## 4. Ladybug prepared statement migration — helpers

- [x] 4.1 Create prepared statement helper method in `LadybugGraphStore`
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: new private method `prepareExec(query: string, params: Record<string, LbugValue>)` — prepares and executes with params
      Approach: `const stmt = await this.conn!.prepare(query); return getAll(await this.conn!.execute(stmt, params))`. Use `prepareSync`/`executeSync` if synchronous variants are needed. Cache prepared statements for hot paths.
      (Req: Prepared statement usage)

- [x] 4.2 Update `exec()` helper to support prepared statements
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `exec()` (line 38) — keep for DDL/static queries, add `execPrepared()` alongside
      Approach: `exec()` stays as-is for `conn.query()` (DDL, COPY, static queries). New `execPrepared()` uses `conn.prepare()` + `conn.execute()`.
      (Req: Prepared statement usage, scenario: DDL and COPY queries may use direct conn.query)

## 5. Ladybug prepared statement migration — simple lookups

- [x] 5.1 Migrate `getFile()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getFile()` (line 563) — replace interpolation with `$path` param
      Approach: `MATCH (f:File {path: $path}) RETURN ...` with `execPrepared(query, { path })`.
      (Req: Prepared statement usage, scenario: user-supplied values are bound via prepared statement parameters)

- [x] 5.2 Migrate `findFilesByConfigRelativePath()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `findFilesByConfigRelativePath()` (line 586) — `$configRelativePath` param
      (Req: Prepared statement usage)

- [x] 5.3 Migrate `getSymbol()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getSymbol()` (line 607) — `$id` param
      (Req: Prepared statement usage)

- [x] 5.4 Migrate `getSpec()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getSpec()` (line 622) — `$specId` param
      (Req: Prepared statement usage)

- [x] 5.5 Migrate `getExportedSymbols()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getExportedSymbols()` (line 773) — `$filePath` param
      (Req: Prepared statement usage)

## 6. Ladybug prepared statement migration — relation queries

- [x] 6.1 Migrate `getImporters()` and `getImportees()` to prepared statements
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getImporters()` (line 681), `getImportees()` (line 700) — `$filePath` param
      (Req: Prepared statement usage)

- [x] 6.2 Migrate `getSpecDependencies()` and `getSpecDependents()` to prepared statements
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `getSpecDependencies()` (line 795), `getSpecDependents()` (line 814) — `$specId` param
      (Req: Prepared statement usage)

- [x] 6.3 Migrate `getIncomingSymbolRelations()` and `getOutgoingSymbolRelations()` to prepared statements
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: private methods (lines 1254, 1277) — `$symbolId` param, keep `relationType` interpolated from enum
      Approach: relationship type labels from `RelationType` enum are compile-time constants — may remain interpolated per design decision. Only user-supplied `symbolId` goes through `$param`.
      (Req: Prepared statement usage, scenario: relation type labels remain as compile-time constants)

## 7. Ladybug prepared statement migration — mutations

- [x] 7.1 Migrate `upsertFile()` node creation to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `upsertFile()` (line 260) — `$path`, `$configRelativePath`, `$language`, `$contentHash`, `$workspace` params
      (Req: Prepared statement usage)

- [x] 7.2 Migrate `upsertSpec()` node creation to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `upsertSpec()` (line 523) — all Spec properties as `$param`
      (Req: Prepared statement usage)

- [x] 7.3 Migrate `deleteFileLocalState()` and `deleteSpecLocalState()` to prepared statements
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `deleteFileLocalState()` (line 168), `deleteSpecLocalState()` (line 193) — `$escaped`/`$specId` params
      (Req: Prepared statement usage)

- [x] 7.4 Migrate `createRelation()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `createRelation()` (line 1188) — `$source`, `$target` params, keep type label from enum
      (Req: Prepared statement usage)

- [x] 7.5 Migrate `updateMeta()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `updateMeta()` (line 1300) — `$key`, `$value` params
      (Req: Prepared statement usage)

- [x] 7.6 Migrate `findSymbols()` to prepared statement
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `findSymbols()` (line 833) — all dynamic WHERE values as `$param`
      (Req: Prepared statement usage)

## 8. Ladybug prepared statement migration — cleanup

- [x] 8.1 Remove `this.escape()` method
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `escape()` (line 1310) — delete once all query methods are migrated
      Approach: verify no callers remain via search, then remove the method and any references.
      (Req: Prepared statement usage)

## 9. Build and integration verification

- [x] 9.1 Build and run all code-graph tests
      Approach: `pnpm --filter @specd/code-graph build && pnpm --filter @specd/code-graph test`. Verify no regressions.
      (Req: SQLite full-text search, Full-text search implementation, Prepared statement usage)

- [x] 9.2 Run lint and typecheck
      Approach: `pnpm lint && pnpm typecheck`. Fix any issues.
      (Req: all)
