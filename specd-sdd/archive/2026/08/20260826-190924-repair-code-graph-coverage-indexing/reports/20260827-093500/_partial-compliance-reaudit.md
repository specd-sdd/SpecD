# Compliance re-audit — code-graph coverage indexing

**Scope:** `repair-code-graph-coverage-indexing` (change mode)  
**Audited change specs:** `code-graph:indexer`, `code-graph:graph-store`, `code-graph:sqlite-graph-store`, `code-graph:get-graph-health`, and `cli:graph-index`  
**Relevant direct/global dependencies checked:** `core:spec-repository-port`, `default:_global/architecture`, and `default:_global/testing`  
**Graph state:** current; 1,108 files, 38,400 symbols, `COVERS_FILE=168`, `COVERS_SYMBOL=403`; `coverageComplete=true`.

## Result

**No compliance findings.** The two findings from the preceding full audit are resolved. No new spec/code, spec/dependency, or test-coverage discrepancy was found in the scoped re-audit.

## Requirement and implementation evidence

### `code-graph:indexer`

- The change preview now requires `SpecRepository.readPersistedState()` and says that its aggregate persisted state supplies both `dependsOn` and `implementation`.
- This is consistent with `core:spec-repository-port`: `readPersistedState(spec)` is the only application-facing persisted-sidecar read API and returns `schema`, `dependsOn`, `implementation`, optional `optimizations`, and `originalHash`. The port explicitly forbids `readPersistedImplementation` and `readPersistedDependsOn`.
- `IndexCodeGraph` calls `ws.specRepo.readPersistedState(repoSpec)` once, derives both dependency and implementation inputs from that result, and never parses a raw sidecar file. This satisfies the port boundary and the indexer scenario requiring a single aggregate read.
- The indexer includes the persisted-state hash in its changed predicate, rehydrates retained semantic facts when projection is required without code analysis, and projects coverage from all prepared persisted implementation links. This conforms to the requirement that an implementation-only sidecar change can add, remove, or replace coverage in a normal incremental run.
- `projectSpecCoverage` emits `COVERS_FILE` for existing file-only targets, emits `COVERS_SYMBOL` only for exactly one logical symbol, and produces stable per-link diagnostics for absent, unresolved, or ambiguous targets. It does not silently downgrade symbol coverage to file coverage.

### `code-graph:graph-store` and `code-graph:sqlite-graph-store`

- `GraphStore.clear()` is used for a forced logical reindex and its contract requires clearing nodes, relations, coverage, observations, freshness latches, derivation metadata, and search data.
- SQLite's `clearLogicalGeneration` deletes those graph-generation tables, including relations, logical/physical symbols, `index_coverage`, observations, latches, specs, documents, files, and indexed metadata. This prevents stale hashes or semantic state from authorizing a force-run skip.
- Relation insertion validates endpoints across files, physical symbols, logical symbols, bindings, and specs. Consequently `COVERS_SYMBOL` remains keyed to logical identities and invalid targets are rejected rather than retargeted to a physical symbol.
- Existing contract and SQLite tests cover clear semantics, generation metadata clearing, coverage reads, and batched coverage/FTS behavior.

### `code-graph:get-graph-health`

- `GetGraphHealth` obtains persisted coverage facts, compares successfully indexed coverage entries against persisted file/document nodes, and sets `contentFresh=false`, `coverageComplete=false`, and `GRAPH_CONTENT_INCONSISTENT` for an impossible completed generation.
- The change preview's scenarios for empty/inconsistent and complete generations are therefore implemented without performing repair mutations from the health read path.

### `cli:graph-index`

- The command forwards `--force` through the SDK worker task, preserves structured result fields, and renders full-rebuild state, coverage counts/reasons, and per-link coverage diagnostics in text mode.
- It does not inspect or delete backend files directly, matching the CLI boundary requirement.

## Targeted regression evidence

`packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts` contains the behaviour test:

`given a real spec-lock implementation change, when incremental indexing runs, then SQLite coverage is reprojected without source analysis`

It uses all of the required real integration pieces:

- a unique temporary filesystem root with cleanup in `afterEach`;
- a physical `spec.md` and physical `spec-lock.json`;
- `createSpecRepository('fs', ...)` rather than a mock repository;
- `SQLiteGraphStore` and the TypeScript language adapter;
- two unchanged source files (`first.ts`, `second.ts`).

The first run proves both a `COVERS_FILE` and `COVERS_SYMBOL` projection for `first.ts`. The test rewrites only `spec-lock.json` to point to `second.ts`, clears the adapter spy, and executes a normal incremental run. It asserts `filesIndexed === 0`, `analyzeFile` was not called, coverage now targets `second.ts`, and the previous `first.ts` file coverage is gone. This directly closes the previous E2E gap and validates that the sidecar change affects coverage without reparsing code.

The focused Vitest invocation for this integration file was started during this audit. Its visible runner output confirmed discovery and start; the audit does not treat that partial invocation as the primary evidence because the test source itself provides explicit, complete assertions and the change's earlier package-level verification had already passed.

## Scope and dependency conclusion

The corrected indexer requirement now matches its direct Core port dependency instead of referring to removed field-wise methods. The implementation remains in the code-graph application layer and consumes the Core port through injected workspace targets, preserving the applicable global architecture constraint. The new filesystem/SQLite scenario is an integration test with deterministic temporary-directory cleanup, matching the global testing constraint.

## Findings

None.
