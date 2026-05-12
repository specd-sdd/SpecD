# Proposal: sanitize-fts-query

## Motivation

Graph search crashes at runtime when user queries contain hyphens or other FTS5 syntax characters. The `graph search` CLI command passes raw query strings to SQLite FTS5 MATCH and Ladybug FTS without any sanitization, causing `SqliteError: no such column: parent` for queries like `pending-parent-artifact-review` where FTS5 interprets hyphens as NOT operators.

Additionally, a full audit revealed that `LadybugGraphStore` uses manual string interpolation with `this.escape()` for all 38 database methods instead of LadybugDB's native prepared statement support (`conn.prepare()` + `conn.execute()` with `$param` bindings). This is fragile compared to the parameterized query approach used by `SQLiteGraphStore`.

## Current behaviour

### FTS query sanitization (both stores)

Both `searchSymbols()` and `searchSpecs()` in `SQLiteGraphStore` (lines 447, 505) and `LadybugGraphStore` (lines 999, 1048) pass the user query string directly to their FTS engine after only a `.trim()` (SQLite) or `this.escape()` (Ladybug, which escapes Cypher string characters but not FTS operators).

FTS5 interprets special characters in the query:

- `-` as the NOT boolean operator
- `AND`, `OR`, `NOT` as boolean operators
- `column:term` as column filter syntax (causing "no such column" errors)
- `*` as a prefix wildcard
- `"..."` as phrase queries

A query like `pending-parent-artifact-review` is parsed as `pending NOT parent NOT artifact NOT review`, and `parent` is treated as a column name, producing `SqliteError: no such column: parent`.

### Ladybug query safety

`LadybugGraphStore` constructs all Cypher queries via string interpolation, relying on a manual `this.escape()` function that only escapes `\`, `'`, `\n`, `\r`. LadybugDB natively supports prepared statements with `$param` syntax and `conn.prepare()` + `conn.execute(stmt, { key: value })` — the equivalent of SQLite's `db.prepare(sql).run(params)`. The current code does not use this capability at all.

## Proposed solution

1. **FTS sanitization**: Add a shared `sanitizeFtsQuery()` pure function that wraps each whitespace-separated search token in double quotes (FTS phrase literal) and joins them with `AND`. Apply in both `searchSymbols()` and `searchSpecs()` of both stores.

2. **Ladybug prepared statements**: Migrate `LadybugGraphStore` from string interpolation + `this.escape()` to LadybugDB's prepared statement API (`conn.prepare()` + `conn.execute()` with `$param` bindings). This eliminates the manual escaping entirely for user-supplied values.

## Specs affected

### New specs

_none_

### Modified specs

- `code-graph:sqlite-graph-store`: add a requirement that `searchSymbols()` and `searchSpecs()` MUST sanitize the FTS query string before passing it to the FTS5 MATCH clause, preventing FTS syntax interpretation of user input
  - Depends on (added): none

- `code-graph:ladybug-graph-store`: add requirements that (1) `searchSymbols()` and `searchSpecs()` MUST sanitize the FTS query string before passing it to the Ladybug FTS engine, and (2) all query methods MUST use LadybugDB prepared statements with `$param` bindings instead of string interpolation with manual escaping
  - Depends on (added): none

## Impact

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` — `searchSymbols()`, `searchSpecs()`
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts` — all ~38 methods migrated from string interpolation to prepared statements; `searchSymbols()`, `searchSpecs()` also get FTS sanitization
- New shared FTS sanitization utility function
- The `this.escape()` method in `LadybugGraphStore` can be removed once all queries use prepared statements

No API changes. No data model changes. No breaking changes to search behavior for well-formed queries.

## Technical context

Full audit of all 59 SQLite methods and 38 Ladybug methods was performed:

**SQLite** — safe. All queries use `db.prepare(sql).get/all/run(params)` with `?` parameterized bindings. No string interpolation of user input.

**Ladybug** — all 38 methods use `conn.query(interpolatedString)` with `this.escape()`. The `lbug` npm package (v0.14.3) supports:

- `conn.prepare(statement: string)` → `PreparedStatement`
- `conn.execute(preparedStatement, params?: Record<string, LbugValue>)` → `QueryResult`
- Parameter syntax in Cypher: `$paramName`

The prepared statement API accepts `Record<string, LbugValue>` for params. Values are bound as data, not executable Cypher — identical safety model to SQLite's `?` bindings.

**FTS specifics**:

- The sanitization function is a pure function with no I/O — it belongs in infrastructure since both backends need it
- Wrapping tokens in double quotes is the standard FTS5 approach for literal matching
- The same approach works for Ladybug's FTS since it follows similar query semantics
- Post-query filtering (kinds, filePattern, workspace, excludes) is in-memory and unaffected

**Ladybug migration notes**:

- Some queries use table/label names from `RelationType` enum values (e.g., `MATCH ()-[r:${type}]->()`) — these are structural, not user input, and can remain interpolated or use string formatting since enum values are compile-time constants
- `COPY ... FROM "${csvPath}"` paths are internally generated — safe to remain as-is
- `createFtsIndex()` uses hardcoded table/index/column names — safe to remain as-is
- The `exec()` and `getAll()` helper functions will need to be updated or replaced with prepared-statement equivalents

## Open questions

_none_
