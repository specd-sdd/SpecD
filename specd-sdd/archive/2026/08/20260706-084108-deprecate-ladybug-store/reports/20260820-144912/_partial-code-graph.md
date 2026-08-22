# Code-graph compliance audit — deprecate-ladybug-store

**Scope:** `code-graph:ladybug-graph-store`, `code-graph:composition`, and `code-graph:sqlite-graph-store` projected through change `deprecate-ladybug-store`.

**Audit date:** 2026-08-20. **Mode:** read-only change audit. The graph was current (`stale: false`, 1,064 indexed files, 36,582 symbols), so no re-index was required.

## Requirements and implementation status

| Spec                | Requirement group                                                                                                                                | Status                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ladybug graph store | Ownership transferred; no built-in Ladybug implementation, dependency, schema, fixture, test, export, or registry registration remains           | **Pass, with external precondition not locally verifiable** | Worktree deletes the three `src/infrastructure/ladybug/*` files and two Ladybug test files. `rg -i ladybug packages/code-graph package.json pnpm-lock.yaml` found only historical `CHANGELOG.md` references; `package.json` contains SQLite/better-sqlite3 and no Ladybug dependency. The composition registry contains exactly `sqlite`.                                                                                       |
| Composition         | `CodeGraphProvider` facade, delegation, lifecycle, selectors, search, and host-use-case surface                                                  | **Pass**                                                    | `src/composition/code-graph-provider.ts` is the lifecycle-gated facade; construction in `create-code-graph-provider.ts` wires `IndexCodeGraph`, language adapters, and the health use case. Composition tests cover default/explicit backend selection, lifecycle, clear, stale generations, exact bindings, and unified search.                                                                                                |
| Composition         | Overloads, config-derived storage root, SQLite default, additive registry, deterministic collision/unknown-backend failures, synchronous factory | **Pass**                                                    | `createCodeGraphProvider()` distinguishes `SpecdConfig`, derives `configPath`, uses `sqlite` when no id is supplied, merges only additive factories, and throws `GraphStoreRegistryError` on collision or unknown id. `createSqliteGraphStoreFactory()` only constructs the store; native module loading is deferred to `SQLiteGraphStore.open()`.                                                                              |
| Composition         | Curated public/internal entry points and exports                                                                                                 | **Pass**                                                    | `package.json` maps `.` to `dist/public.js` and `./internal` to `dist/index.js`; `public.ts` is explicit rather than an unrestricted infrastructure export. `barrel.spec.ts` verifies `InMemoryIndexSession` is internal-only and `CodeGraphProvider` is type-only at runtime.                                                                                                                                                  |
| SQLite graph store  | SQLite adapter lifecycle, config-rooted graph/tmp layout, sole built-in default, destructive recreation, epoch sidecar                           | **Pass**                                                    | `SQLiteGraphStore` creates only `<storagePath>/graph` and `<storagePath>/tmp`, lazily imports `better-sqlite3` in `open()`, idempotently closes, removes the graph root in `recreate()`, and rotates `graph/storage.epoch`. Tests assert the paths, reset behavior, reopening, pragmas, and incompatible-schema rejection.                                                                                                      |
| SQLite graph store  | Physical persistence/schema, node and relation semantics, transactions, bulk indexing, metadata                                                  | **Pass**                                                    | SQLite DDL persists files, documents, symbols, specs, relations, metadata, logical symbols/bindings/coverage and indexes. `upsertFile`, removals, `upsertSpec`, and bulk-session commit paths use transactions; bulk-session commit rebuilds FTS once inside its transaction. Graph impact identifies `SQLiteGraphStore` as the sole high-risk backend exercised by its dedicated test suite and composition/integration tests. |
| SQLite graph store  | FTS5 discovery, identity ranking, snippets, source-content FTS, structured reference lookups                                                     | **Pass**                                                    | DDL defines `symbol_fts`, `spec_fts`, `document_fts`, and trigram `file_content_fts`; `searchSymbols`, `searchSpecs`, and `searchDocuments` use the shared expansion/ranking path. Dedicated tests cover token expansion, unavailable-FTS identity discovery, exact/prefix/suffix/substring ordering, FTS sanitization, and source-content behavior.                                                                            |
| SQLite graph store  | Schema upgrade/rebuild recovery                                                                                                                  | **Pass**                                                    | Current `SQLITE_SCHEMA_VERSION` is 9; normal reads reject incompatible persisted versions and indexing uses provider-owned destructive recovery. The projected requirement's illustrative 5→6 case is superseded by later independent schema upgrades (history shows subsequent search and symbol-resolution work); the test correctly validates the current 8→9 boundary.                                                      |

## Discrepancies

No confirmed implementation/spec discrepancy was found in the audited scope.

### Audit limitation / follow-up

The Ladybug tombstone requires that `ladybug:graph-store` and its read-only dependency wiring have been recreated in the separate `specd-plugin-graphstore-ladybug` repository. That repository is outside this workspace and was not supplied, so this prerequisite cannot be independently verified here. Local removal is verified; external successor ownership remains an **unverified precondition**, not evidence of a local failure.

Historical Ladybug references remain in `packages/code-graph/CHANGELOG.md`. They are release history only, not source, exports, dependencies, schemas, fixtures, tests, or registry registration; retaining them is consistent with the retirement record.

## Test coverage and missing tests

Executed: `pnpm --filter @specd/code-graph test` — **47 test files passed; 604 tests passed**.

Covered locally:

- Provider factory/default SQLite/additive factories/collision/unknown backend/lifecycle/recovery: `test/composition/code-graph-provider.spec.ts`.
- Public versus internal barrel constraints: `test/barrel.spec.ts`.
- SQLite lifecycle, files, epoch/recreation, schema compatibility, transactions, bulk behavior, FTS, ranking, and source search: `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`.
- Host/indexing flows using the factory: `test/application/use-cases/index-project-graph-integration.spec.ts`.

Missing locally: an integration check against the external Ladybug plugin repository proving its replacement spec, verification suite, and `readOnly` workspace resolution. Add that only in cross-repository CI or in the plugin repository; it cannot be made meaningful inside this repository alone.

## Dependency chain and global conformance

- `code-graph:ladybug-graph-store` has no direct spec dependencies; its only cross-repository assertion is the external successor precondition above.
- `code-graph:composition` directly depends on symbol-model, graph-store, indexer, traversal, get-graph-health, index-project-graph, get-spec-coverage, get-change-spec-coverage, and `default:_global/architecture`. The implementation preserves the required Ports/Adapters split: abstract `GraphStore` in domain, SQLite adapter in infrastructure, and wiring in composition. No architecture conflict found.
- `code-graph:sqlite-graph-store` directly depends on graph-store, core config, symbol-model, and workspace integration. Its storage path is supplied by composition from `SpecdConfig.configPath`, while the adapter owns all SQLite details; this conforms to the abstract-store and global architecture boundaries.
- The unprojected base composition context still describes both Ladybug and SQLite built-ins. The change's required `spec-preview` correctly projects its delta to a SQLite-only built-in registry, matching the implementation. This is an expected pending-change delta, not an inconsistency in the audited change.

Graph impact confirms the main dependency chain: `createCodeGraphProvider` has 23 direct dependents and reaches the SDK host context/with-open-provider paths; `createSqliteGraphStoreFactory` feeds the provider plus composition and integration tests; `SQLiteGraphStore` is the critical concrete backend used by factory, integration, and dedicated SQLite tests.

## Summary counts

| Metric                              |    Count |
| ----------------------------------- | -------: |
| Specs audited                       |        3 |
| Requirement groups assessed         |        8 |
| Passing groups                      |        8 |
| Confirmed discrepancies             |        0 |
| External/unverifiable preconditions |        1 |
| Local missing-test areas            |        0 |
| Test files / tests passed           | 47 / 604 |

**Conclusion:** Local implementation and tests comply with the three projected code-graph specifications. Approval should retain the stated external Ladybug-successor verification as a release/coordination check.
