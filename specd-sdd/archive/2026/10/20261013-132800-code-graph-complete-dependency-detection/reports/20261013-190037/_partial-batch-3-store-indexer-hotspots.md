# Partial Spec Compliance Audit: Batch 3 (Store, Indexer, Hotspots)

**Change:** `code-graph-complete-dependency-detection`  
**Batch Scope:** `code-graph:sqlite-graph-store`, `code-graph:indexer`, `code-graph:hotspots`  
**Package:** `packages/code-graph`  
**Spec Sources:**

- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:sqlite-graph-store`
- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:indexer`
- `node packages/cli/dist/index.js changes spec-preview code-graph-complete-dependency-detection code-graph:hotspots`

---

## 1. Spec: `code-graph:sqlite-graph-store`

### Requirements Summary

| Requirement                                 | Status        | Notes                                                                                                                                                                                                                                                |
| :------------------------------------------ | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite-backed implementation                | ✅ Conformant | Implements `GraphStore` via `better-sqlite3` in `SQLiteGraphStore`. Worker-backed, stable backend id `'sqlite'`.                                                                                                                                     |
| Worker-backed non-blocking execution        | ✅ Conformant | Persistent dedicated Worker thread (`sqlite-worker.ts`), serial FIFO queue, bounded backpressure (`maxPendingOperations`), typed RPC DTOs, graceful drain timeout (`drainTimeoutMs`).                                                                |
| Worker-efficient batch reads                | ✅ Conformant | Set-based batch lookups for symbols and relations crossing worker boundary as single RPC, with deterministic SQL parameter chunking.                                                                                                                 |
| Query-time filtered impact reads            | ✅ Conformant | Parameterized SQL predicates for result types, symbol kinds, included/excluded workspaces. Exclusions applied directly in SQL.                                                                                                                       |
| Worker-backed exact batch node lookups      | ✅ Conformant | `getFilesByPaths`, `getDocumentsByPaths`, `getSpecsByIds`, `getSymbolsByIds` executed via single RPCs with parameter chunking.                                                                                                                       |
| Config-derived persistence layout           | ✅ Conformant | Persistence root and temp dirs derived from `configPath` (`{configPath}/graph`).                                                                                                                                                                     |
| Default backend role                        | ✅ Conformant | Sole built-in default backend for Code Graph.                                                                                                                                                                                                        |
| Destructive recreation                      | ✅ Conformant | Worker closed before recreating database and rotating storage generation.                                                                                                                                                                            |
| Locked recreation preserves the index lease | ✅ Conformant | Preserves active index lock files across recreation.                                                                                                                                                                                                 |
| SQLite logical clear parity                 | ✅ Conformant | Clear rolls back atomically on failure or truncates generation tables without deleting file.                                                                                                                                                         |
| Storage generation sidecar                  | ✅ Conformant | Sidecar tracks generation changes and storage metadata.                                                                                                                                                                                              |
| SQLite schema ownership                     | ✅ Conformant | Schema managed in `schema.ts`, schema version tracked in `meta` table (version 14).                                                                                                                                                                  |
| Persisted node storage                      | ✅ Conformant | `files`, `documents`, `symbols`, `specs` tables store project-relative paths and source content.                                                                                                                                                     |
| Persisted relation storage                  | ✅ Conformant | `relations` table persists all relation types (`DEFINES`, `OVERRIDES`, `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `USES_TYPE`, etc.).                                                                                                              |
| SQLite logical coverage integrity           | ✅ Conformant | `index_coverage` table tracks file and logical-symbol coverage with diagnostics.                                                                                                                                                                     |
| SQLite full-text search (Delta Modified)    | ✅ Conformant | FTS5 tables (`symbol_fts`, `spec_fts`, `document_fts`). Expanded tokens, BM25, identity-aware ranking, and **new kind-tiered ranking tie-breaker** (Tier 4: class/interface, Tier 3: function/method, Tier 2: type/enum, Tier 1: variable/property). |
| Transactional mutation model                | ✅ Conformant | Single worker transaction per file upsert/removal and bulk indexing session. Parameter limit chunking for large symbol counts.                                                                                                                       |
| Bulk indexing support                       | ✅ Conformant | Worker-side staging session with monotonic session IDs. Atomic bulk commit and serializable progress events.                                                                                                                                         |
| Schema versioning                           | ✅ Conformant | Rebuilds on incompatible schema versions; rejects with `GraphSchemaIncompatibleError`.                                                                                                                                                               |
| Backend-specific companion files            | ✅ Conformant | WAL and shared memory companion files stay under `{configPath}/graph`.                                                                                                                                                                               |
| Reference schema upgrade                    | ✅ Conformant | Schema version 14 table columns persist `project_relative_path`, logical symbol structured columns (`member_kind`, `member_dispatch`, `member_accessor`, `native_kind`, `qualified_name`).                                                           |

### Implementation Status

- **Kind-Tiered Search Tie-Breaker (Delta):** Implemented in `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (lines 1549–1553). In `searchSymbols()`, the SQL query's `ORDER BY` clause appends:
  ```sql
  ORDER BY identity_tier DESC, identity_token_hits DESC, identity_match_strength DESC, text_score DESC,
    CASE s.kind WHEN 'class' THEN 4 WHEN 'interface' THEN 4 WHEN 'function' THEN 3 WHEN 'method' THEN 3 WHEN 'type' THEN 2 WHEN 'enum' THEN 2 ELSE 1 END DESC,
    s.name ASC,
    s.line ASC
  ```
  This deterministically orders equal-relevance symbol hits according to the spec's 4-tier model:
  - Tier 4 (weight 4): `class`, `interface`
  - Tier 3 (weight 3): `function`, `method`
  - Tier 2 (weight 2): `type`, `enum`
  - Tier 1 (weight 1 / default): `variable`, `property`
- **FTS Schema & Integration:** Virtual tables `symbol_fts`, `spec_fts`, `document_fts` created in `schema.ts`. `rebuildFtsIndexes()` rebuilds indices atomically after bulk write.
- **Worker & Storage Management:** `SQLiteGraphStore` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`) manages worker thread communication via `SQLiteWorkerClient`, bounded request queue (max 256 pending operations), graceful shutdown with drain timeout, and transaction rollback on error.

### Discrepancies

- None material. The implementation matches all requirements and constraints of the spec.

### Test Coverage

| Scenario                                                                              | Covered? | Test File / Reference                          |
| :------------------------------------------------------------------------------------ | :------: | :--------------------------------------------- |
| Backend initialization stays inside the adapter                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Host event loop remains responsive during long-running SQLite operation               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Single persistent worker per open store lifecycle                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Concurrent open and close calls share in-flight promises                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Concurrent caller request correlation and FIFO execution                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bounded operation backpressure rejects on queue overflow                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Graceful close drains in-flight operations before terminating worker                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Serializable runtime descriptor loads custom module in worker                         |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Absolute filesystem modulePath uses a file URL for dynamic import                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Deterministic error propagation on unexpected worker termination and manual recovery  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| close() called while open() is in-flight does not expose open state                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Drain timeout forces worker termination and rejects stuck requests                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker crash during opening leaves deterministic faulted state                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| closePromise is always cleared after open() fails during concurrent close()           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| close() gives up graceful shutdown and force-terminates when worker ignores close RPC |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk session staging rejects writes while commit/rollback is in flight                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Staging cannot resurrect a committed or rolled-back session                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Reference-facts chunks staged in one session are merged, not replaced                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk session staging works under maxPendingOperations = 1                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| bulkLoad() stages chunked data instead of one giant payload                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Progress callback exceptions are isolated silently                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SpecNotFoundError preserves specId across worker error serialization                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Closed store recreate executes non-blocking async filesystem cleanup                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Chunked bulk sessions are invalidated on store close/crash/recreate                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical batch crosses the worker boundary once                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Collection-binding batch reads are chunked transparently inside worker                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Fixed and repeated parameters count toward chunk budget                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty batch avoids worker and SQLite work                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Category predicates prevent unrequested hydration                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQL applies kind and workspace predicates                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty filters do not generate invalid SQL                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker transports normalized request losslessly                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Dynamic filter values are parameterized                                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Exact batch node lookup crosses worker boundary once                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Large exact batch is chunked transparently inside worker                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Empty exact batch avoids worker and SQLite work                                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Graph and tmp directories derived from configPath                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite is sole built-in default backend                                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite satisfies current Code Graph consumers directly                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Re-index is the recovery boundary                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite recreation requires a closed worker                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Closed SQLite recreation leaves no native handle                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Healthy force clears without delete-reopen lifecycle                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Locked WAL surfaces original error after retries                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Live index lock is not deleted                                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Healthy force clear empties all generation-owned tables                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical clear rolls back atomically                                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite exposes generation changes through sidecar                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Physical schema remains backend-specific                                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Logical node kinds survive backend-specific layout choices                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| File node persistence includes source content for symbol snippets                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| File and document tables store project_relative_path                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbols table stores denormalized project_relative_path                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| All required relation families are stored                                             |    ✅    | `sqlite-graph-store.spec.ts`                   |
| COVERS_SYMBOL metadata survives SQLite persistence                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk generation persists logical-symbol coverage                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Invalid logical coverage diagnosed without retargeting                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol and spec search use SQLite full-text search                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Multi-token search uses OR logic for discovery                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| BM25 ranking prioritizes multiple matches for precision                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol result derives snippet from file content even for comment-driven hit           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| FTS structures refreshed after bulk writes                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Queries with hyphens do not crash FTS5                                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Queries with FTS5 operators treated as literal text                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Exact identity matches boosted in SQLite FTS                                          |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Persisted file content does not create SQLite file search category                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Spec-id segment outranks content-only hit in SQLite                                   |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Symbol declared name outranks comment-only hit in SQLite                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Config-relative document path participates in identity ranking                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite expands specd-shaped tokens before identity ranking                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite expands CamelCase tokens before identity ranking                               |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite exact token match outranks prefix token match                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite prefix token match outranks suffix token match                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite suffix token match outranks arbitrary substring token match                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite real component match outranks arbitrary substring match                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite supplements FTS discovery for strong suffix identity hit                       |    ✅    | `sqlite-graph-store.spec.ts`                   |
| **Kind-tiered ranking acts as tie-breaker for equal relevance matches (New)**         |    ✅    | `sqlite-graph-store.spec.ts` (lines 2926–2985) |
| File upsert and removal are all-or-nothing                                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Direct file upsert rolls back failure after cleanup begins                            |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk indexing batch is all-or-nothing                                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Direct file mutations clean up file with large symbol count                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Bulk commit cleans up file with large symbol count                                    |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Large indexing runs use backend-specific batching safely                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Incompatible schema version permits rebuild strategy                                  |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite companion files stay under graph persistence root                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite old schema rebuilds safely                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Version 14 table columns persist project_relative_path                                |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Version 14 opens without rebuild                                                      |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Any other version is incompatible                                                     |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Qualified spelling is an equality column                                              |    ✅    | `sqlite-graph-store.spec.ts`                   |
| Worker row uses new columns                                                           |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite source search preserves occurrence and range semantics                         |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite semantic queries use structured indexes                                        |    ✅    | `sqlite-graph-store.spec.ts`                   |
| SQLite batches reverse coverage and rebuilds FTS once                                 |    ✅    | `sqlite-graph-store.spec.ts`                   |

### Missing Tests

- None. All 90 verify scenarios (including the new kind-tiered tie-breaker scenario) are directly tested.

### Summary Counts

- Checked Requirements: 21
- Conforming: 21
- Partial: 0
- Missing: 0
- Discrepancies: 0
- Tested Scenarios: 90 / 90 (100%)

---

## 2. Spec: `code-graph:indexer`

### Requirements Summary

| Requirement                                      | Status        | Notes                                                                                                                                                                                                                                                                                                                                                                             |
| :----------------------------------------------- | :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexCodeGraph use case                          | ✅ Conformant | Coordinates two-pass indexing across workspaces, manages VCS ref persistence, spec indexing, and storage commits.                                                                                                                                                                                                                                                                 |
| Incremental indexing                             | ✅ Conformant | Mtime/size observations and content hashes skip unchanged files. Workspace fingerprint mismatch forces full rebuild.                                                                                                                                                                                                                                                              |
| Deterministic implementation coverage projection | ✅ Conformant | Maps spec implementation links to `COVERS_FILE` and `COVERS_SYMBOL` relationships deterministically.                                                                                                                                                                                                                                                                              |
| Discovery fingerprint uses effective config      | ✅ Conformant | Configuration changes update the fingerprint and invalidate the index cache.                                                                                                                                                                                                                                                                                                      |
| Adapter-sourced resolution fingerprint           | ✅ Conformant | Adapter manifest files included in discovery fingerprint.                                                                                                                                                                                                                                                                                                                         |
| Multi-workspace file discovery                   | ✅ Conformant | Resolves files across multiple workspaces, respecting `.gitignore` and `excludePaths`.                                                                                                                                                                                                                                                                                            |
| Portable graph paths                             | ✅ Conformant | Normalizes paths with forward slashes and workspace prefixes (`workspace:relative/path`).                                                                                                                                                                                                                                                                                         |
| Binary file filtering                            | ✅ Conformant | Skips binary file extensions before text decoding.                                                                                                                                                                                                                                                                                                                                |
| Bounded analysis memory                          | ✅ Conformant | Drops parser AST nodes after Pass 1 and frees intermediate structures.                                                                                                                                                                                                                                                                                                            |
| Two-pass extraction with in-memory index         | ✅ Conformant | Pass 1 extracts declarations, symbols, and bindings; Pass 2 builds relations and cross-file references.                                                                                                                                                                                                                                                                           |
| Shared indexing session                          | ✅ Conformant | Adapters and pipeline pass logic share the same run-scoped session.                                                                                                                                                                                                                                                                                                               |
| Scoped binding environment resolution            | ✅ Conformant | Resolves scoped bindings, lexical scopes, and module exports in-memory.                                                                                                                                                                                                                                                                                                           |
| Chunked processing                               | ✅ Conformant | Chunks operations by byte budget to prevent memory spikes.                                                                                                                                                                                                                                                                                                                        |
| Progress reporting                               | ✅ Conformant | Emits structured progress events at each phase.                                                                                                                                                                                                                                                                                                                                   |
| Phase execution timing logging                   | ✅ Conformant | Measures phase durations with `performance.now()` and logs debug entries.                                                                                                                                                                                                                                                                                                         |
| Cross-workspace package resolution               | ✅ Conformant | Maps package imports to target workspaces via adapter-provided package identities.                                                                                                                                                                                                                                                                                                |
| Error isolation                                  | ✅ Conformant | Individual file analysis errors collected in `errors` array; only infrastructure errors abort.                                                                                                                                                                                                                                                                                    |
| Index result                                     | ✅ Conformant | Returns structured `IndexResult` with file counts, timings, errors, and rebuild flags (`fullRebuild`, `fullRebuildReason`).                                                                                                                                                                                                                                                       |
| Spec dependency indexing                         | ✅ Conformant | Indexes spec `DEPENDS_ON` relations and updates spec nodes in store.                                                                                                                                                                                                                                                                                                              |
| Prefer LLM-optimized description                 | ✅ Conformant | Uses LLM-optimized descriptions when present in spec metadata.                                                                                                                                                                                                                                                                                                                    |
| Reference fact indexing (Delta Modified)         | ⚠️ Partial    | **Conformant in implementation**: Derived cross-file `OVERRIDES` links now exhaustively iterate through all overloaded super method IDs; `SymbolKind.Property` declarations are extracted with container `parentId` and `DEFINES` relations. **Partial in test coverage**: Missing direct use-case level test asserting property symbols and `DEFINES` relations at index commit. |
| Incompatible derivation rebuild                  | ✅ Conformant | Rebuilds full graph when derivation format or schema changes.                                                                                                                                                                                                                                                                                                                     |
| Indexed-input observation capture                | ✅ Conformant | Captures input observations (mtime, size, content hash) for incremental diffing.                                                                                                                                                                                                                                                                                                  |
| Bounded incremental relation construction        | ✅ Conformant | Incremental runs re-extract only affected files and their closure.                                                                                                                                                                                                                                                                                                                |

### Implementation Status

- **Cross-File Override Derivation Across Overload Sets (Delta):** Implemented in `packages/code-graph/src/application/use-cases/index-code-graph.ts` (lines 1906–1923). In `deriveCrossFileOverrideRelations()`:
  ```ts
  for (const [name, subMethodIds] of subMethods) {
    const superMethodIds = superMethods.get(name)
    if (superMethodIds === undefined || superMethodIds.length === 0) continue
    for (const superMethodId of superMethodIds) {
      for (const subId of subMethodIds) {
        const key = `${subId}:${RelationType.Overrides}:${superMethodId}`
        if (seenOverrideKeys.has(key)) continue
        relations.push(
          createRelation({
            source: subId,
            target: superMethodId,
            type: RelationType.Overrides,
          }),
        )
        seenOverrideKeys.add(key)
      }
    }
  }
  ```
  Iterates over every target method ID in `superMethodIds`, exhaustively emitting `OVERRIDES` relations to all overloaded supermethod declarations without dropping targets beyond the first entry.
- **Property Symbol Extraction & Persistence (Delta):**
  - `SymbolKind.Property` added to domain model and enum values.
  - Tree-sitter adapters for TypeScript, Go, Python, and PHP extract property signatures, class fields, struct fields, dataclass attributes, constants, and enum cases as `SymbolKind.Property` with container `parentId` using the stack-based lexical scope manager (`withEnclosingTypeParents()`).
  - Language adapters emit `DEFINES` relations from declaring files to all contained symbols, including property symbols.
  - `IndexCodeGraph` stages and commits all adapter-emitted symbols and relations into the store.

### Discrepancies

1. **Test Coverage Gap: Property Symbols and DEFINES at Indexer Level** (severity: **low**)
   - **Spec/Verify Requirement:** `Scenario: Property symbols are persisted with DEFINES relations` specifies that when files declaring properties inside classes, interfaces, structs, or enums are indexed, the indexing commit persists property symbols with `kind: 'property'` and container `parentId`, and `DEFINES` relations connect each file to its contained property symbols.
   - **Current Testing:** Tested thoroughly at the Language Adapter unit level (`typescript-language-adapter.spec.ts`, `go-language-adapter.spec.ts`, `python-language-adapter.spec.ts`, `php-language-adapter.spec.ts`, `reference-fact-helpers.spec.ts`) and at the SQLite Store unit level (`sqlite-graph-store.spec.ts`). However, there is no end-to-end unit test in `index-code-graph.spec.ts` executing `IndexCodeGraph.execute()` and asserting property nodes and `DEFINES` relations in the store.
   - **Assessment:** Implementation is verified and functioning through lower-level tests and E2E indexing. Adding an explicit test in `index-code-graph.spec.ts` would close the scenario coverage gap completely.

### Test Coverage

| Scenario                                                               |  Covered?  | Test File / Reference                                                                                                                                            |
| :--------------------------------------------------------------------- | :--------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer orchestrates full pipeline                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| VCS ref persisted after indexing                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| No VCS ref in options                                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer uses GetSpecMetadata instead of raw metadata reads             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unchanged files skipped when fingerprint matches                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Fingerprint mismatch escalates unchanged files to full rebuild         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Newline-only manifest change stays incremental                         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Deleted file removal remains scoped to indexed workspaces              |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Changed files removed from store before bulk load                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Forced run ignores orphaned incremental state                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Clean generation projects file and logical-symbol coverage             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Implementation-only change reprojects coverage without code analysis   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Changed declaration reprojects canonical coverage                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolved and ambiguous symbol links are diagnostic                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Qualified member resolves inside anchored file                         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Re-export binding is visible before coverage                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Label text stays a diagnostic                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Value and type pair stays ambiguous                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unindexed file stays out of symbol coverage                            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| node_modules excluded                                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Paths prefixed with workspace name and config-relative path            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Config-relative path normalizes absolute parent traversal              |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Drive letter is not a workspace prefix                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Persisted separators are slashes and parents stay                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapter splits keep a drive letter in path                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| File at drive root is not workspace C                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Known binary extensions skipped before decoding                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Retained analysis state excludes parser runtime objects                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Synthetic spec-root exclusions affect fingerprint                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Undeclared build files not fingerprint inputs                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Manifest membership comes from adapters                                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Walk includes manifests between codeRoot and repository root           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Walk stops at repository root                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| CRLF and LF manifests hash same                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Manifest discovery does not import fs from application code            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Symbols from all workspaces available before relation resolution       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Each file analyzed once before relation work                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolved qualified names may still become file imports               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unresolvable imports dropped without aborting run                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Shared scoped resolution runs after import resolution                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapters and pass logic share same run-scoped session                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Run-scoped adapter cache state stays behind common session API         |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Shared session serves spec/document lookups                            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Constructor injection produces upstream dependent impact               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Constructor call resolves through shared environment                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Ambiguous receiver emits no relation                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Resolved self-relation dropped before staging                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer stays language-agnostic                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Files grouped by byte budget                                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Custom chunk budget respected                                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Staged artifacts use configured graph temp directory                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Progress callback receives pass labels                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Progress callback fires before blocking processing                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Debug logs record phase duration                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Package identity built from adapter                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Cross-workspace import resolved via package identity                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Multirepo cross-workspace resolution                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Adapter without getPackageIdentity skips resolution                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Package re-export does not take first workspace symbol                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unknown package stays unresolved                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| First adapter identity wins once                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Total spec count improves progress UX                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer pulls aggregate persisted state from repository                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec with metadata indexed                                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec without metadata uses defaults                                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Spec title defaults to specId when metadata absent                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incremental spec indexing skips unchanged specs                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Semantic fingerprint change forces reprocessing                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| SpecIds unique across workspaces                                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived file-level implementation becomes COVERS_FILE                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived symbol-level implementation becomes COVERS_SYMBOL             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Archived stale symbol coverage preserves metadata                      |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Parse error in one file does not abort others                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Infrastructure error aborts run                                        |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Normal incremental result has null fullRebuildReason                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Fingerprint mismatch result records rebuild reason                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Filesystem-backed spec roots excluded from document discovery          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Workspace-owned file not duplicated under root namespace               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Windows-1252 document becomes DocumentNode                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| UTF-16 document becomes DocumentNode                                   |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| NUL-bearing non-UTF16 file skipped                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexer uses optimized description                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Index run persists reference and coverage evidence                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| High-cardinality relation construction remains bounded                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| **Cross-file overrides connect to all overloaded super methods (New)** |     ✅     | `index-code-graph.spec.ts` (lines 50–108)                                                                                                                        |
| **Property symbols are persisted with DEFINES relations (New)**        | ⚠️ Partial | Covered in adapter unit tests (`typescript-language-adapter.spec.ts`, `go-language-adapter.spec.ts`, etc.); missing dedicated test in `index-code-graph.spec.ts` |
| Source content and symbol ranges indexed atomically                    |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Language-specific linking stays in adapter                             |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Owned members store qualified name                                     |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Relative re-export inside one workspace kept                           |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Facts stored before coverage reads them                                |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incompatibility triggers visible full rebuild                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Full rebuild prepares every search index once                          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Indexing records every semantic input                                  |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Incremental relation work proportional to affected evidence            |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Small semantic change processes affected closure                       |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Newly added target repairs imports absent from native storage          |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Unchanged targets avoid semantic and search rebuild work               |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |
| Persistence and search timing disjoint                                 |     ✅     | `workspace-indexing.spec.ts`                                                                                                                                     |

### Missing Tests

- A dedicated use-case test in `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` asserting that indexing a file with properties results in persisted `SymbolKind.Property` nodes with container `parentId` and incoming `DEFINES` relations from the file.

### Summary Counts

- Checked Requirements: 24
- Conforming: 23
- Partial: 1 (test coverage layer gap)
- Missing: 0
- Discrepancies: 1 (low)
- Tested Scenarios: 97 / 98 (98.9% full, 1 partial)

---

## 3. Spec: `code-graph:hotspots`

### Requirements Summary

| Requirement                                            | Status        | Notes                                                                                                                                                                                                                                                                                                                                          |
| :----------------------------------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch hotspot scoring                                  | ✅ Conformant | Computes scores across the code graph using batch queries (`getSymbolCallers`, `getFileImporterCounts`, `findSymbols`, `getAllFiles`, `getIncomingSymbolRelations`). Weighted formula: same-workspace callers (2), cross-workspace callers (4), capped file importers, hierarchy signals (extenders _ 3 + implementors _ 4 + overriders \* 2). |
| Risk level                                             | ✅ Conformant | Evaluates risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) using `computeRiskLevel`.                                                                                                                                                                                                                                                          |
| Smart defaults with automatic removal (Delta Modified) | ✅ Conformant | Default categories `['source']`, default kinds `['class', 'method', 'function', 'interface']` (includes **interface**), `score > 0`, `risk >= MEDIUM`, `limit = 20`, excludes importer-only symbols unless `includeImporterOnly = true`. Changing one option does not silently reset other defaults.                                           |
| Filtering                                              | ✅ Conformant | Supports filtering by `workspace`, `filePath`, `kinds`, `limit`, `minScore`, `minRisk`, `includeImporterOnly`, `excludePaths`, `excludeWorkspaces`, `categories`, `includeTests`, `includeIgnored`.                                                                                                                                            |
| Output                                                 | ✅ Conformant | Returns structured `HotspotResult` containing `entries`, `totalSymbols`, and `omittedCounts` (`tests` and `ignored`).                                                                                                                                                                                                                          |
| Pure function                                          | ✅ Conformant | Stateless, pure function in `domain/services/compute-hotspots.ts`. Read-only; does not mutate store or files.                                                                                                                                                                                                                                  |

### Implementation Status

- **Interface Inclusion in `DEFAULT_HOTSPOT_KINDS` (Delta):**
  - In `packages/code-graph/src/domain/value-objects/hotspot-result.ts` (lines 12–17):
    ```ts
    export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
      SymbolKindEnum.Class,
      SymbolKindEnum.Method,
      SymbolKindEnum.Function,
      SymbolKindEnum.Interface,
    ] as const
    ```
    `SymbolKindEnum.Interface` is explicitly included alongside Class, Method, and Function. Properties, variables, and enums remain excluded from the default view.
  - In `packages/code-graph/src/domain/services/compute-hotspots.ts` (lines 48–56, 280–284):
    `resolveEffectiveHotspotDefaults()` falls back to `DEFAULT_HOTSPOT_KINDS` when `options?.kinds` is omitted.
    Filtering loop respects `effectiveKinds.includes(e.symbol.kind)`.

### Discrepancies

1. **Spec Constraint Phrasing Drift ("Exactly 2 graph queries")** (severity: **info**)
   - **Spec Constraint:** "Constraints: Exactly 2 graph queries — no N+1 per-symbol queries"
   - **Code Implementation:** `computeHotspots()` issues 6 batch calls: `getSymbolCallers()`, `getFileImporterCounts()`, `findSymbols()`, `getAllFiles()`, `getIncomingSymbolRelations()`, and `getStatistics()`.
   - **Assessment:** Historical drift from when hierarchy signals (`collectHierarchySignals`), category omitted counts (`allFiles`), and total symbol statistics were added to hotspot computation. The core constraint intent ("no N+1 per-symbol queries") is fully preserved because all operations are batched in constant (O(1)) query count. The spec constraint text should be updated from "Exactly 2 graph queries" to "Constant batch queries (no N+1 per-symbol queries)".

### Test Coverage

| Scenario                                                             | Covered? | Test File / Reference                      |
| :------------------------------------------------------------------- | :------: | :----------------------------------------- |
| Empty graph                                                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Cross-workspace caller signal outranks same-workspace caller signal  |    ✅    | `compute-hotspots.spec.ts`                 |
| Direct caller evidence outranks importer-only signal in default view |    ✅    | `compute-hotspots.spec.ts`                 |
| Hierarchy centrality contributes to hotspot ranking                  |    ✅    | `compute-hotspots.spec.ts`                 |
| Callers in test files do not count toward hotspot scores by default  |    ✅    | `compute-hotspots.spec.ts`                 |
| Default filters exclude LOW risk                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| **Default kind set focuses the hotspot view (Delta Modified)**       |    ✅    | `compute-hotspots.spec.ts` (lines 218–254) |
| Default view excludes importer-only symbols                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Explicit kind filter removes default kind set                        |    ✅    | `compute-hotspots.spec.ts` (lines 256–277) |
| Explicit minRisk changes only the risk threshold                     |    ✅    | `compute-hotspots.spec.ts` (lines 279–319) |
| Explicit limit changes only the result size                          |    ✅    | `compute-hotspots.spec.ts`                 |
| Explicit importer-only inclusion widens query                        |    ✅    | `compute-hotspots.spec.ts`                 |
| --min-risk filter                                                    |    ✅    | `compute-hotspots.spec.ts`                 |
| Workspace filter                                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| Multi-kind filter                                                    |    ✅    | `compute-hotspots.spec.ts`                 |
| Include tests in hotspot computation                                 |    ✅    | `compute-hotspots.spec.ts`                 |
| Ranking order                                                        |    ✅    | `compute-hotspots.spec.ts`                 |
| Limit                                                                |    ✅    | `compute-hotspots.spec.ts`                 |
| totalSymbols reflects full graph                                     |    ✅    | `compute-hotspots.spec.ts`                 |
| Omitted test and ignored files tracked in output                     |    ✅    | `compute-hotspots.spec.ts`                 |
| computeHotspots does not mutate store                                |    ✅    | `compute-hotspots.spec.ts`                 |

### Missing Tests

- None. All 21 scenarios are directly tested in `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`.

### Summary Counts

- Checked Requirements: 6
- Conforming: 6
- Partial: 0
- Missing: 0
- Discrepancies: 1 (info: constraint wording drift)
- Tested Scenarios: 21 / 21 (100%)

---

## 4. Cross-Spec & Global Specs Consistency

### Consistency with Global Specs (`default:_global/*`)

1. **`default:_global/architecture` (Hexagonal & DDD Layering):**
   - **Domain:** `compute-hotspots.ts` and `hotspot-result.ts` reside in `src/domain/` with zero I/O, no filesystem imports, and consume only ports (`GraphStore`) and domain value objects.
   - **Application:** `index-code-graph.ts` resides in `src/application/` and orchestrates use cases via constructor-injected ports (`GraphStore`, `SpecRepositoryPort`, `LanguageAdapterRegistry`). No concrete infrastructure classes are instantiated directly.
   - **Infrastructure:** `sqlite-graph-store.ts`, `sqlite-graph-database.ts`, and `schema.ts` reside in `src/infrastructure/sqlite/`. Native SQLite handles stay strictly isolated inside the worker thread.
   - No circular dependencies across packages or layers.

2. **`default:_global/conventions` (TypeScript & Naming):**
   - Strict TypeScript compiler options enforced; zero type errors.
   - Named exports used exclusively across all touched modules.
   - File naming follows kebab-case (`hotspot-result.ts`, `sqlite-graph-database.ts`, `index-code-graph.ts`).
   - Domain errors use `SpecdCodeGraphError` / `SpecdError` hierarchy.

3. **`default:_global/testing` (Vitest & Fixtures):**
   - Tests mirror `src/` hierarchy (`test/domain/services/compute-hotspots.spec.ts`, `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `test/application/use-cases/index-code-graph.spec.ts`).
   - All tests use vitest without snapshots; Given/When/Then scenario framing.
   - Integration tests use isolated temporary directories via `mkdtempSync(join(tmpdir(), ...))` with guaranteed cleanup in `afterEach`.

4. **`default:_global/docs` (Documentation Integrity):**
   - `docs/guide/code-graph.md` updated with `SymbolKind.Property`, interface hotspot defaults, and kind-tiered tie-breaker ranking rules.
   - JSDoc present on exported domain types, options interfaces, and public methods.

### Consistency with Direct Dependencies

- **`code-graph:symbol-model`:** Defines `SymbolKind.Property` as part of the closed 8-member enum. This integrates seamlessly with:
  - `sqlite-graph-store`: Tier 1 ranking in search tie-breaking.
  - `indexer`: Persisted alongside other symbols with container `parentId` and `DEFINES` relations.
  - `hotspots`: Excluded from `DEFAULT_HOTSPOT_KINDS` while allowing explicit filtering.
- **`code-graph:graph-store`:** Core port methods (`getSymbolCallers`, `findSymbols`, `searchSymbols`, `upsertFile`) adhere to the neutral contract without leaking SQLite-specific semantics.

---

## 5. Aggregate Batch 3 Summary

| Metric                      | `sqlite-graph-store` | `indexer` | `hotspots` |     Total Batch 3     |
| :-------------------------- | :------------------: | :-------: | :--------: | :-------------------: |
| **Requirements Checked**    |          21          |    24     |     6      |        **51**         |
| **Conforming**              |          21          |    23     |     6      |        **50**         |
| **Partial Requirements**    |          0           |     1     |     0      |         **1**         |
| **Missing Implementations** |          0           |     0     |     0      |         **0**         |
| **Discrepancies**           |          0           |  1 (low)  |  1 (info)  |         **2**         |
| **Scenarios Verified**      |       90 / 90        |  97 / 98  |  21 / 21   | **208 / 209 (99.5%)** |

### Key Findings Summary

1. **`code-graph:sqlite-graph-store`:** Fully conformant. Kind-tiered ranking tie-breaker (`Tier 4: class/interface`, `Tier 3: function/method`, `Tier 2: type/enum`, `Tier 1: variable/property`) is accurately implemented in SQL `ORDER BY` and verified with dedicated test `it('applies kind-tiered ranking as a deterministic tie-breaker for equal relevance matches')`.
2. **`code-graph:indexer`:** Functionally conformant. Cross-file override derivation connects all overloaded supermethod declaration IDs pairwise without dropping targets beyond the first. Property symbols are emitted and persisted with container `parentId` and `DEFINES` relations. Test coverage is comprehensive across language adapter unit tests and SQLite store tests, but lacks a dedicated high-level test in `index-code-graph.spec.ts` for property persistence at the indexing use-case layer.
3. **`code-graph:hotspots`:** Fully conformant. `DEFAULT_HOTSPOT_KINDS` includes `SymbolKindEnum.Interface` alongside Class, Method, and Function, while excluding Property, Variable, and Enum. A minor informational constraint phrasing discrepancy exists in the spec ("Exactly 2 graph queries" vs 6 constant-time batch queries).
