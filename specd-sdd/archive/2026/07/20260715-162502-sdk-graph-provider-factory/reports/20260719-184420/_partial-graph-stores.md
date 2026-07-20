# Partial compliance audit — graph-store backends

**Change:** `sdk-graph-provider-factory`  
**Scope:** `code-graph:graph-store`, `code-graph:ladybug-graph-store`, and `code-graph:sqlite-graph-store`; their direct dependencies (`symbol-model`, `document-model`, `staleness-detection`, `workspace-integration`, `core:config`, and global architecture/conventions/error handling) were included for consistency checks.  
**Method:** read-only merged-spec review (`changes spec-preview`), fresh code-graph search/impact analysis, implementation inspection, and focused package test execution. Graph freshness was current before inspection.

## Result

**Not compliant: 3 implementation findings, plus 1 test-suite consistency defect.**

The new lazy-native-loading and storage-generation APIs are generally wired in both concrete adapters. The findings below prevent sign-off because one is directly in the new generation-marker path and two violate the shared persisted-store contract that both selected adapters must satisfy.

| ID   | Severity      | Spec / requirement                                                                                      | Finding                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GS-1 | High          | `ladybug-graph-store` — Storage generation sidecar                                                      | `LadybugGraphStore.open()` creates `graph/storage.epoch` **before** `migrateSchemaIfNeeded()`. On an old/unreadable Ladybug database, migration deletes and recreates `graph/`, deleting that sidecar. `open()` then succeeds without recreating it; `getStorageGeneration()` subsequently calls `statSync` on a missing file. This violates the requirement that opening makes the current generation observable. |
| GS-2 | High          | `graph-store` — Minimum graph semantics / document search; `ladybug-graph-store` document FTS behaviour | `LadybugGraphStore.rebuildFtsIndexes()` drops/recreates only `Symbol` and `Spec` FTS indexes. It omits the `Document` index even though `open()` creates `document_fts` and `upsertDocument`, `removeDocument`, `clear`, and `bulkLoad` rely on the rebuild routine. Document search can therefore be stale after document mutations.                                                                              |
| GS-3 | Medium        | `graph-store` — File removal                                                                            | `LadybugGraphStore.removeFile()` calls the multi-query deletion helper without a transaction. A failure part-way through can leave a removed file, its symbols, and adjacent relations inconsistent, contrary to the required atomic removal semantics. SQLite performs this mutation in a transaction.                                                                                                            |
| TS-1 | Medium (test) | Ladybug adapter regression coverage                                                                     | `ladybug-graph-store.spec.ts` still asserts `SCHEMA_VERSION === 8`, while the active adapter exports `SCHEMA_VERSION = 10`. This is a stale assertion and makes the intended focused Ladybug test unreliable; it is not a requirement that the version be 8.                                                                                                                                                       |

## Evidence and suggested repairs

### GS-1 — generation sidecar can disappear during open

- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts:182` calls `ensureStorageGeneration(this.storagePath)`.
- The next operation (`:183`) is `await this.migrateSchemaIfNeeded()`.
- `migrateSchemaIfNeeded()` removes `this.graphDir` on a version mismatch and in its recovery catch path (`:257-265`), removing `storage.epoch` created immediately before.
- `getStorageGeneration()` (`:1787-1790`) reads the sidecar without ensuring it exists.

Repair: run `ensureStorageGeneration` after migration (or ensure it again after migration) before the adapter declares open success. Add a regression test using a version-incompatible Ladybug store and assert that `open()` followed by `getStorageGeneration()` succeeds.

### GS-2 — Document FTS index is never rebuilt

- `open()` creates `document_fts` for `Document` (`ladybug-graph-store.ts:206`).
- `rebuildFtsIndexes()` (`:493-512`) enumerates only `Symbol` and `Spec` for drop/recreate.
- `upsertDocument()` and `removeDocument()` invoke that routine after mutations (`:609`, `:625`), and `searchDocuments()` queries the Document FTS index (`:1629`).

Repair: include `Document`/`document_fts` in both the drop and recreation lists. Cover insert, update, and removal with `searchDocuments()` assertions, not only `getDocument()` contract checks.

### GS-3 — Ladybug file deletion is not atomic

- SQLite wraps removal in `db.transaction(...)` (`sqlite-graph-store.ts:171-176`).
- Ladybug's `removeFile()` (`ladybug-graph-store.ts:454-459`) calls `deleteFileLocalState` directly; that helper performs multiple independent relation/node deletion queries (`:299-322`).

Repair: wrap the full removal sequence in `BEGIN TRANSACTION` / `COMMIT`, rolling back on error, and add a failure-injection test that demonstrates the old file graph remains visible when a delete fails.

### TS-1 — stale schema-version expectation

- Production exports `SCHEMA_VERSION = 10` in `packages/code-graph/src/infrastructure/ladybug/schema.ts:1`.
- The test at `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts:174-176` describes version 8 and expects `8`.

Repair: assert the current exported version deliberately (or remove the hard-coded version number and test the required schema capabilities). This test should be fixed independently of the runtime requirement.

## Requirement and scenario coverage

Merged previews contain **39 unique requirement headings** (13 per assigned spec) and **126 verification scenarios**:

| Spec                             | Requirements | Scenarios | Assessment                                                                                                                                                                                                          |
| -------------------------------- | -----------: | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:graph-store`         |           13 |        57 | Mostly implemented by the abstract port and SQLite; GS-3 means Ladybug does not meet atomic `removeFile` semantics. Lifecycle/generation requirements are also affected by GS-1 for a migration-opening path.       |
| `code-graph:ladybug-graph-store` |           13 |        34 | Partial: backend ID, lazy loading in `open`, idempotent close, persisted graph layout, recreation, and generation API exist; GS-1 and GS-2 leave the required generation and document-search behaviours incomplete. |
| `code-graph:sqlite-graph-store`  |           13 |        35 | No discrepancy found in the inspected changed paths: loader is deferred to `open`, close is idempotent, `recreate()` removes the graph root then rotates the sidecar, and mutations use SQLite transactions.        |

The shared port exposes `getStorageGeneration()` and both concrete adapters implement it. The provider-owned comparison/check is outside this partial audit's assigned store scope; it should be assessed with composition/provider findings.

## Dependency consistency

- The graph reports all three assigned specs at **HIGH** spec-impact risk. The shared `GraphStore` class is **CRITICAL** in symbol impact analysis, with 24 direct and 21 indirect dependents; the two adapters are also CRITICAL symbols.
- `graph-store` dependencies are consistent with the implementation vocabulary: files/documents/symbols/specs, relations, persisted fingerprint metadata, and `StoreNotOpenError` remain in code-graph domain/infrastructure boundaries. No `@specd/core` dependency was introduced into the port or adapters.
- `ladybug-graph-store` and `sqlite-graph-store` both root backend files under `{configPath}/graph` and temporary files under `{configPath}/tmp`, consistent with `core:config` and workspace identity requirements.
- The default/backend-selection and provider stale-detection behaviour are not concluded here because they belong to `code-graph:composition`; this report only confirms the stores expose the selected generation primitives.

## Test evidence

- Invoked the package test command intended to target the contract and both adapter suites. The wrapper ran the broader code-graph suite; it reported **86 SQLite adapter tests passing** and many surrounding package tests, then hit the repository-documented Ladybug/Tinypool `ERR_IPC_CHANNEL_CLOSED` shutdown condition before a final complete summary.
- A direct isolated Ladybug Vitest invocation also terminated with the same native-addon IPC failure before reporting test results. It is therefore **inconclusive**, not a passing result.
- Static test inspection confirms both adapters share `graphStoreContractTests`; that suite covers normal lifecycle, document CRUD, file replacement, and successful queries. It does **not** cover a rotated generation token, old-provider detection after another store recreates, Ladybug migration preserving `storage.epoch`, document FTS refresh after mutation, or failure atomicity for Ladybug `removeFile`.

## Audit counts

- Specs audited: **3 assigned + 6 direct functional/global dependencies reviewed**.
- Requirement headings reviewed: **39**.
- Verification scenarios reviewed: **126**.
- Confirmed implementation discrepancies: **3** (2 High, 1 Medium).
- Test-suite consistency discrepancies: **1**.
- Tests conclusively passing in the observed run: **86 SQLite adapter tests**; Ladybug result: **inconclusive due to documented worker IPC shutdown**.
