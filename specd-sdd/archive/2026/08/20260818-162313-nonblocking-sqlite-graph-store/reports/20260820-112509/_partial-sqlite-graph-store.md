# Spec Compliance Audit — `code-graph:sqlite-graph-store`

- **Change:** `nonblocking-sqlite-graph-store` (20260818-162313)
- **Audit scope:** merged spec `code-graph:sqlite-graph-store` (spec.md + verify.md, deltas applied) vs implementation + tests
- **Audit date:** 2026-08-20T11:2x
- **Mode:** READ-ONLY (no code/spec files modified)
- **Test run:** `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/ test/composition/create-sqlite-graph-store-factory.spec.ts` → **149/149 passed** (7 files: protocol 4, dist 2, backpressure 2, responsiveness 1, factory 5, lifecycle 22, graph-store 113). Known `ERR_IPC_CHANNEL_CLOSED` unhandled rejection is a pre-existing LadybugDB native-addon artifact.

---

## 1. Previous-Audit Fix Verification (the 8 items)

| #   | Claimed fix                                                                                                                                                                  | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Typed `BulkSessionStateError` (code `BULK_SESSION_STATE`) extends `SpecdCodeGraphError` for host bulk-session state machine; `deserializeWorkerError` reconstructs it        | ✅ **Confirmed** | `packages/code-graph/src/domain/errors/bulk-session-state-error.ts:8-15` (`get code() => 'BULK_SESSION_STATE'`). Host state machine throws it at `src/infrastructure/sqlite/sqlite-graph-store.ts:881` (already active), `:899` (already finished), `:914` (write/commit/rollback while `committing`/`rolling-back`). `deserializeWorkerError` reconstructs at `src/infrastructure/sqlite/sqlite-worker-client.ts:140-142`. `BulkSessionStateError` extends `SpecdCodeGraphError` → `SpecdError` chain (`specd-code-graph-error.ts:6`). |
| 2   | `InvalidGraphStoreConfigurationError` (code `INVALID_GRAPH_STORE_CONFIGURATION`) for invalid `maxPendingOperations` in `open()`                                              | ✅ **Confirmed** | `src/domain/errors/invalid-graph-store-configuration-error.ts:7-14`; thrown at `src/infrastructure/sqlite/sqlite-worker-client.ts:241-245` (non-number / non-integer / < 1); deserialized host-side at `sqlite-worker-client.ts:143-145`. Test: lifecycle spec "rejects invalid maxPendingOperations strictly on open" (`test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts:75`); factory test "rejects an invalid maxPendingOperations at open" (`test/composition/create-sqlite-graph-store-factory.spec.ts:50-57`).          |
| 3   | `GraphSchemaIncompatibleError` (code `GRAPH_SCHEMA_INCOMPATIBLE`) in `assertExistingSchemaCompatible` / `ensureSchemaVersion`                                                | ✅ **Confirmed** | `src/domain/errors/graph-schema-incompatible-error.ts:7-14`; thrown at `src/infrastructure/sqlite/sqlite-graph-database.ts:2240` (`assertExistingSchemaCompatible`) and `:2264` (`ensureSchemaVersion`); deserialized at `sqlite-worker-client.ts:146-148`. Test: "rejects an incompatible prior schema without recreating derived storage" (`test/infrastructure/sqlite/sqlite-graph-store.spec.ts:355-369`, asserts message "schema 8 is incompatible with expected 9").                                                              |
| 4   | Worker-side session lookup failures (`createBulkSession`/`requireBulkSession`, duplicate sessionId) throw `BulkSessionStateError`; unknown op stays generic internal `Error` | ✅ **Confirmed** | `requireBulkSession` throws at `src/infrastructure/sqlite/sqlite-worker.ts:118`; duplicate sessionId in `beginBulkIndexSession` at `:505`; default branch remains generic `Error` at `:600` (acceptable per ADR-0025). Worker `serializeError` forwards `code` (`sqlite-worker.ts:52`).                                                                                                                                                                                                                                                 |
| 5   | Real JSDoc descriptions on `SQLiteGraphStoreOptions` and `WorkerBulkSession`                                                                                                 | ✅ **Confirmed** | `src/infrastructure/sqlite/sqlite-runtime-descriptor.ts:15-20` (`SQLiteGraphStoreOptions` with described `runtime` + `maxPendingOperations`); `src/infrastructure/sqlite/sqlite-worker.ts:63-66` (`WorkerBulkSession` accumulator description).                                                                                                                                                                                                                                                                                         |
| 6   | ADR-0025 at `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md` with `### Confirmation` and `### Spec`                                                                  | ✅ **Confirmed** | File exists; `### Confirmation` at line 110; `### Spec` at line 162. MADR front matter present; linked from spec `## ADRs` (delta `specd-sdd/.../deltas/code-graph/sqlite-graph-store/spec.md.delta.yaml:176-179`).                                                                                                                                                                                                                                                                                                                     |
| 7   | `SqliteRuntimeDescriptor.modulePath` exercised end-to-end                                                                                                                    | ✅ **Confirmed** | `test/composition/create-sqlite-graph-store-factory.spec.ts:34-48` "plumbs runtime descriptor modulePath through to the worker during open" (`require.resolve('better-sqlite3')` passed as `modulePath`, store opens and `getStatistics()` works). Worker loads it at `sqlite-graph-database.ts:292-293`.                                                                                                                                                                                                                               |
| 8   | `createSqliteGraphStoreFactory` tests: runtime/maxPendingOperations plumb-through + invalid-config rejection                                                                 | ✅ **Confirmed** | `test/composition/create-sqlite-graph-store-factory.spec.ts` — plumb-through (34-48), invalid `maxPendingOperations: 0` → `InvalidGraphStoreConfigurationError` (50-57), non-loadable module fails open (59-68). Factory impl: `src/composition/create-sqlite-graph-store-factory.ts:21-31`.                                                                                                                                                                                                                                            |

All 8 prior-audit items verified as correctly implemented.

---

## 2. Requirements Summary

Merged spec (spec-preview) contains **15 requirements**. All verified against code + tests.

### 1. SQLite-backed implementation — ✅ SATISFIED

- `SQLiteGraphStore extends GraphStore` (`sqlite-graph-store.ts:103`), uses `better-sqlite3` (default import in worker at `sqlite-graph-database.ts:295`); all sync SQLite ops execute inside the worker (`sqlite-worker.ts:618-637` worker entry, `handleMessage` at `:153`).
- Host interacts only through async `GraphStore` interface via `SQLiteWorkerClient.sendRequest` (`sqlite-worker-client.ts:426-481`).
- **Tests:** `test/infrastructure/sqlite/sqlite-worker-responsiveness.spec.ts` (host event-loop responsiveness across chunked staging RPCs); full 113-test `sqlite-graph-store.spec.ts` suite.

### 2. Worker-backed non-blocking execution — ✅ SATISFIED (all 12 invariants)

1. **Persistent worker lifecycle** — one `Worker` per client (`sqlite-worker-client.ts:169`); `open()` spawns once (`:255`), `close()` terminates idempotently (`:339-409`); concurrent `open` shares `openPromise` (`:229-231`, `:251-308`), concurrent `close` shares `closePromise` (`:322-324`). Tests: lifecycle "shares in-flight initialization promise across concurrent open calls" (`:27`), "shares in-flight shutdown promise across concurrent close calls" (`:54`).
2. **Worker ownership** — `SQLiteGraphDatabase` instance created only inside worker (`sqlite-worker.ts:620`); connection + prepared-statement cache never cross boundary (DB DTOs only in protocol).
3. **Strongly-typed protocol** — `SQLiteWorkerOperationMap` maps op→payload/result (`sqlite-worker-protocol.ts:89-344`); monotonic ids `nextRequestId++` (`sqlite-worker-client.ts:173,465`); only structured-cloneable DTOs cross the boundary (`SerializedErrorPayload`, `SQLiteWorkerRequest/Response`).
4. **Worker FIFO serialization** — explicit serial promise queue `dispatchQueue = dispatchQueue.then(...)` (`sqlite-worker.ts:621-637`). Test: lifecycle "serializes recreate() strictly with concurrent queries in FIFO order" (`:125`).
5. **Bounded outstanding requests** — `maxPendingOperations` default 256 (`sqlite-worker-client.ts:174`), strictly validated integer ≥ 1 (`:239-247`); overflow rejects immediately with `StoreOverloadError` (`:459-463`). Tests: `sqlite-worker-backpressure.spec.ts:19-39`.
6. **Graceful shutdown & drain** — `close(drainTimeoutMs = 5000)` (`:318`); unref'd `withDeadline` helper (`:43-68`) covers `await openPromise`, drain phase, and close RPC ACK; remaining pending rejected with `StoreWorkerError` (`:382-390`); forced `worker.terminate()` (`:393-400`); `closePromise` cleared in outer `finally` (`:407`). Tests: "forces worker termination and rejects stuck requests when drain timeout expires" (`:200`), "bounds close() total time when worker ignores the close RPC" (`:297`), "rejects new requests with StoreNotOpenError once closing begins" (`:93`).
7. **Serializable runtime descriptor** — `SqliteRuntimeDescriptor { modulePath? }` (`sqlite-runtime-descriptor.ts:7-10`); worker loads via `import(runtime.modulePath)` (`sqlite-graph-database.ts:292-293`); `workerPath` only on internal options type (`:25-28`). Tests: factory modulePath test (`create-sqlite-graph-store-factory.spec.ts:34-48`).
8. **Fault isolation & manual recovery** — `faultWorker` → `'faulted'`, rejects outstanding with `StoreWorkerError` (`sqlite-worker-client.ts:576-591`); recovery via `close()` (resets faulted → closed, `:325-337`) then `open()`. Tests: lifecycle "isolates worker crashes and allows manual recovery via close() then open()" (`:152`), backpressure "rejects all in-flight pending requests with StoreWorkerError when worker exits unexpectedly" (`:41`).
9. **Concurrent open()/close() race** — `open()` transitions to `'open'` only if still `'opening'` (`:283-286`); `close()` awaits in-flight `openPromise` within deadline (`:344-356`). Test: "handles close() called while open() is still in-flight without exposing open state" (`:185`).
10. **Chunked bulk staging + lifecycle session token** — host session state machine `active/committing/rolling-back/finished` (`sqlite-graph-store.ts:51,888-1036`); bound to `lifecycleGeneration` (`:885,901-903`); invalidated on close/clear/recreate/crash (`invalidateBulkSession` `:113-115` called in `close`/`clear`/`recreate`); worker-side session map (`sqlite-worker.ts:80`); staging/commit/rollback against missing session rejects (`:118`, `:565`, `:595`); reference-facts chunks merged not replaced (`mergeReferenceFactChunks` `:131-143`); atomic single worker transaction commit. Tests: "merges reference-facts chunks staged through the same bulk session" (`:483`), "rejects writes, second commits, and rollbacks while a commit is in flight" (`:530`), "rejects writes and commits while a rollback is in flight" (`:555`), "stages a full bulk session under maxPendingOperations=1 without overload" (`:579`), "invalidates chunked bulk sessions on store close, worker crash, or recreate" (`:401`), clear invalidation (`:599`, `:627`).
11. **Isolated observational progress callbacks** — `try/catch` around `pending.onProgress?.(...)` (`sqlite-worker-client.ts:517-523`). Test: "isolates onProgress callback exceptions without failing the request" (`:327`).
12. **Non-blocking closed-store maintenance** — closed `recreate()` uses `rm` from `node:fs/promises` + `rotateStorageGenerationAsync` (`sqlite-graph-store.ts:663-668`; `storage-generation.ts:70-79`). Test: "executes recreate() asynchronously on closed store without lingering WAL/SHM files" (`:373`).

### 3. Config-derived persistence layout — ✅ SATISFIED

- `graphDir = join(storagePath,'graph')`, `tmpDir = join(storagePath,'tmp')`, `dbPath` under graph dir (`sqlite-graph-database.ts:259-261`); dirs created on demand (`:263-264`).
- **Tests:** "creates sqlite schema artifacts under graph/ and recreates backend state destructively" (`sqlite-graph-store.spec.ts:286-298`, asserts `graph/code-graph.sqlite`).

### 4. Default backend role — ✅ SATISFIED

- `DEFAULT_GRAPH_STORE_ID = 'sqlite'` (`create-code-graph-provider.ts:22`, selected at `:57`); registry contains `sqlite` and `ladybug` (`:32-35`).
- **Tests:** "can be instantiated with a SQLite backend by default" (`composition/code-graph-provider.spec.ts:41`), "can be instantiated with a Ladybug backend" (`:52`), "allows explicit selection of the sqlite backend" (`:64`). Ladybug-era capability parity exercised by full contract suite + use-case flows (e.g. `code-graph-provider.spec.ts:119` indexing, `:334` unified search, `:371` config-relative search, `:407` index-repair path).

### 5. Destructive recreation — ✅ SATISFIED

- Open-store path: `recreate` RPC → `database.recreate()` closes, `rmSync(graphDir)`, `rotateStorageGeneration`, reopens (`sqlite-graph-database.ts:313-324`). Closed-store path: host `rm` (fs/promises) + sidecar rotation (`sqlite-graph-store.ts:661-670`). WAL/SHM companions removed with the graph root.
- **Tests:** `sqlite-graph-store.spec.ts:286`, `:302` ("recreate on an open store reopens the store for subsequent operations"), lifecycle `:373`.

### 6. Storage generation sidecar — ✅ SATISFIED

- Sidecar at `graph/storage.epoch` (`storage-generation.ts:13-15`); `ensureStorageGeneration` on open (`sqlite-graph-database.ts:266`); generation observable via `readStorageGenerationSnapshot` RPC (`sqlite-worker.ts:425-428`, `sqlite-graph-store.ts:677-679`); rotated on destructive recreate (open path `:317`, closed path `:666`).
- **Tests:** "throws GraphProviderStaleError when the backing store generation changes..." (`composition/code-graph-provider.spec.ts:202`), index-repair rotation (`:407`).

### 7. SQLite schema ownership — ✅ SATISFIED

- `SQLITE_SCHEMA_DDL` owns files/symbols/specs/meta, relations, FTS virtual tables, and indexes (`src/infrastructure/sqlite/schema.ts`); relation types include `EXTENDS`/`IMPLEMENTS`/`OVERRIDES` (used e.g. at `sqlite-graph-database.ts:2132-2136`). Abstract `GraphStore` remains the storage-agnostic contract (spec Constraint). Scenario "Physical schema remains backend-specific" holds — table names/columns internal (`sqlite-graph-store.spec.ts` + contract tests).

### 8. Persisted node storage — ✅ SATISFIED

- `files` table includes `content` for snippet extraction (`schema.ts:6-14`); `symbols` (`:24-41`); `specs` (`:43-52`); `documents` with `path` PK, `config_relative_path`, `content_hash`, `content`, `workspace` (`:16-22`); `meta` (`:62-65`).
- **Tests:** document upsert/remove + reopen persistence (`sqlite-worker-lifecycle.spec.ts:444-477`), file content snippet extraction from persisted source (`sqlite-graph-store.spec.ts:433`), hierarchy/statistics across reopen (`:152`).

### 9. Persisted relation storage — ✅ SATISFIED

- Single `relations(source,target,type,metadata_json)` table (`schema.ts:54-60`); all 12 families represented via `RelationType`. `COVERS_SYMBOL` `metadata_json` preserves `stale`.
- **Tests:** shared contract `graph-store.contract.ts:1251-1331` (COVERS_SYMBOL `metadata: { stale: true }` round-trips) is executed against `SQLiteGraphStore` (imported at `sqlite-graph-store.spec.ts:24`).

### 10. SQLite full-text search — ✅ SATISFIED

- FTS5 virtual tables `symbol_fts`, `spec_fts`, `document_fts`, plus trigram `file_content_fts` (`schema.ts:162-188`). `searchSymbols/searchSpecs/searchDocuments` use `MATCH` candidate sets (`sqlite-graph-database.ts:1167-1211, 1330-1345, 1445-1463`).
- Multi-token OR sanitization (`sanitizeFtsQuery`, `prepareExpandedSearchQuery` `:3424-3430`).
- Token expansion via shared `expandSearchQuery`/`expandSymbolName` (`:5-6`).
- Identity-derived candidates supplement FTS via `buildIdentityCandidatePredicateSql` (`:3490-3513`, UNION ALL branch at `:1177-1184`).
- Identity-aware ranking via explicit SQL ordering `identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC` (`:1211`); tier ladder exact(5)/alternate-exact(4)/prefix(3)/token-hits(2)/else(1) (`:3440-3467`); strength ladder exact>prefix>suffix>component>substring (`:3687-3690`); BM25 only for remaining text (`:1172`, `:1335`, `:1453`).
- **Tests:** "exact-prefix-suffix-substring ordering" (`sqlite-graph-store.spec.ts:703`), "expands specd/code-shaped queries before applying sqlite ranking" (`:561`, incl. `default:_global/architecture` spec-id vs body-only), "discovers exact identities when the FTS indexes are unavailable" (`:641`), hyphen safety (`:819`), FTS operators literal (`:846`), OR multi-token (`:882`), BM25 precision (`:930`), document path identity (`:605-636`), config-relative document path (`:667-698`), snippet from file content (`:433`).

### 11. Transactional mutation model — ✅ SATISFIED

- `upsertFile`, `removeFile`, `upsertSpec`, `removeSpec`, `upsertDocument`, `removeDocument`, `addRelations` each run in a single `db.transaction(() => {...})()` within one worker op (`sqlite-graph-database.ts:1653,1673,1686,1713,1727,1754`). No transaction spans IPC round-trips (worker executes each op to completion before replying).
- **Tests:** contract atomicity tests + "rolls back the complete native bulk generation when persistence fails" (`sqlite-graph-store.spec.ts:68`).

### 12. Bulk indexing support — ✅ SATISFIED

- `bulkLoad()` uses chunked `IndexWriteSession` staging (`BULK_RPC_CHUNK_SIZE = 1000`, `sqlite-graph-store.ts:48,1047-1092`); `commitBulkIndex` is one atomic worker transaction (`sqlite-graph-database.ts:2125-2200`).
- Progress events emitted for all 9 stages — `cleanup`, `files`, `documents`, `symbols`, `specs`, `reference-facts`, `observations`, `relations`, `search-indexes` (`:2130-2191`), forwarded host-side via `onProgress` (`sqlite-worker.ts:580-587`, `sqlite-worker-client.ts:517-523`).
- **Tests:** `sqlite-graph-store.spec.ts` bulk paths, progress isolation (`lifecycle:327`), `maxPendingOperations=1` staging (`lifecycle:579`), responsiveness during chunked staging.

### 13. Schema versioning — ✅ SATISFIED

- `SQLITE_SCHEMA_VERSION = 9` (`schema.ts:1`); `open()` runs `assertExistingSchemaCompatible` + `ensureSchemaVersion` (`sqlite-graph-database.ts:270-274`); incompatible → `GraphSchemaIncompatibleError`, ordinary reads rejected (no silent empty recreation), rebuild permitted via reindex path.
- **Tests:** "rejects an incompatible prior schema without recreating derived storage" (`sqlite-graph-store.spec.ts:355-369`), "declares sqlite schema version and fts-backed ddl" (`:339`).

### 14. Backend-specific companion files — ✅ SATISFIED

- WAL/SHM created next to primary DB under `{configPath}/graph` (`configureDatabase` pragmas `journal_mode = WAL` at `sqlite-graph-database.ts:2277`); never addressed by callers; removed with graph root on recreate.
- **Tests:** "configures sqlite pragmas for concurrent reads and tolerant lock waits" (`sqlite-graph-store.spec.ts:321`), "executes recreate() asynchronously on closed store without lingering WAL/SHM files" (`lifecycle:373`).

### 15. Reference schema upgrade — ✅ SATISFIED

- Enriched logical-symbol/declaration/binding/coverage/provenance tables with structured lookup indexes (`schema.ts:67-160`: `idx_logical_symbols_lookup`, `idx_logical_symbols_member_lookup`, `idx_public_bindings_lookup`, `idx_public_bindings_name`, `idx_local_bindings_lookup`); canonical ids unchanged; backend-local row keys allowed.
- Source-content FTS with trigram tokenization (`file_content_fts`, `schema.ts:184-188`); candidate queries use normalized/raw/expanded terms with filters before limits (`searchSourceCandidates`, `sqlite-graph-database.ts:1529-1635`); sub-3-char queries use bounded indexed `instr(...)` fallback with LIMIT/OFFSET (`:1559-1624`).
- Set-based batched reverse coverage with dedup + deterministic ordering (`findIndexCoverage` family).
- Schema version 9; incompatible DB rejects reads; `graph index` destructive rebuild + `storage.epoch` rotation + FTS rebuild before ready (provider repair path `composition/code-graph-provider.spec.ts:407`).
- Indexed-input observations, freshness latches, VCS-scope evidence, unchanged-file facts persisted (`indexed_input_observations`, `freshness_latches`, `index_coverage` tables); one indexing run = one transaction, one FTS rebuild (`commitBulkIndex` `:2189-2192`; chunk appends do not rebuild FTS independently — `stageBulk*` are pure accumulators).
- **Tests:** `sqlite-graph-store.spec.ts` — observation batching (`:51`), source-content FTS incremental updates (`:115`), FTS rebuild on open (`:246`), logical/public binding FTS rebuild (`:374`), SQL-pushed filters (`:499`), IndexCoverage queries (`:980+`).

---

## 3. Implementation Status

- All 15 requirements **satisfied**; no requirement partially or unsatisfied.
- Prior-audit fixes 1–8 all correctly implemented (see Section 1).
- All tests green: 149/149 (7 files).

## 4. Discrepancies

**None found.** No requirement contradicts the implementation, and no code path contradicts a spec requirement. The unknown-worker-operation generic `Error` (`sqlite-worker.ts:600`) is explicitly acceptable per spec/ADR (internal protocol error, not host contract).

## 5. Test Coverage Assessment

- **Strong:** worker lifecycle (concurrent open/close, drain timeout, fault/crash, close-while-opening), backpressure, FIFO recreate serialization, bulk-session state machine, reference-fact merge, progress-callback isolation, closed-store async recreate, storage-generation rotation/stale detection, FTS identity-ranking ladder, schema incompatibility, maxPendingOperations=1 staging, modulePath end-to-end plumb.
- **Gap (minor):** `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts` directly round-trips only `STORE_NOT_OPEN`/`STORE_OVERLOAD`/`STORE_WORKER_ERROR`. The three NEW typed errors — `BULK_SESSION_STATE`, `INVALID_GRAPH_STORE_CONFIGURATION`, `GRAPH_SCHEMA_INCOMPATIBLE` — are exercised only indirectly (barrel.spec.ts asserts their `code`; integration tests assert type/message via `InvalidGraphStoreConfigurationError` at lifecycle:75 and the incompatible-schema message at graph-store.spec:368). A direct `serializeWorkerError`→`deserializeWorkerError` round-trip test for these three codes would harden the ADR-0025 "typed failures reconstruct on the host" confirmation.
- **Gap (minor):** no dedicated test for the host-side `beginBulkIndexSession` "already active" branch (`sqlite-graph-store.ts:880-882`) asserting `BulkSessionStateError` by type; the state-machine in-flight branches are covered by message-based assertions (`/committing/`, `/rolling-back/`).

## 6. Spec Dependency Chain Consistency

- `## Spec Dependencies` in merged spec matches `manifest.json` `specDependsOn["code-graph:sqlite-graph-store"]` exactly: `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, `code-graph:workspace-integration`.
- All four dependency specs exist on disk (`specs/code-graph/graph-store/spec.md`, `specs/core/config/spec.md`, `specs/code-graph/symbol-model/spec.md`, `specs/code-graph/workspace-integration/spec.md`).
- Consistency verified against the abstract `code-graph:graph-store` contract: storage-generation marker/sidecar (`graph/storage.epoch` valid realization), destructive `recreate()`, incompatible-schema-rejects-reads + index-repair rebuild, `COVERS_SYMBOL` `metadata.stale`, search identity-ranking semantics, `DocumentNode` FTS — all mirrored by the SQLite spec and implemented.
- Companion change spec `code-graph:composition` (same change) satisfies the "Default backend role" requirement (default id `sqlite` in `create-code-graph-provider.ts:22,57`; registry `:32-35`); its `specDependsOn` chain (`indexer`, `traversal`, `get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`, `resolve-symbol-reference`, `default:_global/architecture`) all resolve to existing specs.
- ADR-0025 is referenced by both `code-graph:sqlite-graph-store` and `code-graph:composition` `## ADRs` sections and exists with `### Confirmation` + `### Spec`.
- No circular dependency introduced (implementation links only add edges to existing DAG).

## 7. Summary

**15 requirements: 15 satisfied, 0 partial, 0 not-satisfied.** All 8 prior-audit items confirmed fixed. 149/149 tests pass. Two minor optional test-hardening gaps noted (direct serialization round-trip for the 3 new typed error codes; typed assertion for the host "already active" session branch). No implementation discrepancies.
