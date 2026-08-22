# Spec Compliance Audit: code-graph (change nonblocking-sqlite-graph-store)

Audit date: 2026-08-19 · Mode: read-only · Change: `20260818-162313-nonblocking-sqlite-graph-store` (state: verifying)

## Spec: code-graph:sqlite-graph-store

### Requirements Summary

13 requirements: SQLite-backed implementation; Config-derived persistence layout; Default backend role; Destructive recreation; Storage generation sidecar; SQLite schema ownership; Persisted node storage; Persisted relation storage; SQLite full-text search; Transactional mutation model; Bulk indexing support; Schema versioning; Backend-specific companion files; Reference schema upgrade.

### Implementation Status

- **SQLite-backed implementation — COMPLIANT.** `SQLiteGraphStore` implements `GraphStore`; all sync `better-sqlite3` execution runs inside a persistent worker thread (`sqlite-worker.ts` + `SQLiteWorkerClient`); host surface is async RPC. Runtime-specific native binding (`modulePath`) is deferred to `open()`. `close()` is idempotent (lifecycle tests). Stable backend id `sqlite` (composition registry).
- **Config-derived persistence layout — COMPLIANT.** Storage root derived from `config.configPath` in composition; DB + WAL/SHM under `{configPath}/graph`, scratch under `{configPath}/tmp`, both created on demand. Closed-store `recreate()` cleanup leaves no lingering WAL/SHM (lifecycle spec ~:370).
- **Default backend role — COMPLIANT.** `DEFAULT_GRAPH_STORE_ID = 'sqlite'` (create-code-graph-provider.ts); default-selection tested (provider spec). Full feature set (durable persistence, atomic mutations, FTS, bulk index, traversal/impact/hotspot/search/stats flows) is exercised against SQLite via the shared contract suite.
- **Destructive recreation — COMPLIANT.** `recreate()` discards graph data under `{configPath}/graph`, rotates the storage-generation sidecar, and is re-openable for a clean rebuild (sqlite-graph-store.spec ~:286/:302, lifecycle ~:370, index-project-graph-integration.spec ~:595-670: incompatible DB → reads rejected → destructive rebuild → `storage.epoch` rotated → FTS search works).
- **Storage generation sidecar — COMPLIANT.** `graph/storage.epoch` sidecar (`storage-generation.ts`); generation observable on `open()` via `readStorageGenerationSnapshot` RPC and read by the provider's open gate; rotated on destructive recreation.
- **SQLite schema ownership — COMPLIANT.** `schema.ts` owns DDL for files, documents, symbols, specs, relations, meta, plus logical/binding/coverage tables; DDL assertions in sqlite-graph-store.spec ~:339-353.
- **Persisted node storage — COMPLIANT.** `files` (with persisted `content` for snippet extraction), `symbols`, `specs`, `documents` (path PK, configRelativePath, contentHash, content, workspace), `meta`.
- **Persisted relation storage — COMPLIANT.** Single `relations` table with type column + `metadata_json`; all 10 required families representable; `COVERS_SYMBOL` stale metadata round-trips across reload (contract ~:1251-1277).
- **SQLite full-text search — COMPLIANT.** `symbol_fts`/`spec_fts`/`document_fts` (porter) + `file_content_fts` (trigram). Candidate discovery unions FTS `MATCH` (OR-joined sanitized multi-token) with identity-derived candidates. Identity ranking is explicit SQL ordering: CASE ladder exact(40) > prefix(30) > suffix(20) > real component(15) > arbitrary substring(10), plus exact-canonical tier (identity_tier), expanded-token coverage (token_hits), then BM25 tail (sqlite-graph-database.ts ~:3437-3729). Snippets + 1-based line ranges derived from persisted file content (line-budget windowing ~:1256-1285). Ranking scenarios covered at sqlite-graph-store.spec ~:561/:641/:703/:819/:846/:882/:930/:970/:981.
- **Transactional mutation model — COMPLIANT.** `upsertFile`/`removeFile`/`upsertSpec`/`removeSpec`/`addRelations`/`removeDocument` each run in a `db.transaction()`; rollback preserves prior state (rollback test ~:68).
- **Bulk indexing support — COMPLIANT.** Worker-side chunked session staging (`beginBulkIndexSession`/`stageBulkFiles`/…), single atomic `commitBulkIndex` transaction with one `rebuildFtsIndexesInTransaction` at commit (sqlite-graph-database.ts ~:2124-2204); onProgress stages; scratch scoped to `{configPath}/tmp`.
- **Schema versioning — COMPLIANT (with drift noted below).** `SQLITE_SCHEMA_VERSION = 9`; open executes DDL, records version in meta, prepares FTS; incompatible persisted version rejects ordinary reads (`assertExistingSchemaCompatible` ~:2230; tests ~:355-369 and integration ~:595-620 reject 8 and 5).
- **Reference schema upgrade — COMPLIANT (version arithmetic excepted).** Enriched logical-symbol/declaration/binding/coverage/complete-range/selection-range columns with structured indexes `idx_logical_symbols_lookup`, `idx_logical_symbols_member_lookup`, `idx_public_bindings_lookup`, `idx_public_bindings_name` (schema.ts ~:152-156); substring-capable trigram source FTS; candidate query uses shared normalized/raw/expanded terms with filters before LIMIT and a bounded `instr` fallback for <3-char queries (sqlite-graph-database.ts ~:1528-1635); batched reverse coverage uses set-based predicates with dedup + deterministic ordering (~:537-568, contract ~:1336-1345); `indexed_input_observations` + `freshness_latches` persisted; one indexing run = one transaction, one commit, one FTS rebuild; chunk appends do not rebuild FTS independently.

### Discrepancies

- **D1 — Schema version is 9, spec text says "5 to 6".**
  - Evidence: spec.md:229 ("increment its schema version exactly once … absent an intervening change this is 5 to 6"); `SQLITE_SCHEMA_VERSION = 9` (schema.ts:1); git history of schema.ts: 3549a7f3→1, 54a30042→2, 2294d54e→4, ffbe60a4→5, b86b81c1→9. The branch base `b86b81c1` (an intervening change that also performed the schema-upgrade work — logical symbols, bindings, trigram) bumped 5→9 directly. This change's 4 commits (94892336, b647ac84, 937dc7f6, 6eab7016) do **not** modify schema.ts (verified `git diff b86b81c1..HEAD`).
  - Possibility A (spec drift): the "5 to 6" arithmetic is stale; the intervening change b86b81c1 is exactly the "intervening change" the sentence anticipates, and it already performed the upgrade (to 9). This change adds no persisted columns, so no bump is warranted. Tests consistently assert 9 and reject older versions.
  - Possibility B (implementation deviation): if read literally, the schema-upgrade requirement targeted 5→6, which no commit in this branch performed (b86b81c1 went to 9). Under either reading, the implementation is internally consistent and the spec text needs reconciliation, not a code fix.
  - **Verdict: spec drift. No functional gap.**

- **D2 — Worker-side error serialization omits `details` (SpecNotFoundError codec asymmetry).**
  - Evidence: worker-side `serializeError` (sqlite-worker.ts:38-53) emits only name/message/stack/code/sqliteCode — no `details`. Host-side `serializeWorkerError`/`deserializeWorkerError` (sqlite-worker-client.ts:73-130) DO carry `details.specId` and reconstruct `SpecNotFoundError` from it. The roundtrip test (sqlite-worker-lifecycle.spec.ts ~:350-368) exercises **only** the host-side pair, never the worker→host path.
  - Possibility A (latent robustness gap): a structured error raised inside the worker would lose `specId` across the real MessagePort path. Task 13.7 updated only the host codec; worker-side `serializeError` was not aligned.
  - Possibility B (compliant as-is): `new SpecNotFoundError` never occurs inside the worker DB layer (only at host-side `deserializeWorkerError`), so the omission is inert today.
  - **Verdict: currently harmless but asymmetric; recommend aligning worker-side `serializeError` with the host codec for symmetry.**

- **D3 — Test-count metadata inaccuracy (manual-review signal).**
  - Evidence: `sqlite-graph-store.spec.ts` contains 23 explicit `it(` blocks; the shared `graph-store.contract.ts` adds 44 shared contract cases; total ≈ 67 static cases for the SQLite backend. Vitest reports 113 passing tests in that file because the shared contract suite generates additional parameterized cases at runtime. The change metadata now reflects the accurate static accounting (23 + 44 ≈ 67); this finding is resolved in the reconciliation.

### Test Coverage

- Local SQLite store tests: 23 (sqlite-graph-store.spec.ts) — schema artifacts/version/DDL (~:286-369), rollback-on-failed-bulk (~:68), incremental source-content FTS (~:115-148), reopen-preserves-FTS-without-rebuild (~:246), pragmas WAL/busy_timeout/synchronous (~:321-337), identity ranking scenarios (~:561-981).
- Shared contract against SQLite: 44 (graph-store.contract.ts) — batch reverse coverage + empty arrays (~:1336-1345), COVERS_SYMBOL stale metadata (~:1251-1277), source-candidate filters/cursor/short-query (~:1600-1644), exact-match boost (~:1348), range roundtrip (~:221), freshness observations (~:86-133).
- Worker lifecycle: 15; backpressure: 2 (StoreOverloadError at bound, StoreWorkerError on crash); responsiveness: 1 (500 files/500 symbols bulk keeps host loop responsive); protocol: 4; dist: 2.
- Integration (index-project-graph-integration.spec.ts): 7 — includes schema-5 incompatible → destructive repair → `storage.epoch` rotation → FTS search after rebuild (~:595-670).

### Missing Tests

- No direct SQLite storage round-trip for `EXPORTS` relations (`getExportedSymbols` is implemented — sqlite-graph-store.ts:474 — but the contract suite stores no EXPORTS; only InMemoryGraphStore and traversal tests cover it). Schema is a generic `relations` table, so this is representational coverage, not a correctness gap.
- No worker→host end-to-end roundtrip test for a structured domain error carrying `details` (see D2).

### Spec Dependency Chain conformity

- `code-graph:graph-store` — conforms: abstract semantics (atomicity, recreate, storage.epoch, ranking ladder, reverse-coverage determinism, freshness latches, bulk session) preserved by SQLite adapter. The graph-store spec's extra relation families (CONSTRUCTS, USES_TYPE) are representable in the single relations table. No conflicts.
- `core:config` — conforms: `configPath` used only to derive storage root; graph/tmp derived dirs match the spec's config-derived layout.
- `code-graph:symbol-model` — conforms: node/relation concepts and reference vocabulary persisted with structured identity columns.
- `code-graph:workspace-integration` — conforms: workspace-prefixed file/spec identities preserved (`files.workspace`, workspace filter applied in candidate searches); no identity parsing/substring-ranking of canonical ids (structured columns + indexes).

## Spec: code-graph:composition

### Requirements Summary

9 requirements: CodeGraphProvider facade; Factory function; Package exports; Public and internal entry points; Lifecycle management; Dependency on @specd/core; Host use cases; Symbol-reference provider surface; Code Graph-orchestrated search surface.

### Implementation Status

- **CodeGraphProvider facade — COMPLIANT.** All public responsibilities implemented by delegation (code-graph-provider.ts): index, query, search, clear, traversal, impact, selector normalization, lifecycle. `getSpec` returns `undefined` when absent. `recreate()` and lock helpers are NOT exposed publicly. Provider holds no domain logic (delegates; enforces lifecycle/availability).
- **Factory function — COMPLIANT.** Two overloads (SpecdConfig primary + CodeGraphOptions legacy) with overload detection (`'configPath' in options && 'workspaces' in options`); additive `graphStoreFactories` and `adapters`; registry includes `ladybug` + `sqlite`; default id `sqlite`; synchronous creation with backend-native loading deferred to `open()`; exactly one active GraphStore built per construction. Provider tests cover default selection, explicit ladybug/sqlite, custom additive factory, and both overloads (code-graph-provider.spec.ts ~:43-341).
- **Package exports — PARTIAL (see D4/D5).** The `"."` barrel (`public.ts`) matches the curated list: composition & wiring, host use cases + factories, VCS & config, indexer/discovery types, traversal/impact, hotspots, search helpers, staleness/fingerprint, LanguageAdapter, model/vocabulary, errors (incl. `StoreOverloadError`, `StoreWorkerError`), `CODE_GRAPH_VERSION`. Lock-management helpers are absent from `"."`. `type CodeGraphProvider` exported type-only. Unified-search input/result/source-match value objects exported.
- **Public and internal entry points — COMPLIANT.** `src/public.ts` → `"."` (curated, no unrestricted `export *` of infrastructure); `src/index.ts` → `"./internal"` (full barrel); `package.json` exports map both; build bundles `sqlite-worker.ts` for dist execution (verified by sqlite-worker-dist.spec.ts).
- **Lifecycle management — COMPLIANT.** Explicit `open()`/`close()`; no auto-open/auto-close; `close()` idempotent incl. future `Symbol.asyncDispose`; synchronous creation + host-controlled open/close (tests ~:78, ~:223, worker lifecycle).
- **Dependency on @specd/core — COMPLIANT.** `@specd/core` is a runtime `workspace:*` dependency; provider is stateless (SpecdConfig used only to derive storage path).
- **Host use cases — COMPLIANT.** `GetGraphHealth`/`createGetGraphHealth`, `IndexProjectGraph`/`createIndexProjectGraph`, `GetSpecCoverage`/`createGetSpecCoverage`, `GetChangeSpecCoverage`/`createGetChangeSpecCoverage` exposed; they receive an already-open provider; they do not replace facade delegates for search/hotspots/impact/traversal. Tests: host-use-case-factories.spec.ts (4).
- **Symbol-reference provider surface — COMPLIANT.** Single/batch resolution, exact public-binding lookup bypassing ranked/paginated search (`getExactPublicBinding` ~:661), and public-binding impact analysis delegate to shared resolver/traversal services under lifecycle + availability checks. Selector resolution distinguishes unique/ambiguous/missing, case-exact first, case-insensitive exact fallback, no prefix/text widening, ambiguity bounded (resolve-graph-selector.spec.ts: ambiguity capped at 10; resolve-symbol-reference.spec.ts covers competing-target ambiguity). Resolver input/result/status/reason/provenance types and vocabulary exported.
- **Code Graph-orchestrated search surface — COMPLIANT.** `SearchCodeGraph` application use case (search-code-graph.ts) executes the shared query plan, semantic-symbol + backend-content lanes, precise occurrence location, suppression of occurrences represented by returned symbol selection ranges, grouping/ranking, per-file caps, and category limits after grouping/suppression; exact single-file searches return every retained occurrence; provider delegates under its lifecycle/availability checks. Delivery adapters do not reproduce expansion/merge/dedup/limits — the unified operation is authoritative. Tests: search-code-graph.spec.ts (14) + provider delegation tests (~:334-411).

### Discrepancies

- **D4 — Concrete store adapter symbols are not exported from `"./internal"`.**
  - Evidence: spec.md:90-91 ("`InMemoryIndexSession`, concrete store adapter symbols, and other composition internals … MUST be exported only from `./internal`, not from `"."`"). `src/index.ts` exports `InMemoryIndexSession` (line 130) and `acquireGraphIndexLock`/`getGraphIndexLockPath` (line 215), but exports **neither** `SQLiteGraphStore`/`LadybugGraphStore`/`AdapterRegistry` **nor** the built-in language adapters from any barrel.
  - Possibility A (implementation gap): the positive half of the requirement ("exported from `./internal`") is unmet — internal consumers of the concrete adapters cannot import them.
  - Possibility B (spec drift): the negative half ("not from `"."`") is satisfied; the spec's assumption that internal hosts need these symbols may be outdated, and no consumer in the repo imports them.
  - **Verdict: the `"."` half conforms; `"./internal"` half does not. Flag for reconciliation or export.**

- **D5 — `ResolveSymbolReference` concrete class exported from `"."`.**
  - Evidence: public.ts:49 `export { ResolveSymbolReference } from './application/use-cases/resolve-symbol-reference.js'`. spec.md:136 ("Concrete resolver implementations and backend storage details SHALL remain internal"). Pre-existing (present at b86b81c1), not introduced by this change.
  - Possibility A (spec drift): the spec intends resolver _types/factories_ public but the value-class export predates the requirement; exporting the class is pragmatic.
  - Possibility B (implementation deviation): exporting the concrete resolver violates the "remain internal" constraint.
  - **Verdict: low-severity, pre-existing; flag for reconciliation.**

### Test Coverage

- composition/code-graph-provider.spec.ts: 17 — lifecycle, availability gates (StoreNotOpenError before open / after dispose), default + explicit + additive graph-store selection, both factory overloads, lock acquisition, health gate, resolver delegation, unified-search delegation (~:334-411), schema-compat rejection via mock.
- composition/host-use-case-factories.spec.ts: 4.
- application/use-cases/search-code-graph.spec.ts: 14 — multi-category execute, exact-file suppression, caps, grouping, per-category limits, deterministic projection.
- application/use-cases/resolve-symbol-reference.spec.ts: extensive (unique/ambiguous/missing, exact public binding, parallel routes, competing declarations).
- application/services/resolve-graph-selector.spec.ts: 4 — unique, case-insensitive fallback, bounded ambiguity, no widening.
- domain/ports/graph-store.contract.ts: 44 — shared contract executed against SQLite and InMemory backends.

### Missing Tests

- No test asserting that `"./internal"` exposes the concrete store adapter symbols (they are absent — D4). No test pins the absence of concrete resolvers/backend details from `"."`.
- No dedicated test that `getExactPublicBinding` bypasses ranked search when a common export name would otherwise hit a result limit (spec scenario; behavior is implemented and delegated, but not isolatedly asserted).
- No test that delivery adapters do not independently merge/dedup (CLI-level behavior; outside code-graph test scope).

### Spec Dependency Chain conformity

- `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:indexer`, `code-graph:traversal` — conform: provider delegates to these services; no API or semantics conflicts.
- `default:_global/architecture` — conform: hexagonal layering preserved; composition owns wiring; provider is a facade, stores are infrastructure adapters.
- `code-graph:get-graph-health`, `code-graph:index-project-graph`, `code-graph:get-spec-coverage`, `code-graph:get-change-spec-coverage`, `code-graph:resolve-symbol-reference` — conform: host use cases exposed with factories; receive already-open provider; delegate to shared services.

## Summary counts

- **Specs audited:** 2 (`code-graph:sqlite-graph-store`, `code-graph:composition`)
- **Requirements:** 13 (sqlite-graph-store) + 9 (composition) = 22
  - Compliant: 20
  - Partial / drift: 2 (D1 schema-version text, D4 `./internal` concrete-store exports)
  - Non-compliant: 0
- **Discrepancies:** 5 (D1 spec-drift schema version; D2 worker error-codec asymmetry; D3 test-count metadata; D4 `./internal` exports gap; D5 pre-existing `ResolveSymbolReference` export)
- **High-severity:** 0 · **Medium:** 1 (D4) · **Low / latent / metadata:** 4 (D1, D2, D3, D5)
- **Missing tests:** 4 (EXPORTS SQLite roundtrip; worker→host structured-error roundtrip; `./internal` adapter exports; exact public-binding bypass isolation)
- **Dependency conformance:** all 4 (sqlite-graph-store) + 10 (composition) direct dependencies conform; no conflicts found.
