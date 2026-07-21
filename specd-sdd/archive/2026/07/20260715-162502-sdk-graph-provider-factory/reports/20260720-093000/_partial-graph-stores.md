# Compliance audit — graph stores

## Scope and evidence

- Change: `sdk-graph-provider-factory`
- Specs reviewed from merged previews: `code-graph:graph-store`,
  `code-graph:ladybug-graph-store`, and `code-graph:sqlite-graph-store`.
- Code inspected: the `GraphStore` port plus both concrete stores and their search
  implementations.
- Dependency review: `GraphStore` has 29 affected files and CRITICAL graph impact;
  the two concrete stores have only factory and focused-test dependents.
- Tests inspected: shared graph-store contract and focused SQLite/Ladybug suites.

## Scenario status

| Area                                                        | Status | Evidence                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public reverse coverage API                                 | PASS   | `GraphStore`, `SQLiteGraphStore`, and `LadybugGraphStore` consistently expose `getCoveringSpecsForFile` and `getCoveringSpecsForSymbol`; the provider calls those names.                                                                                                                                                               |
| SQLite identity candidate retrieval                         | PASS   | All three SQLite searches union FTS candidates with identity-derived candidates before ranking. The implementation handles canonical spec IDs, symbol IDs/names, and document path/config-relative path.                                                                                                                               |
| SQLite identity ranking                                     | PASS   | Shared lexical expansion and exact/prefix/suffix/component/substring strength ordering are implemented. Focused test cases cover exact fallback without FTS and symbol token ordering.                                                                                                                                                 |
| SQLite search filters and snippets                          | PASS   | Filters are applied before `slice(limit)`; symbols derive snippets from persisted file content, and specs/documents return snippets with line ranges.                                                                                                                                                                                  |
| Ladybug reverse coverage relations                          | PASS   | Both reverse COVERS queries use the new API names and preserve relation metadata.                                                                                                                                                                                                                                                      |
| Ladybug search identity ranking when FTS returns candidates | PASS   | Symbols and documents rank with the shared identity-aware helper; specs rank their returned FTS candidates with it.                                                                                                                                                                                                                    |
| Ladybug strong identity discovery absent from FTS           | GAP    | `searchSymbols` supplements FTS candidates by scanning identities, but `searchSpecs` never supplements and `searchDocuments` is not truly FTS-backed. A strong spec-ID suffix/component identity hit that Ladybug FTS does not return is omitted, contrary to the backend-neutral `GraphStore` primary-identity discovery requirement. |

## Findings

### Medium — Ladybug `searchSpecs` can omit required identity candidates

The merged `code-graph:graph-store` contract says primary-identity ranking must not
narrow discovery to backend-native text candidates and allows/expect implementations
to supplement candidates where tokenization misses a strong identity match. In
`packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`,
`searchSymbols` explicitly performs that supplement, while `searchSpecs` consumes
only `QUERY_FTS_INDEX` rows. Thus a spec identity match that FTS tokenization misses
(notably suffix or structured-component behavior) cannot be ranked because it is not
a candidate. The same behavior is presently untested for Ladybug.

Recommended repair: extract/apply the existing identity candidate supplementation to
Ladybug specs too, respecting workspace and exclusion filters; add a regression that
simulates an FTS-missed suffix/component spec-ID hit. If the intentional product
decision is that the concrete legacy Ladybug adapter is exempt, narrow the abstract
GraphStore wording; its current wording applies to every implementation.

### Low — Ladybug document search does not match its own “full-text search” wording

`searchDocuments` iterates `getAllDocuments()` and counts tokens in concatenated
path/content instead of querying the documented `document_fts` structure. Observable
results currently satisfy identity ranking, but this is an implementation/spec
discrepancy and can be expensive on large stores. This predates the current delta;
it is reported because the scoped GraphStore contract requires document full-text
search. Either use the Ladybug FTS index with equivalent fallback candidates or
clarify the adapter's permitted implementation.

## Test evidence and gaps

- `pnpm --filter @specd/code-graph exec vitest run ...` executed the SQLite suite:
  **87/87 tests passed**. The process then failed with Vitest/tinypool
  `ERR_IPC_CHANNEL_CLOSED` before the requested shared/Ladybug files were reported,
  so this command is not clean suite-level evidence for those files.
- The regular package test invocation showed the same post-run IPC failure after
  SQLite passed. This appears runner/process-pool instability, not a reported
  assertion failure; it still blocks claiming a clean focused test command.
- Existing shared contract tests cover token expansion, identity ordering, snippets,
  and document results for `InMemoryGraphStore`. SQLite has explicit no-FTS exact
  identity tests plus token-strength tests. Ladybug lacks a no-FTS/identity-candidate
  test for specs and has no assertion that its document query uses its FTS index.

## Counts

- Reviewed specs: 3
- Production implementations: 3 (`GraphStore`, SQLite, Ladybug)
- Focused test files: 3
- Relevant behavior groups: 8 PASS, 1 GAP, 1 LOW discrepancy
- Verified assertion result: SQLite 87/87 passing; focused multi-file runner command
  exits non-zero due to the post-run IPC error.

## Audit conclusion

The change's GraphStore method-name correction and SQLite identity-candidate repair
are implemented. The full compliance audit is **not clean** because Ladybug's
spec-search candidate discovery remains narrower than the shared abstract contract,
and because the focused runner cannot complete cleanly after SQLite's passing tests.
