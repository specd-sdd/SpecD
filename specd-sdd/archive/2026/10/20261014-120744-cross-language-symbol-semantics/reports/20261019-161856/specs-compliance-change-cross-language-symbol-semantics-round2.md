# Compliance report (round 2) — cross-language-symbol-semantics

Re-verification after round-4 corrections. Method: round-1 reviewer findings (119 scenarios)
re-checked against the new tests/code, plus full build, typecheck, eslint and test runs
(code-graph 1215, cli 1142, sdk 120, core 2526: all green).

## Closed

- FAIL imported hierarchy provenance range: relation and shared fact now carry the written
  clause-expression range in TS, Python and PHP (tests with multi-base classes).
- SDK export covering specs: projected `coveringSpecs` on resolved exports; CLI text/JSON.
- Barrel drift: composition spec lists the exact runtime export set (checked mechanically
  against dist/public.js; the 7 isolated-worker errors are covered by the subclass clause).
- `files` search category: scenario clarified to the GraphStore contract; test pins that
  `files` comes only from source-content search.
- Previously UNVERIFIED: manifest isolation (4 languages), broken-source handling (4
  languages; fixed a Python bug that emitted a symbol for a broken def), TS call
  initializer / multiline imports, PHP method-local caller / compact classes / brace
  lookalikes, traversal shallowest depth + deduplicated coverage frontier, physical-only
  declaration retrievable (memory + SQLite), FileNode.projectRelativePath incl. `../`,
  stale-lock rename race, CLI `declaration impact` label and nested structured evidence.
- Tautological identity tests replaced by real-adapter tests.

## Residual (minor, not blocking)

- `graph index` without `--force` against a SCHEMA_INCOMPATIBLE shape-mismatch database is
  covered only on the `force: true` path.
- Graph index was stale at audit time (uncommitted work), so navigation was by reading code.
- PHP tests were rebuilt after an accidental checkout; original coverage may have been
  broader.
