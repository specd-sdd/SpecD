# Spec Compliance Audit — Change `nonblocking-sqlite-graph-store`

- **Change:** `nonblocking-sqlite-graph-store` (20260818-162313)
- **Mode:** change (active change specs, merged preview with deltas applied)
- **Audit date:** 2026-08-20T11:25
- **Graph state:** re-indexed fresh (`graph index`) before audit
- **Method:** two parallel read-only subagent audits, one per change spec, against code + tests, plus global/project-wide spec consistency and direct-dependency chain checks
- **Previous report superseded:** `reports/20260819-214909/` (truncated, only `h`)

---

## Results Summary

| Spec                            | Requirements | Satisfied | Partial | Not satisfied |
| ------------------------------- | ------------ | --------- | ------- | ------------- |
| `code-graph:sqlite-graph-store` | 15           | 15        | 0       | 0             |
| `code-graph:composition`        | 9            | 9         | 0       | 0             |
| **Total**                       | **24**       | **24**    | **0**   | **0**         |

**Verdict: PASS — 24/24 requirements satisfied.** No blocking discrepancies. No change-attributable global-spec contradictions.

### Tests executed

- `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/ test/composition/create-sqlite-graph-store-factory.spec.ts` → **149/149 passed** (7 files)
- `pnpm --filter @specd/code-graph exec vitest run test/barrel.spec.ts test/composition/ test/application/use-cases/get-change-spec-coverage.spec.ts` → **38 passed** (5 files)
- Full suite (verify pre-hook pipeline): build + typecheck + tests + lint all green (`run-hooks verifying --phase pre`, exit 0)

### Prior-audit fixes re-verified (all confirmed)

1. Typed `BulkSessionStateError` (`BULK_SESSION_STATE`) for host bulk-session state machine; reconstructed host-side by `deserializeWorkerError`.
2. `InvalidGraphStoreConfigurationError` (`INVALID_GRAPH_STORE_CONFIGURATION`) for invalid `maxPendingOperations`.
3. `GraphSchemaIncompatibleError` (`GRAPH_SCHEMA_INCOMPATIBLE`) for incompatible persisted schema / schema-version enforcement.
4. Worker-side session lookup failures throw `BulkSessionStateError`; unknown-worker-op remains generic internal `Error` (acceptable per ADR-0025).
5. Real JSDoc on `SQLiteGraphStoreOptions` and `WorkerBulkSession`.
6. ADR-0025 exists with `### Confirmation` + `### Spec`, linked from both change specs.
7. `SqliteRuntimeDescriptor.modulePath` exercised end-to-end through worker open.
8. `createSqliteGraphStoreFactory` tests (plumb-through + invalid-config rejection + non-loadable module).
9. Composition spec uses `SQLiteGraphStoreOptions` (capital L); "SHALL export only" clarified to allow dependent-spec-required types; three typed errors in exports list.
10. Public-barrel smoke tests present (`barrel.spec.ts`).
11. `as unknown as Port` removed from `host-use-case-factories.spec.ts` and `get-change-spec-coverage.spec.ts` (typed `StubChangeRepository`).

### Non-blocking findings (for awareness, no action required)

- `resolveSymbolSelector` facade signature drift (`ResolvedSymbolSelector[]` vs richer `ResolvedSymbolSelectorResult`) — pre-existing, not introduced by this change.
- `SqliteGraphStoreFactoryOptions` exported from `"."` but not individually named in the composition spec export list (reasonable additive export).
- Optional test-hardening gaps (not blockers): direct `serializeWorkerError`→`deserializeWorkerError` round-trip for the 3 new typed error codes; typed assertion for host "already active" session branch; literal post-close `analyzeImpact` test; direct provider-level `resolveFileSelector` test.

---

## Detailed Findings

The complete verbatim contents of each subagent partial report follow.

### Partial: `code-graph:sqlite-graph-store`

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

## **15 requirements: 15 satisfied, 0 partial, 0 not-satisfied.** All 8 prior-audit items confirmed fixed. 149/149 tests pass. Two minor optional test-hardening gaps noted (direct serialization round-trip for the 3 new typed error codes; typed assertion for the host "already active" session branch). No implementation discrepancies.

### Partial: `code-graph:composition`

# Spec Compliance Partial Report — `code-graph:composition`

- **Change:** `nonblocking-sqlite-graph-store`
- **Spec audited:** `code-graph:composition`
- **Mode:** change (active change spec, merged preview)
- **Audit date:** 2026-08-20
- **Auditor mode:** read-only (no code or spec files modified)

---

## Scope & Method

- Spec content read via `node packages/cli/dist/index.js changes spec-preview nonblocking-sqlite-graph-store code-graph:composition` (merged spec.md + verify.md with deltas applied).
- Base (unmerged) spec read from `specs/code-graph/composition/spec.md` to confirm delta application.
- Deltas inspected directly at `specd-sdd/changes/20260818-162313-nonblocking-sqlite-graph-store/deltas/code-graph/composition/spec.md.delta.yaml` and `verify.md.delta.yaml`.
- Implementation inspected under `packages/code-graph/src/` (composition, public barrel, errors, runtime descriptor, package.json).
- Tests run:
  ```
  pnpm --filter @specd/code-graph exec vitest run test/barrel.spec.ts test/composition/ test/application/use-cases/get-change-spec-coverage.spec.ts
  ```
  Result: **5 test files passed, 38 tests passed** (barrel 10, host-use-case-factories 4, create-sqlite-graph-store-factory 5, code-graph-provider 17, get-change-spec-coverage 2). No ERR_IPC_CHANNEL_CLOSED unhandled rejection appeared in this run.
- Dependency specs existence verified via `specs list`; global project context via `project context`.

---

## Requirements Summary

### Requirement 1: CodeGraphProvider facade

**Verdict: SATISFIED**

The `CodeGraphProvider` interface in `packages/code-graph/src/composition/code-graph-provider.ts:104-193` declares the full public surface: indexing (`index`), querying (`getSymbol`, `findSymbols`, `getFile`, `getDocument`, `findFilesByConfigRelativePath`, `findDocumentsByConfigRelativePath`, `getSpec`, `getSpecDependencies`, `getSpecDependents`, `getCoveredFiles`, `getCoveringSpecsForFile`, `getCoveredSymbols`, `getCoveringSpecsForSymbol`, `getStatistics`), search (`searchSymbols`, `searchSpecs`, `searchDocuments`), maintenance (`clear`), traversal (`getUpstream`, `getDownstream`), impact (`analyzeImpact`, `analyzeFileImpact`, `analyzeFilesImpact`, `analyzeSpecImpact`, `detectChanges`, `getHotspots`), selector normalization (`resolveFileSelector`, `resolveSymbolSelector`), and lifecycle (`open`, `close`).

- Delegation to `GraphStore` confirmed: `code-graph-provider.ts:315-318` (`findSymbols` → `this.store.findSymbols`), `478-481` (`getSpec` → `this.store.getSpec`), etc. All query methods delegate to `this.store.*`.
- `getSpec` returns `Promise<SpecNode | undefined>` (`code-graph-provider.ts:118`), satisfying "returns undefined when spec not indexed".
- `index` runs `IndexCodeGraph` (`this.indexer.execute`) and owns force-reset/lock policy via `withIndexLock` + `store.recreate()` when `options.force` (`code-graph-provider.ts:288-298`).
- `clear()` preserves lifecycle contract, wrapped in the index lock (`code-graph-provider.ts:788-794`).
- `CodeGraphProvider` is a type-only public interface; `CodeGraphProviderImpl` (concrete class, constructor, `GraphStore`, `IndexCodeGraph` inputs) stays internal to the package (`code-graph-provider.ts:198`, exported only within composition, never from `public.ts`).

**Test coverage:** `test/composition/code-graph-provider.spec.ts` — instantiation with SQLite default (41), Ladybug (52), explicit sqlite (64), `StoreNotOpenError` before open (78), indexing delegation (119), SpecdConfig factory (154), idempotent close (169), clear keeps store ready (180), stale generation error (202), async disposal (223), batch resolution (236), exact binding lookup (257), unified search (334), file-filter normalization (371), schema-incompatible repair (407). **Coverage adequate.**

---

### Requirement 2: Factory function

**Verdict: SATISFIED**

`createCodeGraphProvider` in `packages/code-graph/src/composition/create-code-graph-provider.ts:49-101`:

1. Derives storage root from `config.configPath` (line 53) when `SpecdConfig`, else `options.storagePath`.
2. Resolves backend id via `options.graphStoreId ?? DEFAULT_GRAPH_STORE_ID` (`'sqlite'`, line 22/57).
3. Merges registry: `createGraphStoreRegistry` (lines 119-130) merges `BUILTIN_GRAPH_STORE_FACTORIES` (ladybug + sqlite, lines 32-35) with additive `graphStoreFactories`, rejecting collisions with `GraphStoreRegistryError`.
4. Creates the concrete `GraphStore` from the registry (line 63).
5. Creates `AdapterRegistry` and registers built-in adapters TypeScript, Python, Go, PHP (lines 65-69).
6. Registers additive `options.adapters` (lines 71-73).
7. Creates `IndexCodeGraph` with store + registry (line 75).
8. Returns `CodeGraphProvider` (line 100).

- Overload detection via `isSpecdConfig` (`'configPath' in options && 'workspaces' in options`, lines 108-110).
- Default backend id is `sqlite`; `ladybug` only when explicitly selected — confirmed.
- Factory creation is synchronous — the function returns a provider without `await`; native loading/worker startup happens in `open()` (verified: `createSqliteGraphStoreFactory` returns a plain factory object, `create-sqlite-graph-store-factory.ts:21-32`; `SQLiteGraphStore` constructor is sync, `open()` is the async boundary).
- Runtime SQLite config crosses the worker boundary as a serializable descriptor `SqliteRuntimeDescriptor` (`modulePath`), `sqlite-runtime-descriptor.ts:7-10`.
- `CodeGraphProvider` type-only; no provider constructor exported from `"."` (barrel test asserts `'CodeGraphProvider' in publicModule` is false, `barrel.spec.ts:77-83`).
- `CodeGraphCompositionOptions` supports the same additive model as `CodeGraphOptions` (`graph-store-factory.ts:28-35`).

**Test coverage:** `code-graph-provider.spec.ts:41-117` (default/sqlite/ladybug/custom store factory), `154-167` (SpecdConfig factory derives storage root). `create-sqlite-graph-store-factory.spec.ts:23-72` (openable default store, runtime `modulePath` plumbed through to worker during `open`, invalid `maxPendingOperations` rejects with `InvalidGraphStoreConfigurationError` at open, non-loadable module fails open, worker path resolution). Factory-only construction covered by `barrel.spec.ts:77-83`. **Coverage adequate.**

---

### Requirement 3: Package exports

**Verdict: SATISFIED**

`packages/code-graph/src/public.ts` exports the curated surface; verified against the merged spec's list:

- **Composition & wiring:** `createCodeGraphProvider` (line 2), type-only `CodeGraphProvider` (18), `CodeGraphCompositionOptions` (12), `CodeGraphOptions` (13), `GraphStoreFactory` (14), `GraphStoreFactoryOptions` (15), `createSqliteGraphStoreFactory` (4), `SqliteRuntimeDescriptor` (8), **`SQLiteGraphStoreOptions` (line 9, capital L)**. ✅
- **Host use cases:** `GetGraphHealth` (26), `GetGraphHealthInput` (27), `GetGraphHealthResult` (28), `createGetGraphHealth` (31), `IndexProjectGraph` (33), `IndexProjectGraphInput` (34), `createIndexProjectGraph` (36), `GetSpecCoverage` (38), `GetSpecCoverageInput` (39), `GetSpecCoverageResult` (40), `createGetSpecCoverage` (42), `GetChangeSpecCoverage` (44), `GetChangeSpecCoverageInput` (45), `GetChangeSpecCoverageResult` (46), `createGetChangeSpecCoverage` (48). ✅
- **VCS & Config:** `buildProjectGraphConfig` (191), `createBootstrapGraphConfig` (188), `GraphConfigOverrides` (192). ✅
- **Indexer & Discovery:** `IndexOptions` (111), `IndexProgressCallback` (112), `ProjectGraphConfig` (113), `WorkspaceIndexTarget` (114), `DiscoveredSpec` (115), `IndexResult` (118), `IndexError` (119), `WorkspaceIndexBreakdown` (120), `DiscoverFilesOptions` (169), `DEFAULT_EXCLUDE_PATHS` (168). ✅
- **Traversal & Impact:** `TraversalOptions` (126), `TraversalResult` (127), `ImpactResult` (131), `FileImpactResult` (132), `ChangeDetectionResult` (134), `RiskLevel` (135), `analyzeFilesImpact` (176). ✅
- **Hotspots:** `DEFAULT_HOTSPOT_KINDS` (137), `HotspotEntry` (138), `HotspotOptions` (139), `HotspotResult` (140). ✅
- **Search:** `SearchOptions` (144), `expandSymbolName` (173), `expandSearchQuery`/`expandSearchToken` (174). ✅
- **Staleness & Fingerprint:** `isGraphStale` (175), `computeGraphFingerprint` (178), `computeRootFingerprint` (179), `computeWorkspaceFingerprint` (180), `parseFingerprintMap` (181), `serializeFingerprintMap` (182), `detectFingerprintMismatch` (183), `GraphFingerprintInput` (184). ✅
- **Language Adapter:** `LanguageAdapter` (71). ✅
- **Model/Vocabulary:** `FileNode` (62), `DocumentNode` (63), `SymbolNode` (64), `SpecNode` (65), `Relation` (66), `SymbolKind` (67), `RelationType` (68), `SymbolQuery` (69), `GraphStatistics` (70), `ImportDeclaration` (72), `ImportDeclarationKind` (73), `SourceLocation` (74), `BindingScopeKind` (98), `BindingSourceKind` (99), `BindingScope` (100), `BindingFact` (101), `CallForm` (104), `CallFact` (105), `ResolvedDependency` (106). ✅
- **Errors:** `SpecdCodeGraphError` (195) and subclasses incl. `StoreNotOpenError` (201), `InvalidSymbolKindError` (196), `InvalidRelationTypeError` (197), `DuplicateSymbolIdError` (198), `SpecNotFoundError` (202), `GraphProviderStaleError` (200), `StoreOverloadError` (203), `StoreWorkerError` (204), **`BulkSessionStateError` (205), `InvalidGraphStoreConfigurationError` (206), `GraphSchemaIncompatibleError` (207)**. ✅
- **Version:** `CODE_GRAPH_VERSION` (212). ✅

- Lock-management helpers (`acquireGraphIndexLock`, `getGraphIndexLockPath`) and provider-internal recreation/reset helpers are **NOT** exported from `"."` — they appear only in `src/index.ts:227` (internal barrel). ✅
- The following are exported only from `"./internal"` (`src/index.ts`), not `"."`: `InMemoryIndexSession` (index.ts:139), `SQLiteGraphStore` (25), `LadybugGraphStore` (26), `AdapterRegistry` (27), built-in language adapters (28-31), `ResolveSymbolReference` (58), `normalizeFileSelectorPath` (193), lock helpers (227). ✅ Verified by `barrel.spec.ts:43-75`.
- `public.ts` uses explicit named exports only — no unrestricted `export *` of infrastructure modules. ✅

**Test coverage:** `test/barrel.spec.ts` — 10 tests covering CODE_GRAPH_VERSION (35), `InMemoryIndexSession` internal-only (43), concrete store adapters internal-only (49), `ResolveSymbolReference` internal-only (69), `CodeGraphProvider` type-only (77), logical-symbol types (85), graph-store composition surface incl. `SQLiteGraphStoreOptions` (98), language adapter + model vocabulary (117), host use-case factories named exports (125), typed SQLite errors with stable codes (144). **Coverage adequate.**

---

### Requirement 4: Public and internal entry points

**Verdict: SATISFIED**

`packages/code-graph/package.json` `exports` (lines 22-31):

- `"."` → `./dist/public.js` / `./dist/public.d.ts`
- `"./internal"` → `./dist/index.js` / `./dist/index.d.ts`

`src/public.ts` is the curated `"."` barrel; `src/index.ts` is the full `"./internal"` barrel (includes indexer internals, store adapter symbols, `InMemoryIndexSession`). The `"."` barrel uses explicit re-exports, not unrestricted `export *`.

**Test coverage:** `barrel.spec.ts:43-75` (InMemoryIndexSession + concrete adapters only on internal), and package.json exports inspected directly (no automated test asserts the exports map beyond the barrel smoke tests — acceptable as a package-manifest fact verified in this audit). **Coverage adequate.**

---

### Requirement 5: Lifecycle management

**Verdict: SATISFIED**

- Explicit lifecycle: no auto-open/auto-close. `CodeGraphProviderImpl.open()` (code-graph-provider.ts:233-241) and `close()` (266-274) are guarded by `_isOpen`; `close()` is idempotent (returns early when already closed). `[Symbol.asyncDispose]` delegates to `close()` (279-281).
- Methods call `assertAvailable()`/`assertProviderOpen()` and throw `StoreNotOpenError` when not open (lines 906-935).
- `open()` is the async boundary where backend readiness happens (`store.open()`), consistent with deferred worker startup / schema preparation.
- Provider-owned indexing locks (`withIndexLock`, lines 942-952) and `recreate()`/force-reset remain internal.

**Test coverage:** `code-graph-provider.spec.ts:78` (method before open → `StoreNotOpenError`), `169-178` (close idempotent — double close resolves without error), `223-234` (async dispose → subsequent call throws `StoreNotOpenError`). `sqlite-graph-store.spec.ts` and `sqlite-worker-lifecycle.spec.ts` (outside this run) cover worker/connection termination. The verify scenario "method after close throws (`analyzeImpact`)" is not tested by a literal `analyzeImpact` call, but the same availability gate (`assertAvailable`) is exercised via `getStatistics` after close (line 86) and after dispose (233). **Minor gap:** no direct post-close `analyzeImpact` test; indirect coverage only. Rated adequate overall.

---

### Requirement 6: Dependency on @specd/core

**Verdict: SATISFIED**

- `packages/code-graph/package.json:17` lists `"@specd/core": "workspace:*"` as a runtime dependency.
- `createCodeGraphProvider` accepts `SpecdConfig` from `@specd/core` (`create-code-graph-provider.ts:1, 50, 108-110`) and derives `storagePath` only; the provider is stateless (does not cache config).
- `SpecdError` from `@specd/core` is the base of `SpecdCodeGraphError` (`specd-code-graph-error.ts:1,6`).

**Test coverage:** `code-graph-provider.spec.ts:154-167` (factory from `SpecdConfig`, open + query + close). Dependency declaration verified in package.json. **Coverage adequate.**

---

### Requirement 7: Host use cases

**Verdict: SATISFIED**

- Composition factories exist for all four: `createGetGraphHealth` (`composition/use-cases/get-graph-health.ts:9-11`), `createIndexProjectGraph` (`index-project-graph.ts:8-10`), `createGetSpecCoverage` (`get-spec-coverage.ts:8-10`), `createGetChangeSpecCoverage` (`get-change-spec-coverage.ts:11-15`).
- All four are named exports of `"."` (`public.ts:31,36,42,48`) and of `"./internal"` (`index.ts:40,45,51,57`).
- Each factory returns stateless instances; use cases accept an already-open provider and do not open/close it (verified against dependent specs `code-graph:get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`).
- Use cases do not replace provider search/hotspot/impact/traversal methods — those remain facade delegates.

**Test coverage:** `host-use-case-factories.spec.ts` (4 tests: statelessness of each factory + delegation of injected `GetSpecCoverage` in `createGetChangeSpecCoverage`), `barrel.spec.ts:125-142` (named exports), `get-change-spec-coverage.spec.ts` (2 tests: manifest-order aggregation + `ChangeNotFoundError`). **Coverage adequate.**

---

### Requirement 8: Symbol-reference provider surface

**Verdict: SATISFIED**

- `CodeGraphProvider` exposes single + batch resolution (`resolveSymbolReference`, `resolveSymbolReferences` — `code-graph-provider.ts:127-134, 598-654`) delegating to `ResolveSymbolReference` under `assertAvailable()`.
- Exact public-binding lookup `getExactPublicBinding(ExactPublicBindingSelector)` returns binding + declarations via `store.findPublicBindings` + `store.findDeclarations` — bypasses ranked/paginated search (`code-graph-provider.ts:135-137, 661-680`).
- Selector resolution distinguishes resolved/ambiguous/missing outcomes via `ResolvedSymbolSelectorResult` union and bounds ambiguity candidates (`MAX_AMBIGUITY_CANDIDATES = 10`, `resolve-graph-selector.ts:35-44`).
- Curated `"."` surface exports resolver input/result/status/reason/provenance types and factories (logical-symbol, public-binding, coverage vocabulary): `SymbolSpace`, `MemberForm`, `createLogicalSymbol`, `createPublicBinding`, `ResolutionStatus`, `SymbolResolutionResult`, etc. (`public.ts:75-95`).
- Concrete `ResolveSymbolReference` implementation is **not** exported from `"."` (only `index.ts:58` internal). Verified by `barrel.spec.ts:69-75`.

**Test coverage:** `code-graph-provider.spec.ts:236` (batch resolution under open provider), `257-332` (exact public binding lookup across 25 pages of same-name bindings; asserts `searchSymbols` spy NOT called). `barrel.spec.ts:69` (resolver internal-only). **Coverage adequate.**

---

### Requirement 9: Code Graph-orchestrated search surface

**Verdict: SATISFIED**

- `CodeGraphProvider.search(input: SearchCodeGraphInput)` — one multi-category operation (symbols/files/specs/documents, filters, limit, snippet) delegating to `SearchCodeGraph` (`code-graph-provider.ts:178, 852-868`).
- Exact file-filter normalization: provider resolves config-relative/absolute selectors to one canonical file and sets `exactFile: true`; wildcard patterns stay patterns (`hasWildcard`, `code-graph-provider.ts:852-868, 1027-1029`).
- Application use case `SearchCodeGraph` executes the unified lanes, suppresses duplicates, groups, ranks, caps, applies limits (implementation in `application/use-cases/search-code-graph.js`).
- Curated `"."` exports unified search input/result and source-match value objects: `SearchCategory`, `SearchCodeGraphInput`, `SearchCodeGraphResult`, `SourceContentMatch`, `SourceFileSearchResult`, `SourceSearchMatchKind`, `SourceSearchSnippet` (`public.ts:145-160`). Backend candidate helpers remain internal.

**Test coverage:** `code-graph-provider.spec.ts:334-369` (unified search across categories — returns one deterministic projection), `371-405` (exact config-relative file filter returns every retained occurrence — 15/15 matches). **Coverage adequate.**

---

## Implementation Status

Overall: **9 of 9 requirements satisfied.** No requirement is partial or unsatisfied at the code level. The change's implementation (`createSqliteGraphStoreFactory`, `SQLiteGraphStoreOptions`, typed errors, host use-case factories, public/internal barrels, StubChangeRepository tests) is present, exported, and tested.

---

## Discrepancies

### D1 — Spec signature drift: `resolveSymbolSelector` return type (minor, pre-existing)

- **Spec (merged + base):** `resolveSymbolSelector(selector: string): Promise<ResolvedSymbolSelector[]>` (`specs/code-graph/composition/spec.md:21`).
- **Code:** `resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelectorResult>` (`code-graph-provider.ts:117`), where `ResolvedSymbolSelectorResult` is a status-tagged union `resolved | ambiguous | missing` (`resolve-graph-selector.ts:35-42`).
- **Assessment:** The code is richer and satisfies the separate "Selector resolution SHALL distinguish unique, ambiguous, and missing outcomes" requirement (Requirement 8) better than the literal facade signature. This drift pre-dates the current delta (the delta does not modify the facade section). Recommendation: align the facade line in the spec to `Promise<ResolvedSymbolSelectorResult>` for accuracy. **Not a blocking discrepancy for this change** — the new implementation does not regress it.

### D2 — `SqliteGraphStoreFactoryOptions` is exported from `"."` but not named in the spec's export list (minor)

- **Code:** `public.ts:5` exports `type SqliteGraphStoreFactoryOptions` from `create-sqlite-graph-store-factory.ts:8`.
- **Spec:** The Composition & wiring list names `GraphStoreFactoryOptions` and `SQLiteGraphStoreOptions` but not `SqliteGraphStoreFactoryOptions`.
- **Assessment:** The spec's wording "plus any other types explicitly required by dependent specifications" and the composition types being integral to `createSqliteGraphStoreFactory` make this a reasonable additive export; the factory's own options type being public is coherent. Either document it in the spec list or note it as an intentional additive export. **Non-blocking; flagging for completeness.**

### D3 — `verify.md` uses `SqliteRuntimeDescriptor` naming in scenario (consistent), but `spec-preview` shows capital-L consistency only in `SQLiteGraphStoreOptions` — no lower-case `SqliteGraphStoreOptions` anywhere in code or merged spec. ✅ Confirmed the audit-fix objective: no code change to lowercase `SqliteGraphStoreOptions` is needed; the code and merged spec both use `SQLiteGraphStoreOptions`. (Not a discrepancy — recorded for audit-fix verification.)

---

## Recent Audit Fixes — Verification

1. **`SQLiteGraphStoreOptions` (capital L):** ✅ Confirmed. Interface defined at `infrastructure/sqlite/sqlite-runtime-descriptor.ts:15`; re-exported as `SQLiteGraphStoreOptions` from `public.ts:9` and `index.ts:9`. No lowercase `SqliteGraphStoreOptions` exists in `src/` or `test/` (grep verified). Merged spec delta list uses `SQLiteGraphStoreOptions` (`spec.md.delta.yaml:56`). Code was NOT changed to lowercase; spec was corrected to match.
2. **"SHALL export only" clarified:** ✅ Confirmed. Base spec line 73 reads "SHALL export only:"; the delta (`spec.md.delta.yaml:54`) replaces it with "SHALL export the listed public surface, **plus any other types explicitly required by dependent specifications**". Merged preview reflects the clarified wording.
3. **Errors export list includes the three new typed errors:** ✅ Confirmed. Delta `spec.md.delta.yaml:66` lists `BulkSessionStateError`, `InvalidGraphStoreConfigurationError`, `GraphSchemaIncompatibleError`; `public.ts:205-207` and `index.ts:224-226` export them with codes `BULK_SESSION_STATE` / `INVALID_GRAPH_STORE_CONFIGURATION` / `GRAPH_SCHEMA_INCOMPATIBLE` (`bulk-session-state-error.ts:13-15`, `invalid-graph-store-configuration-error.ts:12-14`, `graph-schema-incompatible-error.ts:12-14`). Tested in `barrel.spec.ts:144-151`.
4. **Public-barrel smoke tests:** ✅ Confirmed. `test/barrel.spec.ts` asserts importability of `GraphStoreFactory`, `GraphStoreFactoryOptions`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions`, `createSqliteGraphStoreFactory`, `LanguageAdapter`, `SymbolKind`, `RelationType`, `SpecNotFoundError` (`SPEC_NOT_FOUND` code — `barrel.spec.ts:150`; `specId` getter covered separately in `sqlite-worker-lifecycle.spec.ts:356-369`), and host use-case factories as named exports (`barrel.spec.ts:125-142`).
5. **ADR-0025:** ✅ Confirmed. `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md` exists (MADR format, `### Confirmation`, `### Spec` links); linked from the merged spec's ADRs section (`spec.md.delta.yaml:97-99`); relative link resolves correctly from `specs/code-graph/composition/` to `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md`.
6. **`as unknown as Port` removal:** ✅ Confirmed. No `as unknown as` remains in `test/composition/host-use-case-factories.spec.ts` or `test/application/use-cases/get-change-spec-coverage.spec.ts` (grep over `test/` shows matches only in other files: `make-mock-spec-repository.ts`, `sqlite-worker-lifecycle.spec.ts`, tree-sitter adapter specs, `ladybug-graph-store.spec.ts`, `get-spec-coverage.spec.ts`, `index-project-graph.spec.ts`, `get-graph-health.spec.ts`, `workspace-indexing.spec.ts`). Both target files use the typed `StubChangeRepository` (`test/helpers/stub-change-repository.ts`) implementing the full `ChangeRepository` abstract port.

---

## Test Coverage

| Area                                                     | Test file                                                     | Tests | Verdict                       |
| -------------------------------------------------------- | ------------------------------------------------------------- | ----- | ----------------------------- |
| Public barrel exports / internal-only surface            | `test/barrel.spec.ts`                                         | 10    | Adequate                      |
| Factory + SQLite store construction / runtime descriptor | `test/composition/create-sqlite-graph-store-factory.spec.ts`  | 5     | Adequate                      |
| Provider facade / lifecycle / resolver / unified search  | `test/composition/code-graph-provider.spec.ts`                | 17    | Adequate                      |
| Host use-case factories                                  | `test/composition/host-use-case-factories.spec.ts`            | 4     | Adequate                      |
| Change-scoped coverage use case                          | `test/application/use-cases/get-change-spec-coverage.spec.ts` | 2     | Adequate                      |
| Typed ChangeRepository port stub                         | `test/helpers/stub-change-repository.ts`                      | —     | Adequate (no `as unknown as`) |

Executed: `pnpm --filter @specd/code-graph exec vitest run test/barrel.spec.ts test/composition/ test/application/use-cases/get-change-spec-coverage.spec.ts` → **5 files, 38 tests passed** (~3.7s).

### Missing / weak tests

1. **Post-close `analyzeImpact` scenario** (verify.md Lifecycle "Method after close throws") — no literal test; only `getStatistics`/`getSpec` after close are exercised. The shared `assertAvailable` gate is covered, but a literal `analyzeImpact`-after-close assertion would close the gap.
2. **`resolveFileSelector` on the provider facade** — verify.md facade scenario "Provider normalizes file selectors" is tested indirectly through `resolve-graph-selector.spec.ts` (service-level) and through `search` exact-file normalization (`code-graph-provider.spec.ts:371`); no direct provider-level `resolveFileSelector` test. Low risk.
3. **`SpecNotFoundError.specId`** — asserted in `barrel.spec.ts` only for `.code`; the `specId` getter is tested in `sqlite-worker-lifecycle.spec.ts:356-369` (not in this run's file set). Acceptable.

---

## Spec Dependency Chain Consistency

Dependencies declared in merged spec (`## Spec Dependencies`) and the change's `specDependsOn` (from `changes status`):

| Dependency spec                       | Exists in project | Consistent with composition                                                                                                               |
| ------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:symbol-model`             | ✅                | SymbolKind/RelationType/model types exported from `"."`                                                                                   |
| `code-graph:graph-store`              | ✅                | `GraphStore` internal; store adapter symbols internal-only                                                                                |
| `code-graph:indexer`                  | ✅                | `IndexOptions`/`IndexResult`/`IndexCodeGraph` wiring as specified                                                                         |
| `code-graph:traversal`                | ✅                | `getUpstream`/`getDownstream`/`analyzeFilesImpact` delegated                                                                              |
| `default:_global/architecture`        | ✅                | Hexagonal layering: composition/ imports infrastructure only; curated `"."`/`"./internal"` barrels; no concrete adapters in public barrel |
| `code-graph:get-graph-health`         | ✅                | `createGetGraphHealth` factory + exported types                                                                                           |
| `code-graph:index-project-graph`      | ✅                | `createIndexProjectGraph` factory + exported types                                                                                        |
| `code-graph:get-spec-coverage`        | ✅                | `createGetSpecCoverage` factory + exported types                                                                                          |
| `code-graph:get-change-spec-coverage` | ✅                | `createGetChangeSpecCoverage` factory + exported types                                                                                    |
| `code-graph:resolve-symbol-reference` | ✅                | Resolver types exported from `"."`; concrete resolver internal                                                                            |

- Change status `specDependsOn["code-graph:composition"]` lists exactly these 10 specs — matches the merged spec's `## Spec Dependencies` verbatim. ✅
- Project-wide globals reviewed: `_global/architecture` (barrel + layering), `_global/testing` (`no as unknown as Port` — satisfied via StubChangeRepository), `_global/error-handling-conventions` (typed errors extend `SpecdError`, UPPER_SNAKE_CASE codes, `specId` metadata), `_global/conventions` (named exports, explicit return types, kebab-case files). No contradictions found.
- Dependency spec consistency: the dependent use-case specs (`get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`) each reference `code-graph:composition` for `CodeGraphProvider`, and their factory-wiring requirements match the implemented factories exactly. `resolve-symbol-reference` does not depend on composition (only symbol-model/graph-store/language-adapter/workspace-integration), so no cycle is introduced by the resolver additions.

---

## Summary Counts

- **Requirements in spec:** 9
- **Satisfied:** 9
- **Partial:** 0
- **Not satisfied:** 0
- **Discrepancies (minor, non-blocking):** 2 (D1 spec signature drift `ResolvedSymbolSelectorResult`; D2 undocumented additive export `SqliteGraphStoreFactoryOptions`)
- **Audit fixes verified:** 6/6 confirmed
- **Tests run:** 5 files / 38 tests — all passed
- **Missing-test gaps:** 3 minor (post-close `analyzeImpact`, provider-level `resolveFileSelector`, `SpecNotFoundError.specId` in barrel)
