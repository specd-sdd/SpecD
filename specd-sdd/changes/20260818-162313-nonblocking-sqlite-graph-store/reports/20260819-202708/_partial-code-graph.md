# Spec Compliance Audit: code-graph (change nonblocking-sqlite-graph-store)

Audit date: 2026-08-19 · Mode: read-only (change re-audit) · Change: `20260818-162313-nonblocking-sqlite-graph-store`
Supersedes: `reports/20260819-193743/_partial-code-graph.md` (pre-reconciliation audit, findings D1–D5)

Scope: re-verify findings D1–D5 against the reconciled spec previews and the current code, and detect new discrepancies.

## Spec: code-graph:sqlite-graph-store

### Re-verification of findings

- **D1 — Schema version spec drift — RESOLVED.**
  - Evidence: spec.md delta now reads "The backend SHALL track a reference schema version; the current reference schema version is `9`. A schema-affecting change SHALL increment the schema version exactly once relative to the version current when that change's implementation begins." (deltas/code-graph/sqlite-graph-store/spec.md.delta.yaml:144; merged preview confirmed).
  - The verify scenario now reads "GIVEN schema version 8 and the reference schema expects 9" (deltas/code-graph/sqlite-graph-store/verify.md.delta.yaml:185; merged preview confirmed).
  - Code: `SQLITE_SCHEMA_VERSION = 9` (packages/code-graph/src/infrastructure/sqlite/schema.ts:1).
  - Tests: `expect(SQLITE_SCHEMA_VERSION).toBe(9)` (test/infrastructure/sqlite/sqlite-graph-store.spec.ts:340); incompatible-version rejection test sets `meta.schemaVersion` to `'8'` and asserts rejection with "SQLite graph storage schema 8 is incompatible with expected 9" (lines 355–372). The schema-9 check and the "rejects 8" behavior both hold.
  - Verdict: spec text, scenario, code, and tests are aligned. No drift remains.

- **D2 — Worker-side error codec (SpecNotFoundError.specId) — RESOLVED.**
  - Evidence: worker-side `serializeError` now preserves `details.specId` for `SpecNotFoundError`: `if (error instanceof SpecNotFoundError && typeof error.specId === 'string') { details.specId = error.specId }` and spreads `details` into the payload (packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts:43–45, :52).
  - This mirrors host-side `serializeWorkerError` (packages/code-graph/src/infrastructure/sqlite/sqlite-worker-client.ts:85–89, :97) and `deserializeWorkerError`, which reconstructs `new SpecNotFoundError(payload.details.specId)` (sqlite-worker-client.ts:128–131).
  - `SpecNotFoundError` exposes a `specId` getter (packages/code-graph/src/domain/errors/spec-not-found-error.ts:21–23).
  - Roundtrip test asserts `serialized.details?.specId` and the reconstructed error's `specId` (test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts:350–368).
  - Verdict: codec symmetry achieved; `SpecNotFoundError.specId` now survives the worker error path. Note: the roundtrip test exercises the host codec pair (`serializeWorkerError`/`deserializeWorkerError`); the worker-side `serializeError` in sqlite-worker.ts is invoked from the worker's `handleMessage` catch path (sqlite-worker.ts:565–571, :586–592) but is not directly unit-tested with a thrown `SpecNotFoundError`. Low residual coverage note only — not a non-compliance.

- **D3 — Test-count metadata — RESOLVED.**
  - Evidence: static accounting now documented as 23 explicit `it(` in `sqlite-graph-store.spec.ts` + 44 shared contract cases ≈ 67; vitest reports 113 passing (reports/20260819-193743/\_partial-code-graph.md:42,46). Counts verified by source: 23 `it(` blocks in test/infrastructure/sqlite/sqlite-graph-store.spec.ts (grep `^\s*it\(`) and 44 in test/domain/ports/graph-store.contract.ts.
  - Task 14.4 "Correct test-count metadata in change artifacts" is marked done (tasks.md:279–281).
  - Verdict: no code change was required; metadata reconciled.

- **D4 — Concrete store adapters must be exported only from `./internal` — RESOLVED.**
  - Evidence: `packages/code-graph/src/index.ts:25–31` now exports `SQLiteGraphStore`, `LadybugGraphStore`, `AdapterRegistry`, `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `PhpLanguageAdapter`, `GoLanguageAdapter`.
  - `packages/code-graph/src/public.ts` contains none of the 7 concrete symbols (only the type `SQLiteGraphStoreOptions` at :9 and the type `ResolveSymbolReferenceInput` at :90 — both type-only, not the concrete classes).
  - `package.json` `exports` maps `"."` → `./dist/public.js` and `"./internal"` → `./dist/index.js` (packages/code-graph/package.json:22–31).
  - Verdict: positive half (`./internal` exports) and negative half (`"."` does not) both satisfied.

- **D5 — Concrete `ResolveSymbolReference` must not be exported from `"."` — RESOLVED.**
  - Evidence: `public.ts` no longer re-exports `ResolveSymbolReference` (removed from working tree; git diff shows `-export { ResolveSymbolReference }` from public.ts). `index.ts:58` retains `export { ResolveSymbolReference }` for `./internal`.
  - The concrete resolver class remains available at `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts:29` and is constructed internally by the provider (code-graph-provider.ts:605,647); resolver input/result/status/reason/provenance types stay on the public surface (public.ts:90–95).
  - Verdict: internal-only resolver class; public surface exposes types/factories only.

## Spec: code-graph:composition

### Spot-check of key requirements

- **Worker-backed non-blocking execution — COMPLIANT.** Persistent single worker with FIFO dispatch queue (sqlite-worker.ts:577–593); strongly-typed operation map (sqlite-worker-protocol.ts:302–336); bounded backpressure `maxPendingOperations` default 256, validated `>= 1`, `StoreOverloadError` on overflow (sqlite-worker-client.ts:162,230–237,450–452); graceful drain `close(drainTimeoutMs = 5000)`, unconditional `worker.terminate()`, `closePromise` cleared in outer `finally` (sqlite-worker-client.ts:309–402). Runtime descriptor is serializable; `workerPath` lives only on `InternalSQLiteGraphStoreOptions`, not public options (sqlite-runtime-descriptor.ts:7–27).
- **Transactional mutation model — COMPLIANT.** `upsertFile`/`removeFile`/`upsertDocument`/`upsertSpec`/`removeSpec` each run inside `db.transaction(() => …)()` (sqlite-graph-database.ts:1652,1672,1685,1712,1726); `commitBulkIndex` executes a single `db.transaction` with one `rebuildFtsIndexesInTransaction` at commit (sqlite-graph-database.ts:2128–2192).
- **Package exports / Public and internal entry points — COMPLIANT.** `"."` is curated via explicit named exports in `public.ts` (no `export *` of infrastructure modules); `"./internal"` is the full barrel `index.ts`; `package.json` exports map both entry points (package.json:22–31).
- **Symbol-reference provider surface — COMPLIANT.** Provider exposes `resolveSymbolReference`/`resolveSymbolReferences` (code-graph-provider.ts:598,640) and `getExactPublicBinding` (code-graph-provider.ts:661–680), which resolves via `store.findPublicBindings` + `store.findDeclarations` — bypassing ranked/paginated search. Concrete resolver class stays internal (see D5).
- **Factory / default backend — COMPLIANT.** `DEFAULT_GRAPH_STORE_ID = 'sqlite'` with registry containing `sqlite` + `ladybug` (create-code-graph-provider.ts:22,34,57); synchronous creation, native/worker loading deferred to `open()`.

## New Findings

- **N1 — Session-based bulk commit loses document/spec removals (regression introduced by worker-side chunked staging).**
  - Severity: Medium. Functional gap in the transactional bulk-index path used by the indexer.
  - Evidence:
    - `IndexCodeGraph` stages removals on the write session: `removeDocuments(toRemove)` and `removeSpecs([...obsoleteSpecIds])` (index-code-graph.ts:1770–1771).
    - In `SQLiteGraphStore.beginBulkIndexSession`, both `removeDocuments` and `removeSpecs` funnel into the **same** `stageBulkRemovals` RPC with `filePaths` (sqlite-graph-store.ts:914–921), so document paths and spec ids are indistinguishable from file paths.
    - Worker-side `stageBulkRemovals` pushes everything into a single `session.removals` array (sqlite-worker.ts:498–502).
    - On session commit the worker builds the payload with only `removedFilePaths: session.removals` — `removedDocumentPaths` and `removedSpecIds` are **never populated** from the session path (sqlite-worker.ts:514–524).
    - In `commitBulkIndex` the database applies `removedFilePaths` via `deleteFileLocalState` (sqlite-graph-database.ts:2140–2142), which deletes symbols/relations/file_content_fts/files only (sqlite-graph-database.ts:2651–2669) — it does **not** delete rows from `documents` or `specs`. The `removedDocumentPaths` → `DELETE FROM documents` (2143–2144) and `removedSpecIds` → `deleteSpecLocalState` (2146–2147) branches are unreachable from the session path.
    - Result: document and spec removals staged through `beginBulkIndexSession` leave stale `documents`/`specs` rows after commit, violating the Transactional mutation model ("bulk indexing operations MUST commit all-or-nothing backend state for the batch they claim to have persisted") and the abstract graph-store contract semantics for removed documents/specs.
  - Regression baseline: at HEAD the session accumulated `removedDocuments`/`removedSpecs` sets separately and set `removedDocumentPaths`/`removedSpecIds` in the payload (git show HEAD sqlite-graph-store.ts:854–856,908–918,929–931); the working-tree session refactor dropped that distinction.
  - Tests: no test covers document/spec removal through the session path — contract tests cover staging/commit of files/symbols/relations (graph-store.contract.ts:250–302) and rollback (304+) but not `removeDocuments`/`removeSpecs` on a session.

## Test Coverage

- `barrel.spec.ts` now has 6 tests, including export-scope assertions that the 7 concrete adapters and `ResolveSymbolReference` are importable from `./internal` and absent from `"."` (barrel.spec.ts:17,25,31,51,59,67).
- Schema version asserted as 9 and rejection of version 8 exercised (sqlite-graph-store.spec.ts:339–372).
- Worker error codec roundtrip covers `SPEC_NOT_FOUND` code and `specId` preservation (sqlite-worker-lifecycle.spec.ts:350–368).
- Shared contract suite (44 cases) continues to execute against the SQLite backend (graph-store.contract.ts).
- Gap: no session-path test for `removeDocuments`/`removeSpecs` (see N1).

## Summary counts

- Findings re-verified: 5 (D1–D5) — all RESOLVED.
- New discrepancies: 1 (N1 — session-based bulk commit drops document/spec removals).
- Compliant requirements spot-checked: compliant (worker-backed non-blocking, transactional mutations, package exports, entry points, symbol-reference provider surface, factory/default backend).
- Non-compliant: 1 (N1, medium severity, within `code-graph:sqlite-graph-store` Transactional mutation model / Bulk indexing support).

## Addendum — N1 resolution (implemented in this change)

N1 was fixed as part of the reconciliation implementation (task 14.6 follow-up):

- **Protocol:** `stageBulkRemovals` payload now accepts `filePaths?`, `documentPaths?`, and `specIds?` independently (sqlite-worker-protocol.ts:325–333).
- **Worker session:** `WorkerBulkSession` tracks `removals`, `removedDocumentPaths`, and `removedSpecIds` separately; `stageBulkRemovals` routes each kind into its own array; `commitBulkIndex` populates all three payload fields (sqlite-worker.ts:64–76, 500–530).
- **Store session:** `removeDocuments` stages `documentPaths` and `removeSpecs` stages `specIds` (sqlite-graph-store.ts:914–921).
- **Database:** the existing `removedDocumentPaths` → `DELETE FROM documents` and `removedSpecIds` → `deleteSpecLocalState` branches (sqlite-graph-database.ts:2143–2147) are now reachable from the session path.
- **Test:** new lifecycle test "removes documents and specs committed through a bulk index session" writes and then removes a document and a spec through sessions, asserting they are gone after commit (sqlite-worker-lifecycle.spec.ts:441–483). 16/16 lifecycle tests pass.

**Re-verified: `npm` suite green — wrapper exit 0, 52 test files pass; sqlite-graph-store.spec.ts (113) + index-project-graph-integration (7) = 120 tests pass with the worker changes; typecheck and lint clean.**

## Final counts

- Prior findings: D1–D5 — all RESOLVED.
- New finding N1 — RESOLVED (fix verified by test).
- Non-compliant: **0**.
- Findings total: 6 (all resolved).
