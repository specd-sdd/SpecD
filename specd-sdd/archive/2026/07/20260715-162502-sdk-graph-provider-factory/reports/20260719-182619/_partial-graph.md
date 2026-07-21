# Compliance Audit: Code Graph

**Change:** `sdk-graph-provider-factory`  
**Scope:** `code-graph:composition`, `code-graph:index-project-graph`,
`code-graph:get-graph-health`, `code-graph:graph-store`,
`code-graph:ladybug-graph-store`, `code-graph:sqlite-graph-store`, and direct/global dependencies.  
**Method:** Graph-first navigation, merged change-spec review, implementation inspection, and package verification.

## Findings

### Medium: `CodeGraphProvider` is not a runtime public export

- **Requirement:** `code-graph:composition` requires the `@specd/code-graph` public barrel to export `CodeGraphProvider` as part of the composition and wiring surface.
- **Evidence:** [packages/code-graph/src/public.ts](../../../../../../packages/code-graph/src/public.ts) uses `export type { CodeGraphProvider }`, which removes the class from emitted JavaScript. The class is only available through the `./internal` entry point.
- **Impact:** A host following the documented public API cannot import the provider runtime value for supported runtime use cases such as `instanceof`, while the published surface claims it is exported. The current barrel test only verifies that `InMemoryIndexSession` is absent; it does not assert the required value export.
- **Recommended resolution:** Change the export to `export { CodeGraphProvider }` and add a public-barrel runtime export test. If the class is intentionally type-only, revise the merged composition requirement to say so explicitly.

## Requirements Checked

### `code-graph:composition`

- **Pass:** Factory selects `sqlite` by default, retains explicit `ladybug`, rejects registry collisions, derives storage from `config.configPath`, and registers the four built-in language adapters plus additive adapters.
- **Pass:** Provider owns lifecycle, force reset, and index locking. Public calls require `open()`, detect external storage-generation changes, and release locks in `finally`.
- **Pass:** Public barrel excludes lock helpers and concrete backends; `package.json` maps `.` to the curated barrel and `./internal` to the internal barrel.
- **Finding:** `CodeGraphProvider` is type-only rather than a runtime public export (above).

### `code-graph:index-project-graph`

- **Pass:** The use case only prepares and forwards `IndexOptions`, including `force`, `vcsRef`, and `onProgress`; it returns the provider result unchanged.
- **Pass:** It neither opens/closes the provider nor acquires locks. Provider-owned force recreation aligns with the merged change specification.
- **Pass:** `createIndexProjectGraph` remains stateless (covered by host-use-case factory tests).

### `code-graph:get-graph-health`

- **Pass:** Reads statistics from an already-open provider, obtains VCS ref defensively, computes staleness, and only evaluates the fingerprint when both a stored fingerprint and workspace targets are present.
- **Pass:** It does not open, close, or acquire a lock on the provider. Tests cover matching/different refs, missing refs, matching/mismatching fingerprints, and lifecycle non-interference.

### `code-graph:graph-store`

- **Pass:** The abstract port retains storage-agnostic node, relation, search, bulk-load, clear/recreate, and storage-generation operations. Composition and host use cases use `CodeGraphHostPort` instead of exposing concrete stores.
- **Pass:** Provider-enforced generation snapshots make externally recreated storage fail closed with `GraphProviderStaleError` before read/traversal/query operations proceed.

### `code-graph:sqlite-graph-store`

- **Pass:** SQLite runtime loading is deferred to `open()`, directories are rooted at `{storagePath}/graph` and `{storagePath}/tmp`, schema/version state and FTS5 tables are initialized in the adapter, mutations/bulk load are transactional, and recreation removes backend-owned graph persistence then rotates the storage generation.
- **Pass:** Existing SQLite suite covers 86 tests, including persisted nodes/relations/documents, relation metadata, FTS query handling/ranking, snippets, schema reset, transactions, and recreation behavior.

### `code-graph:ladybug-graph-store`

- **Pass:** Ladybug runtime loading is deferred to `open()`, persistence and scratch roots are adapter-owned beneath `storagePath`, prepared parameters are used for values, and recreation rotates the storage generation.
- **Pass:** The adapter remains an explicit backend selected only by `graphStoreId: 'ladybug'`; no default-composition fallback is introduced.

## Dependency And Global Consistency

- **Pass:** `@specd/code-graph` depends on `@specd/core`; factory imports `SpecdConfig` as a type and accepts the primary configuration overload.
- **Pass:** SDK/CLI-facing host use cases depend on `CodeGraphHostPort`, preserving the boundary between host orchestration and backend implementation.
- **Pass:** The graph is fresh (`2026-07-19T16:22:04.269Z`), and impact analysis identifies the modified provider/factory/store surfaces as the expected high-risk composition boundary.

## Verification Evidence

- **Passed:** `pnpm --filter @specd/code-graph typecheck`.
- **Passed before runner failure:** all focused composition, health, index-project-graph, host-factory, and SQLite suites; SQLite reported `86` passing tests.
- **Limitation:** `pnpm --filter @specd/code-graph test` terminates during the Ladybug suite with Vitest/Tinypool `ERR_IPC_CHANNEL_CLOSED` after other suites pass. Repeating through the package script has the same outcome because `test/run-vitest.sh` does not forward the requested test-file argument. This is a test-runner/process stability issue, not a demonstrated product assertion failure; the full Ladybug assertion suite was not independently completed in this audit.

## Conclusion

The change is compliant for the audited graph-provider, index, health, graph-store, SQLite, and Ladybug behavior except for the missing runtime `CodeGraphProvider` public export. Address that mismatch and add its regression test before treating the graph scope as fully compliant.
