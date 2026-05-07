---
'@specd/specd': patch
---

20260507 - sanitize-fts-query: Add sanitizeFtsQuery() to SQLite searchSymbols and searchSpecs to prevent FTS5 syntax errors on hyphenated or special-character queries. Migrate LadybugGraphStore from manual string interpolation (this.escape()) to prepared statements (conn.prepare() + $param bindings) for all parameterized queries, removing the escape() method entirely. Both stores now handle user search input safely without requiring API changes.

Modified packages:

- @specd/code-graph

Specs affected:

- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
