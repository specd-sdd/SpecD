# Spec Compliance Audit — Change `nonblocking-sqlite-graph-store`

- **Mode:** change
- **Change path:** `specd-sdd/changes/20260818-162313-nonblocking-sqlite-graph-store`
- **Audited specs:** `code-graph:sqlite-graph-store`, `code-graph:composition`
- **Method:** merged `spec-preview` content vs `packages/code-graph` implementation (graph-first navigation, Read/Grep fallback), test suites executed under vitest, dependency specs (depth 1) cross-checked for consistency.
- **Test execution:** `sqlite-worker-lifecycle`/`backpressure`/`protocol`/`responsiveness` PASS (29/29); `sqlite-graph-store`+`barrel` PASS (119/119); `code-graph-provider`+`search-code-graph` PASS (31/31). Graph index fresh (`stale: false`, ref `4b57f3a5`).

---

# Spec 1 — `code-graph:sqlite-graph-store`

## Requirements Summary

15 requirements (merged spec content, deltas applied):

1. SQLite-backed implementation
2. Worker-backed non-blocking execution (12 operational invariants)
3. Config-derived persistence layout
4. Default backend role
5. Destructive recreation
6. Storage generation sidecar
7. SQLite schema ownership
8. Persisted node storage
9. Persisted relation storage
10. SQLite full-text search
11. Transactional mutation model
12. Bulk indexing support
13. Schema versioning
14. Backend-specific companion files
15. Reference schema upgrade

## Implementation Status

### R1 — SQLite-backed implementation — **CONFORMS**

- `SQLiteGraphStore` (`src/infrastructure/sqlite/sqlite-graph-store.ts`) implements the abstract `GraphStore` port and delegates every operation to a dedicated `Worker` (`node:worker_threads`) via `SQLiteWorkerClient` (`sqlite-worker-client.ts`).
- `better-sqlite3` is loaded only inside the worker (`sqlite-worker.ts` → `SQLiteGraphDatabase` → `loadDatabaseModule`, `sqlite-graph-database.ts:288`); the host thread never touches the native binding.
- All synchronous SQLite work (queries, mutations, FTS, schema init) executes in the worker; the host only transfers serializable DTOs.
- Evidence: `sqlite-worker-responsiveness.spec.ts` proves the host event loop stays responsive (heartbeat ticks during 10k-file chunked staging, max lag < 200ms).

### R2 — Worker-backed non-blocking execution — **CONFORMS** (all 12 invariants)

1. **Persistent worker lifecycle** — single `Worker` per client; `open()`/`close()` share in-flight promises (`sqlite-worker-client.ts:213`, `:306`). Tested (`lifecycle.spec.ts:27`, `:54`).
2. **Worker ownership** — DB connection, prepared-statement cache, and WAL live in the worker (`SQLiteGraphDatabase` fields); handles never cross the boundary (protocol DTOs only).
3. **Strongly-typed protocol** — `SQLiteWorkerRequest`/`Response`/`OperationMap` with monotonic correlation IDs (`sqlite-worker-protocol.ts`); error payloads are serialized DTOs (`serializeWorkerError`/`deserializeWorkerError`).
4. **Worker FIFO serialization** — worker-side `dispatchQueue` promise chain (`sqlite-worker.ts:619-635`). Tested (`lifecycle.spec.ts:125`).
5. **Bounded outstanding requests** — `maxPendingOperations` validated as integer `>= 1`, default 256; overflow rejects with `StoreOverloadError` (`sqlite-worker-client.ts:227-235`, `:447-451`). Tested (`backpressure.spec.ts:19`).
6. **Graceful shutdown & drain** — `drainTimeoutMs` (5000) deadline covers `openPromise`, drain, and close RPC via unref'd `withDeadline` (`sqlite-worker-client.ts:40-65`, `:306-400`); timeout rejects remaining requests with `StoreWorkerError` and force-terminates; `closePromise` cleared in outer `finally`. Tested (`lifecycle.spec.ts:200`, `:297`).
7. **Serializable runtime descriptor** — `SqliteRuntimeDescriptor.modulePath` drives worker-side dynamic import (`sqlite-graph-database.ts:291`); `workerPath` exists only on `InternalSQLiteGraphStoreOptions` (`sqlite-runtime-descriptor.ts:25`), not on public options.
8. **Fault isolation & manual recovery** — unexpected exit/error → `faulted` state, outstanding requests reject with `StoreWorkerError` (`sqlite-worker-client.ts:564-579`); recovery via `close()` then `open()`. Tested (`lifecycle.spec.ts:152`).
9. **Concurrent open()/close() race** — close waits on `openPromise` within deadline; open only transitions to `'open'` if still `'opening'` (`sqlite-worker-client.ts:270-274`). Tested (`lifecycle.spec.ts:185`).
10. **Chunked bulk staging + lifecycle session token** — host `IndexWriteSession` state machine `active/committing/rolling-back/finished` (`sqlite-graph-store.ts:875-1037`); worker-side session map with `requireBulkSession` (staging on missing/finalized session rejects, no resurrection, `sqlite-worker.ts:113-119`); reference-facts chunks merged (`mergeReferenceFactChunks`); single worker transaction commit; host `lifecycleGeneration` token invalidates sessions on close/crash/recreate. Tested (`lifecycle.spec.ts:401,483,530,555,579,627`).
11. **Isolated progress callbacks** — `handleWorkerMessage` wraps `onProgress` in try/catch (`sqlite-worker-client.ts:505-512`). Tested (`lifecycle.spec.ts:327`).
12. **Non-blocking closed-store recreate** — `recreate()` on a closed store uses `node:fs/promises` `rm` + `rotateStorageGenerationAsync` (`sqlite-graph-store.ts:660-669`). Tested (`lifecycle.spec.ts:373`).

### R3 — Config-derived persistence layout — **CONFORMS**

- `graphDir = join(storagePath,'graph')`, `tmpDir = join(storagePath,'tmp')`; created on demand (`sqlite-graph-database.ts:258-263`). `storagePath` = `config.configPath` via factory. DB file + WAL/SHM live only under `graph/`. Tested (`sqlite-graph-store.spec.ts:286`).

### R4 — Default backend role — **CONFORMS**

- `DEFAULT_GRAPH_STORE_ID = 'sqlite'`; registry contains `ladybug` + `sqlite` (`create-code-graph-provider.ts:22-35`). Ladybug-era flows (index, search, stats, traversal, impact, hotspots, reference, coverage) all implemented through SQLite. Tested (`code-graph-provider.spec.ts:41,52,64`; shared `graph-store.contract.ts` runs against both backends).

### R5 — Destructive recreation — **CONFORMS**

- Worker `recreate` closes db, `rmSync(graphDir)`, rotates generation, reopens (`sqlite-graph-database.ts:312-323`). Closed-store path uses async fs. Tested (`sqlite-graph-store.spec.ts:302`, `lifecycle.spec.ts:373`).

### R6 — Storage generation sidecar — **CONFORMS**

- `graph/storage.epoch` sidecar (`infrastructure/storage-generation.ts`); open ensures it, recreate rotates it (token + mtime); provider caches at open and detects staleness (`code-graph-provider.ts:917-935`). Tested (`code-graph-provider.spec.ts:202` GraphProviderStaleError scenario).

### R7 — SQLite schema ownership — **CONFORMS**

- Physical schema (`schema.ts`) is internal to `SQLiteGraphStore`; storage-agnostic consumers depend only on `GraphStore`. `Schema` defines files, symbols, specs, documents, relations, meta, plus reference-schema tables.

### R8 — Persisted node storage — **CONFORMS**

- `files` (path PK, config_relative_path, language, content_hash, workspace, content), `documents` (path PK, config_relative_path, content_hash, content, workspace), `symbols`, `specs`, `meta` (`schema.ts:6-65`). File content persisted for snippet derivation; symbol snippet extraction reads file content, no per-symbol snippet blobs (`sqlite-graph-database.ts:1256-1285`). Tested (`sqlite-graph-store.spec.ts:433`).

### R9 — Persisted relation storage — **CONFORMS** (minor spec note)

- Generic `relations(source,target,type,metadata_json)` table persists all families incl. `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`; `COVERS_SYMBOL` metadata (e.g. `{"stale":true}`) round-trips via `metadata_json` (`sqlite-graph-database.ts:2606-2623`). Tested (`sqlite-graph-store.spec.ts:152` reopen-cycle test; contract tests `getExtenders`/`getImplementors`/`getOverriders`).
- **Note:** the change spec enumerates only 10 relation families and omits `CONSTRUCTS` and `USES_TYPE`, which the abstract dependency `code-graph:graph-store` requires (12 families) and which `getCallers`/`getCallees` expose. The generic relations table persists all 12 — no behavioral gap. See Discrepancy D1.

### R10 — SQLite full-text search — **CONFORMS**

- FTS5 virtual tables `symbol_fts` (name-derived `search_text` + comment), `spec_fts` (spec_id, title, description, content), `document_fts` (path, config_relative_path, content) (`schema.ts:162-183`).
- Candidate discovery combines `MATCH` (BM25) with identity-derived candidates via `UNION ALL`; multi-token `MATCH` uses quoted tokens joined by `OR` (`sanitizeFtsQuery`, `sqlite-graph-database.ts:3761-3765`) — hyphens and FTS operators are literal-safe. Tested (`sqlite-graph-store.spec.ts:819,846,882`).
- Identity-aware ranking is explicit SQL ordering: `identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC` (`:1210,1368,1483`), with strength ladder exact(40) > prefix(30) > suffix(20) > real-component(15) > substring(10) (`buildTokenStrengthForIdentitySql`, `:3677-3701`), and token-coverage counting (`buildTokenHitsSql`). Exact canonical identity → tier 5; alternate identity → tier 4; single-token prefix → tier 3; token-hit bonus tier 2; generic tier 1 (`:3437-3476`). This satisfies every ordering bullet (exact > prefix > suffix > substring; component > substring; more identity tokens > fewer; body-only can't outrank identity).
- Tokens expanded via shared lexical policy (`expand-search-query.ts`) — splits `: / _ . -`, CamelCase/PascalCase, digits; preserves normalized original tokens. Tested (`sqlite-graph-store.spec.ts:561`, `:703`).
- Snippets and 1-based line ranges derived from persisted file content / FTS `snippet()` (`:1256-1285`, `:1393-1407`). Tested (`sqlite-graph-store.spec.ts:433`).
- Persisted file content does **not** become a separate public file-search category; `file_content_fts` (trigram) exists solely for the backend source-content candidate query (R15 / graph-store contract). The abstract search surface exposes symbols/specs/documents only.

### R11 — Transactional mutation model — **CONFORMS**

- `upsertFile`, `removeFile`, `upsertSpec`, `removeSpec`, `addRelations`, `clear`, `commitBulkIndex`, `rebuildFtsIndexes` each run inside a single worker-side `db.transaction(...)` (`sqlite-graph-database.ts:1645-1756`, `:2124-2199`). No multi-RPC transaction spans IPC. Failed transactions leave prior state intact (SQLite atomicity; tested by `rolls back the complete native bulk generation when persistence fails`, `:68`).

### R12 — Bulk indexing support — **CONFORMS**

- `bulkLoad()` internally uses the chunked `IndexWriteSession` staging flow (`BULK_RPC_CHUNK_SIZE = 1000`, `sqlite-graph-store.ts:1046-1091`); never transfers the complete graph in one message. Staging is bounded; commit is one worker transaction. Progress events emitted per stage: `cleanup`, `files`, `documents`, `symbols`, `specs`, `reference-facts`, `observations`, `relations`, `search-indexes` (`sqlite-graph-database.ts:2124-2192`). No scratch artifacts materialize outside the db (`temp_store=MEMORY`; `tmp/` created but unused). Tested (`index-project-graph-integration.spec.ts:444` asserts legacy `bulkLoad` is not called by the indexer; `lifecycle.spec.ts` session tests).

### R13 — Schema versioning — **CONFORMS**

- `SQLITE_SCHEMA_VERSION = 9` (`schema.ts:1`); open asserts existing schema version and rejects incompatible reads without recreating (`assertExistingSchemaCompatible`, `ensureSchemaVersion`, `:2230-2267`); incompatible DB → destructive rebuild via provider `openForIndexing()` + `recreate()`. Tested (`sqlite-graph-store.spec.ts:355`, `code-graph-provider.spec.ts:407`).

### R14 — Backend-specific companion files — **CONFORMS**

- `journal_mode=WAL` (`:2276`); WAL/SHM co-located with the DB under `graph/`, part of the SQLite implementation detail, not exposed via the abstract port.

### R15 — Reference schema upgrade — **CONFORMS**

- `logical_symbols`, `logical_declarations`, `public_bindings`, `local_bindings`, `resolution_steps`, `index_coverage`, `indexed_input_observations`, `freshness_latches` persisted with structured indexes on workspace/surface/name/space/owner/member/exported-name (`schema.ts:67-160`) — semantic lookup does not parse/substring-rank canonical ids. Provider-visible canonical ids unchanged.
- `file_content_fts` trigram content index for source candidates; short queries (<3 chars) use a bounded indexed fallback (no full scan — `searchSourceCandidates`, `:1528-1569`); filters honored before limit; ranges round-trip without coordinate conversion (contract test `:221`).
- Reverse coverage lookups (`getCoveringSpecsForFiles`/`getCoveringSpecsForSymbols`) use set-based `IN (...)` predicates over deduped paths/ids with deterministic ordering (`:537-569`, `loadExistingIds` batch chunks of 500).
- One indexing run = one DB transaction + one FTS rebuild (`commitBulkIndex`); chunk staging never rebuilds FTS (`sqlite-worker.ts` staging appends to in-memory arrays only). Tested (`sqlite-graph-store.spec.ts:68,374`; contract tests).
- `graph index` repair path rotates `storage.epoch` and rebuilds FTS before readable (openForIndexing flow, `code-graph-provider.ts:248-261`).

## Discrepancies (spec vs code)

### D1 — Relation-family enumeration (minor, spec drift)

- **Spec (change spec R9):** lists 10 relation families; omits `CONSTRUCTS` and `USES_TYPE`.
- **Code:** generic `relations` table persists all 12 families required by `code-graph:graph-store`; `getCallers`/`getCallees` query CONSTRUCTS/USES_TYPE (`sqlite-graph-database.ts:577-589`).
- **Possibility A (spec drift):** the change spec enumerates only the families relevant to the migration narrative; the abstract dependency is the authority and the implementation follows it.
- **Possibility B (implementation bug):** none observed — behavior matches the dependency spec; only the change spec's list is incomplete. Recommend aligning the change spec's enumeration with `code-graph:graph-store` (12 families) for auditability.

### D2 — symbol_fts covers derived `search_text` rather than raw `name` (conforms)

- **Spec (R10):** `symbol_fts` covers `Symbol.name` and `Symbol.comment`.
- **Code:** `symbol_fts(search_text, comment)` where `search_text` = `expandSymbolName(symbol.name)` — explicitly permitted by the change spec's "derived or backend-specific storage columns… such as normalized search text". Not a defect.

### D3 — document_fts adds `config_relative_path` column (conforms)

- Required by the identity-ranking ladder (config-relative path participates); the spec requires path+content at minimum and demands config-relative-path identity ranking. Not a defect.

## Test Coverage (per requirement)

| Req                       | Coverage | Evidence                                                                                                                                                                                                                                                          |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 SQLite-backed          | covered  | `sqlite-worker-dist.spec.ts`, `responsiveness.spec.ts`; worker runs native code off-host                                                                                                                                                                          |
| R2 Worker lifecycle       | covered  | `lifecycle.spec.ts` (29 cases) — shared open/close promises, FIFO recreate, crash/fault, drain timeout, open+close race, closePromise clearing, bulk session state machine, maxPending=1, progress isolation, SpecNotFoundError round-trip, closed-store recreate |
| R2.5 backpressure         | covered  | `backpressure.spec.ts` — StoreOverloadError, crash rejection                                                                                                                                                                                                      |
| R3 layout                 | covered  | `sqlite-graph-store.spec.ts:286`                                                                                                                                                                                                                                  |
| R4 default backend        | covered  | `code-graph-provider.spec.ts:41,52,64`; Ladybug parity via shared contract suite                                                                                                                                                                                  |
| R5 destructive recreation | covered  | `sqlite-graph-store.spec.ts:302`; `lifecycle.spec.ts:373`                                                                                                                                                                                                         |
| R6 sidecar                | covered  | `code-graph-provider.spec.ts:202` (stale generation)                                                                                                                                                                                                              |
| R7 schema ownership       | covered  | schema tests (`:339`) + barrel internal-only checks                                                                                                                                                                                                               |
| R8 node storage           | covered  | contract suite (files/symbols/specs/documents round-trip), snippet test `:433`                                                                                                                                                                                    |
| R9 relations              | covered  | contract suite + `:152` reopen + COVERS_SYMBOL metadata                                                                                                                                                                                                           |
| R10 FTS                   | covered  | `:561,641,703,818-970` — OR discovery, hyphen/operator safety, identity ranking ladder, exact/prefix/suffix/substring ordering, component vs substring, token expansion                                                                                           |
| R11 transactions          | covered  | `:68` rollback-on-failure; per-op transaction tests                                                                                                                                                                                                               |
| R12 bulk indexing         | covered  | indexer integration (`bulkLoad` not called), session chunking, progress events exercised; no dedicated test asserting the full 9-stage event set — see Missing Tests                                                                                              |
| R13 schema versioning     | covered  | `:355`; provider repair `:407`                                                                                                                                                                                                                                    |
| R14 companion files       | covered  | WAL pragma test `:321`                                                                                                                                                                                                                                            |
| R15 reference schema      | covered  | contract suite (structured lookup, batch coverage, range round-trip, freshness latches), `:374` FTS-from-binding identities, `:51` batched observations                                                                                                           |

## Missing Tests

1. **Full progress-stage event set** — no test asserts the worker emits all nine documented stages (`cleanup…search-indexes`) with correct labels during one bulk commit; only exception isolation and implicit exercise are covered.
2. **`bulkLoad()` payload-chunking boundary** — the "no single complete-graph structured-clone message" property for the `bulkLoad()` convenience path itself is only inferred (BULK_RPC_CHUNK_SIZE constant + staged session); no test spies on message size/chunk boundaries for `bulkLoad`.
3. **Closed-store recreate "no worker spawned" assertion** — `lifecycle.spec.ts:373` verifies async fs + no residual WAL; it does not strictly assert zero worker threads spawned during the closed-store `recreate()`.

## Spec Dependency Chain Conformance

- `code-graph:graph-store` (abstract contract): SQLite implements every port method; shared `graph-store.contract.ts` runs green against both SQLite and Ladybug (parity). Consistent.
- `core:config`: `configPath` → `{configPath}/graph` + `{configPath}/tmp`. Consistent.
- `code-graph:symbol-model`: File/Symbol/Spec/Document node persistence. Consistent.
- `code-graph:workspace-integration`: workspace-prefixed canonical identities and workspace columns. Consistent.
- No contradictions found between change-spec content and dependency specs (only the R9 enumeration gap noted as D1).

## Summary — `code-graph:sqlite-graph-store`

- **Requirements:** 15
- **Pass:** 15
- **Partial:** 0
- **Fail:** 0

---

# Spec 2 — `code-graph:composition`

## Requirements Summary

9 requirements (merged spec content, deltas applied):

1. CodeGraphProvider facade
2. Factory function (primary + legacy overloads)
3. Package exports
4. Public and internal entry points
5. Lifecycle management
6. Dependency on @specd/core
7. Host use cases
8. Symbol-reference provider surface
9. Code Graph-orchestrated search surface

## Implementation Status

### R1 — CodeGraphProvider facade — **CONFORMS**

- Type-only interface `CodeGraphProvider` (`composition/code-graph-provider.ts:104-193`) declares indexing, querying, search, maintenance (`clear`), traversal, impact, selector normalization, lifecycle, symbol-reference, exact public-binding, and unified search; concrete `CodeGraphProviderImpl` delegates to `GraphStore`, `IndexCodeGraph`, traversal/impact services, and `SearchCodeGraph`. `getSpec` returns `undefined` for unindexed specs; no `recreate()` or lock helpers on the facade. Tested (`code-graph-provider.spec.ts`; `search-code-graph.spec.ts`).

### R2 — Factory function — **CONFORMS**

- `createCodeGraphProvider(config, options?)` and legacy `createCodeGraphProvider(options: CodeGraphOptions)` overloads; overload detection via `isSpecdConfig` (`'configPath' && 'workspaces'`, `create-code-graph-provider.ts:108-110`). Derives storage root from `config.configPath`; registry-driven backend selection with default `sqlite`; additive `graphStoreFactories` (collision → `GraphStoreRegistryError`); registers 4 built-in adapters (TS/Python/Go/PHP) + additive `adapters`; builds `IndexCodeGraph(store, registry)`; returns wired `CodeGraphProviderImpl`. Creation is synchronous; worker/native loading deferred to `open()`. Runtime SQLite config crosses as `SqliteRuntimeDescriptor` via `createSqliteGraphStoreFactory` or composition options. Tested (`code-graph-provider.spec.ts:41-116,154`).
- **Note:** the spec names the public options type `SqliteGraphStoreOptions`; code exports `SQLiteGraphStoreOptions` — see D4.

### R3 — Package exports — **PARTIAL** (2 findings)

- All enumerated exports present in `src/public.ts` (`"."`): composition/wiring types, host use cases + factories, VCS/config, indexer/discovery, traversal/impact, hotspots, search (`SearchOptions`, `expandSymbolName`, `expandSearchQuery`, `expandSearchToken`), staleness/fingerprint, `LanguageAdapter`, model/vocabulary, errors (incl. `StoreNotOpenError`, `InvalidSymbolKindError`, `InvalidRelationTypeError`, `DuplicateSymbolIdError`, `SpecNotFoundError`, `GraphProviderStaleError`, `StoreOverloadError`, `StoreWorkerError`), `CODE_GRAPH_VERSION`. Lock helpers (`acquireGraphIndexLock`, `getGraphIndexLockPath`) and `InMemoryIndexSession`/concrete adapters are excluded from `"."` (present only in `"./internal"`). Verified by `barrel.spec.ts` + inspection.
- **D4 (naming):** spec names `SqliteGraphStoreOptions` (lowercase "lite", consistent with `SqliteRuntimeDescriptor`); the codebase consistently exports `SQLiteGraphStoreOptions` (`sqlite-runtime-descriptor.ts:15`, `public.ts:9`, `index.ts:9`). No `SqliteGraphStoreOptions` symbol exists anywhere.
  - **Possibility A (spec drift):** the code's `SQLiteGraphStoreOptions` capitalization matches the `SQLiteGraphStore` class naming convention; the spec should be corrected.
  - **Possibility B (implementation bug):** hosts following the spec's public-surface list cannot import `SqliteGraphStoreOptions` from `"."`. Recommend exporting an alias or renaming to the spec name.
- **D5 (over-export beyond "SHALL export only"):** `"."` additionally exports `IndexingOpenResult`, `ExactPublicBindingSelector/Result`, freshness vocabulary (`FreshnessMode/State`, `IndexedInputKind/ResourceKind`, `FreshnessLatches`, `IndexedInputObservation`, `IndexedResourceFreshnessResult/Key`, `WorkspaceFreshnessResult`), `IndexCoverageStatus`, `IndexCoverage`, `IndexPhaseMetric(s)`, `GraphBusyError`, `ReferenceAware*`, `SearchCategory`, `SourceSearch*`, `PublicBindingImpactResult`, `ResolvedPublicBindingImpactInput`, `IndexCoverageHealthSummary`.
  - **Possibility A (spec drift):** the strict "SHALL export only" list predates the reference-schema/unified-search requirements; most extras are mandated by R8/R9 ("resolver input/result/status/reason/provenance types", "enriched health/index result types", "unified search input/result and source-match value objects", "Model/Vocabulary"). `GraphBusyError` is a `SpecdCodeGraphError` subclass and "such as" makes the error list non-exhaustive.
  - **Possibility B (implementation bug):** strictly more named exports than enumerated. Low risk; the "no infrastructure modules via unrestricted `export *`" constraint is satisfied — every export is explicit.

### R4 — Public and internal entry points — **CONFORMS**

- `package.json` `exports`: `"." → dist/public.js`, `"./internal" → dist/index.js`; build emits both entries plus the standalone worker bundle. `"."` does not use unrestricted `export *` of infrastructure. Tested (`barrel.spec.ts:25-65`).

### R5 — Lifecycle management — **CONFORMS**

- Explicit `open()`/`close()`; no auto-open/auto-close. `close()` idempotent; `Symbol.asyncDispose` supported (`code-graph-provider.ts:266-281`). Operations before open / after close throw `StoreNotOpenError`; backend readiness (worker spawn, schema prep, generation checks) deferred to `open()`. Long-lived-host pattern (sync create → await open → reuse → close) demonstrated. Tested (`code-graph-provider.spec.ts:78,169,223`).

### R6 — Dependency on @specd/core — **CONFORMS**

- `@specd/core` is a runtime dependency (`package.json` `"@specd/core": "workspace:*"`); factory accepts `SpecdConfig`; provider is stateless (derives storage path/project root only; does not cache config). Tested (`code-graph-provider.spec.ts:154` SpecdConfig instantiation).

### R7 — Host use cases — **CONFORMS**

- `GetGraphHealth`/`createGetGraphHealth`, `IndexProjectGraph`/`createIndexProjectGraph`, `GetSpecCoverage`/`createGetSpecCoverage`, `GetChangeSpecCoverage`/`createGetChangeSpecCoverage` exported from `"."` (also in `"./internal"`) and receive an already-open provider; they do not replace facade search/traversal/impact. Tested (`host-use-case-factories.spec.ts`, `get-graph-health.spec.ts`, `get-spec-coverage.spec.ts`, `get-change-spec-coverage.spec.ts`, `index-project-graph.spec.ts`).

### R8 — Symbol-reference provider surface — **CONFORMS**

- `resolveSymbolReference` / `resolveSymbolReferences` (single + batch, shared health snapshot, shared prepared queries) delegate to `ResolveSymbolReference` under availability checks; `getExactPublicBinding` resolves by surface+exportedName+space+targetId via `findPublicBindings` + `findDeclarations` — bypasses ranked/paginated search (`code-graph-provider.ts:661-680`). Selector resolution returns unique/ambiguous/missing outcomes with case-exact-first fallback (`resolve-graph-selector.ts`, `normalizeResolutionInputs`). Resolver input/result/status/reason/provenance types exported from `"."`; concrete `ResolveSymbolReference` class only from `"./internal"`. Tested (`code-graph-provider.spec.ts:236,257`; `resolve-symbol-reference.spec.ts`; `barrel.spec.ts:51`).

### R9 — Code Graph-orchestrated search surface — **CONFORMS**

- Provider `search(input: SearchCodeGraphInput)` is the single authoritative multi-category operation; exact file selectors normalized from canonical/config-relative/absolute to one graph file (`hasWildcard` preserves pattern semantics; exact files flagged `exactFile: true`, `code-graph-provider.ts:852-868`). `SearchCodeGraph` builds the shared query plan, runs semantic-symbol and source-content lanes, suppresses only declaration-name occurrences, groups/ranks, caps general occurrences per file, applies category limits; exact single-file searches return every retained occurrence. Delivery adapters delegate one unified request (CLI uses `provider.search`). Unified input/result + source-match value objects exported from `"."`; backend candidate helpers internal. Tested (`search-code-graph.spec.ts` 15 cases; `code-graph-provider.spec.ts:334,371`).

## Discrepancies (spec vs code)

### D4 — `SqliteGraphStoreOptions` vs `SQLiteGraphStoreOptions` naming — see R3.

### D5 — Extra public exports beyond enumerated list — see R3.

Both are low-severity; neither breaks behavior or tests.

## Test Coverage (per requirement)

| Req                         | Coverage     | Evidence                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 facade                   | covered      | `code-graph-provider.spec.ts` (delegation, clear, selectors, stale generation)                                                                                                                                                                                                                                     |
| R2 factory                  | covered      | `code-graph-provider.spec.ts:41-116,154` (default/ladybug/sqlite explicit, custom factory, SpecdConfig overload, custom store)                                                                                                                                                                                     |
| R3 package exports          | insufficient | `barrel.spec.ts` covers internal-only + type-only + version; does **not** assert export presence of `GraphStoreFactory`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `createSqliteGraphStoreFactory`, `LanguageAdapter`, model types, `SpecNotFoundError` code/specId from `"."` |
| R4 entry points             | covered      | `barrel.spec.ts:25-49`; `package.json` exports inspection                                                                                                                                                                                                                                                          |
| R5 lifecycle                | covered      | `:78` (before/after open), `:169` (idempotent close), `:223` (asyncDispose)                                                                                                                                                                                                                                        |
| R6 @specd/core              | covered      | `:154` SpecdConfig path + package.json dependency                                                                                                                                                                                                                                                                  |
| R7 host use cases           | covered      | `host-use-case-factories.spec.ts` + per-use-case suites                                                                                                                                                                                                                                                            |
| R8 symbol-reference surface | covered      | `:236,257`; `resolve-symbol-reference.spec.ts`; `barrel.spec.ts:51`                                                                                                                                                                                                                                                |
| R9 unified search           | covered      | `search-code-graph.spec.ts` (15), `:334,371`                                                                                                                                                                                                                                                                       |

## Missing Tests

1. **`SqliteRuntimeDescriptor.modulePath` end-to-end** — the verify scenario "Custom SQLite runtime descriptor is accepted by factory" (descriptor passes to worker during `open()`) has no test; `createSqliteGraphStoreFactory` is untested.
2. **`createSqliteGraphStoreFactory` behavior** — no test exercises the factory (options plumb-through of `runtime`/`maxPendingOperations`, rejection path for invalid `maxPendingOperations`).
3. **`"."` export presence of composition types** — `GraphStoreFactory`, `GraphStoreFactoryOptions`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `createSqliteGraphStoreFactory`, `LanguageAdapter`, model vocabulary, and `SpecNotFoundError` (`SPEC_NOT_FOUND` code + `specId`) are not asserted as importable from the public barrel.
4. **"Host use case factories are named exports"** — `host-use-case-factories.spec.ts` imports from internal paths; it never imports `createGetGraphHealth` etc. from `src/public.js`.

## Spec Dependency Chain Conformance

- `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:indexer`, `code-graph:traversal`: composition delegates only through abstract ports/use cases; no coupling to concrete store internals. Consistent.
- `default:_global/architecture`: hexagonal layering — store adapters in `infrastructure/sqlite`, port in `domain/ports/graph-store.ts`, provider in `composition/`. Consistent.
- `code-graph:get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`, `resolve-symbol-reference`: factories and use cases wired into composition and exported. Consistent.
- No contradictions between the change spec and dependency specs.

## Summary — `code-graph:composition`

- **Requirements:** 9
- **Pass:** 8
- **Partial:** 1 (R3 — Package exports: `SqliteGraphStoreOptions` naming discrepancy + minor over-export)
- **Fail:** 0

---

# Aggregated Summary

| Spec                          | Requirements | Pass   | Partial | Fail  |
| ----------------------------- | ------------ | ------ | ------- | ----- |
| code-graph:sqlite-graph-store | 15           | 15     | 0       | 0     |
| code-graph:composition        | 9            | 8      | 1       | 0     |
| **Total**                     | **24**       | **23** | **1**   | **0** |

Overall: implementation is highly conformant; both specs' behavior is implemented and heavily tested (179 audited test cases green). The only partial is the composition public-surface naming/over-export (D4/D5). Two spec-level cleanups recommended: align R9 relation-family enumeration with `code-graph:graph-store` (D1) and reconcile `SqliteGraphStoreOptions`/`SQLiteGraphStoreOptions` naming (D4). Missing tests are limited to runtime-descriptor plumbing and `"."` export-presence assertions.
