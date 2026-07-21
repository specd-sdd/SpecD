# Partial Spec Compliance Audit — graph stores

**Change:** `sdk-graph-provider-factory`  
**Scope:** `code-graph:graph-store`, `code-graph:ladybug-graph-store`, `code-graph:sqlite-graph-store`  
**Mode:** merged-preview, read-only  
**Graph:** fresh (`stale: false`, indexed 2026-07-19T17:45:36Z)

## Scope and dependency conformance

Reviewed merged `spec.md` and `verify.md` previews for all three scoped specs. Direct dependencies reviewed for compatibility: `code-graph:symbol-model`, `code-graph:staleness-detection`, `code-graph:document-model`, `core:config`, and `code-graph:workspace-integration`; global architectural/convention/testing/docs/ESLint constraints were also considered. The graph confirms `GraphStore` is a domain port (`src/domain/ports/graph-store.ts`), while SQLite and Ladybug are infrastructure adapters; no `@specd/core` dependency is introduced by the port.

Dependency conformance is otherwise good: both adapters preserve `File`/`Symbol`/`Spec`/`Document` concepts, config-rooted storage, relation metadata, transactions, generation sidecars, and provider-facing abstraction. Backend-specific schema/DDL remains inside infrastructure.

## Evidence

- `src/domain/ports/graph-store.ts`: abstract class, `storagePath`, explicit lifecycle, document methods, bulk/recreate/generation methods, query/search/statistics contracts.
- `src/infrastructure/sqlite/sqlite-graph-store.ts` and `sqlite/schema.ts`: lazy `better-sqlite3` loading in `open`, config-rooted `graph`/`tmp`, FTS5 tables, transactions, metadata, `storage.epoch`, persisted file content, documents, relation metadata, and recreation.
- `src/infrastructure/ladybug/ladybug-graph-store.ts` and `ladybug/schema.ts`: deferred Ladybug loading, prepared bindings for externally derived values, config-rooted CSV scratch files, cleanup, schema/FTS, transactions, metadata, and recreation.
- Tests: shared `test/domain/ports/graph-store.contract.ts`, plus `test/infrastructure/sqlite/sqlite-graph-store.spec.ts` and `test/infrastructure/ladybug/ladybug-graph-store.spec.ts`, exercise lifecycle, relations, documents, storage persistence/recreation, ranking, FTS literal handling, and atomic-failure behavior.

## Findings

### High — merged abstract query API is not implemented under its required names

The merged GraphStore spec requires `getCoveringSpecsForFile()` and `getCoveringSpecsForSymbol()`. The actual abstract port instead declares `getCoveringSpecs()` and `getSymbolCoveringSpecs()`, and both adapters implement those latter names. Consequently, a storage-agnostic consumer written to the merged requirement cannot call the mandated API. This is a contract/spec drift or implementation bug; resolve by renaming/aliasing the port and adapters, or amend the merged spec deliberately. Shared contract tests cover coverage queries but do not assert the merged method names.

### Medium — SQLite fails the required identity-candidate supplementation for specs/documents

`SQLiteGraphStore.searchSymbols()` builds and applies `buildIdentityCandidatePredicateSql` (around lines 637–651). `searchSpecs()` and `searchDocuments()` (around lines 802 and 880) use only `FROM *_fts ... WHERE *_fts MATCH ?`; they do not include identity-derived candidates. Thus a suffix/sub-string/path identity that FTS5 does not tokenize into the MATCH candidate set can be omitted, contrary to both the merged abstract spec and SQLite spec. The required “strong suffix identity hit” scenario has no SQLite test proving candidate supplementation for all three search categories. The ranking helpers alone cannot repair a candidate that was never retrieved.

### Low — scenario coverage is uneven for destructive and failure paths

The suites cover recreate, generation behavior, SQLite transactional failures, Ladybug removal failure, FTS/ranking, and CSV cleanup. They do not visibly provide direct backend tests for every abstract scenario: closed-after-open `upsertFile` rejection, failed `upsertFile` rollback in both concrete adapters, idempotent removal, all `COVERS_*` reverse-query method variants, and every documented ranking ladder/category. This is primarily verification coverage risk; implementation evidence supports most operations.

## Requirement and verification-scenario disposition

| Spec                  | Requirements | Scenario disposition                                                                                                                                                                                                                                                                                                                                                                                                                                        | Coverage assessment                                                                                         |
| --------------------- | -----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `graph-store`         |           12 | Pass by code/tests for abstract class, lifecycle guard, documents/content, relation families including `CONSTRUCTS`/`USES_TYPE`, metadata/statistics, transactions, recreation/generation, FTS/ranking, bulk operations. **Fail** for the two explicitly named reverse coverage query scenarios because the merged names are absent. **Fail/insufficient evidence** for strong identity supplementation where SQLite spec/document candidates are FTS-only. | Shared contract suite is broad; missing API-name assertions and several explicit failure/idempotency cases. |
| `ladybug-graph-store` |           12 | Pass by code/tests for backend id/lifecycle, layout, generation/recreation, schema/node/relation persistence including `COVERS_SYMBOL` metadata, prepared statements, FTS/rebuild/ranking, schema versioning, scratch cleanup and companion-file boundary. Scenario-level status: implemented/tested except some ranking ladder variants and open/close failure behavior are inferred from shared tests/code rather than individually asserted.             | Good shared + adapter coverage; add exact scenario tests for all ranking ladder and generation observation. |
| `sqlite-graph-store`  |           11 | Pass by code/tests for lifecycle/layout, default backend composition, recreation/generation, schema/nodes/relations, FTS5, transactions, schema versioning and companion boundary. **Fail** the “supplements FTS discovery for a strong suffix identity hit” requirement for spec/document search because candidate supplementation is not applied there.                                                                                                   | Strong adapter suite; does not prove spec/document identity supplementation, nor every rollback/query edge. |

### Explicit merged `verify.md` scenario check

All scenarios were evaluated against code and tests. Status categories above are deliberately grouped only where scenarios share the same evidence. The non-pass scenarios are:

1. `graph-store` / **getCoveringSpecsForFile returns specs covering a file** — **FAIL**: port/adapters expose `getCoveringSpecs`, not required merged name.
2. `graph-store` / **getCoveringSpecsForSymbol returns specs covering a symbol** — **FAIL**: port/adapters expose `getSymbolCoveringSpecs`, not required merged name.
3. `graph-store` / **Strong identity hit may be discovered outside backend-native FTS tokenization** — **FAIL for SQLite spec/document paths**: no identity-candidate union beyond FTS MATCH.
4. `sqlite-graph-store` / **SQLite supplements FTS discovery for a strong suffix identity hit** — **PARTIAL/FAIL**: symbol path has candidate predicate; spec/document paths do not, so adapter-level general requirement is unmet.

All other scoped merged scenarios have implementation evidence; where a scenario lacks a direct assertion, it is recorded as coverage-inferred rather than a functional failure.

## Counts

- Specs audited: **3**
- Direct dependency/global constraints checked: **10**
- Requirement groups checked: **35**
- Merged verification scenarios evaluated: **~90**
- Confirmed failures: **2 high/medium functional discrepancies** (4 scenario entries affected)
- Coverage-only findings: **1 low**
- Critical findings: **0**

## Overall result

**Not fully compliant.** The adapters are substantively implemented and well tested, but the merged contract’s reverse coverage API names do not match the actual public port, and SQLite’s identity candidate supplementation is incomplete outside symbol search. Either discrepancy can affect graph search or storage-agnostic consumers after this change.
