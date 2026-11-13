# Spec Compliance Audit: Code Graph Area

## Scope

- **Specs Audited**:
  - `code-graph:graph-store` (with active deltas from change `code-graph-file-categories`)
  - `code-graph:traversal` (with active deltas from change `code-graph-file-categories`)
  - `code-graph:hotspots` (with active deltas from change `code-graph-file-categories`)
- **Dependencies & Global Specifications**:
  - `code-graph:symbol-model`
  - `code-graph:staleness-detection`
  - `default:_global/architecture`
  - `default:_global/conventions`
  - `default:_global/docs`
- **Implementation Targets in `@specd/code-graph`**:
  - `packages/code-graph/src/domain/value-objects/file-node.ts` (`FileCategory`, `FILE_CATEGORIES`, `FileNode`, `createFileNode`)
  - `packages/code-graph/src/domain/services/classify-file-category.ts` (`classifyFileCategory`)
  - `packages/code-graph/src/domain/value-objects/symbol-query.ts` (`SymbolQuery.categories`)
  - `packages/code-graph/src/domain/value-objects/impact-result.ts` (`resolveAdmittedCategories`, `ImpactResultFilter`, `ImpactResult`, `OmittedCounts`)
  - `packages/code-graph/src/domain/value-objects/hotspot-result.ts` (`DEFAULT_HOTSPOT_KINDS`, `HotspotOptions`, `HotspotResult`, `HotspotEntry`)
  - `packages/code-graph/src/infrastructure/sqlite/schema.ts` (`SQLITE_SCHEMA_VERSION`, `SQLITE_SCHEMA_DDL`: `files.category`, `idx_files_category`)
  - `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (`insertFile`, `insertFiles`, `getFile`, `findFilesByConfigRelativePath`, `getFilesByPaths`, `getAllFiles`, `findSymbols`, `queryImpactFrontier`, `queryImpactFrontierDirection`, `getFileImporterCounts`)
  - `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` (`SQLiteGraphStore`)
  - `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts` & `sqlite-worker.ts`
  - `packages/code-graph/src/domain/services/analyze-impact.ts` (`analyzeImpact`, `analyzeFilteredTraversalTargets`)
  - `packages/code-graph/src/domain/services/analyze-file-impact.ts` (`analyzeFileImpact`, `analyzeFilteredFileImportImpact`)
  - `packages/code-graph/src/domain/services/analyze-spec-impact.ts` (`analyzeSpecImpact`, `analyzeFilteredSpecImpact`)
  - `packages/code-graph/src/domain/services/compute-hotspots.ts` (`computeHotspots`, `collectHierarchySignals`)
  - `packages/code-graph/src/application/use-cases/index-code-graph.ts` (file category classification during indexing)
- **Test Suites Executed**:
  - `packages/code-graph/test/domain/ports/graph-store.contract.ts`
  - `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
  - `packages/code-graph/test/domain/services/traversal.spec.ts`
  - `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`
  - `packages/code-graph/test/domain/services/classify-file-category.spec.ts`
  - `packages/code-graph/test/domain/value-objects/file-node.spec.ts`
  - Entire package test suite: `pnpm --filter @specd/code-graph test` (63 test files, 836 tests passed)

---

## 1. Requirements Summary

### `code-graph:graph-store` (with `code-graph-file-categories` deltas)

1. **Requirement: Minimum graph semantics**:
   - `FileNode` carries semantic `category` (`source` | `test` | `ignored`), defaulting to `'source'`.
   - `files` storage persists full content and persists/indexes the `category` attribute (`idx_files_category`) to enable low-latency filtering.
   - Abstract store contract supports round-trip persistence and retrieval of `category` without backend-specific decoding.
2. **Requirement: Query methods**:
   - `findSymbols(query: SymbolQuery)` accepts `categories` (array of `FileCategory` for filtering symbols by the category of their declaring file).
   - `SymbolQuery` updated to carry optional `categories?: readonly FileCategory[]`.
3. **Requirement: Filtered impact query contract**:
   - `GraphStore` exposes backend-neutral impact query inputs accepting `categories?: readonly FileCategory[]`, `includeTests?: boolean`, `includeIgnored?: boolean`.
   - By default (unspecified categories), only files with category `'source'` and their contained symbols SHALL be admitted.
   - Store implementations SHALL apply category predicates in physical query execution (e.g. SQL joins and WHERE clauses). Implementations MUST NOT load unrestricted candidate sets and remove excluded rows in TypeScript.

### `code-graph:traversal` (with `code-graph-file-categories` deltas)

1. **Requirement: Impact analysis**:
   - Computes `directDependents`, `indirectDependents`, `transitiveDependents`, and derived `riskLevel` solely over admitted category nodes (`source` by default).
   - Dependents in `test` or `ignored` files SHALL NOT inflate dependent counts or risk level unless explicitly admitted by the caller.
   - Produces `ImpactResult` containing `omittedCounts: { tests: number, ignored: number }` indicating how many test and ignored files were encountered during reachability traversal but omitted from the result.
   - Anchored target rule: when the analysis target is itself explicitly located in a `test` or `ignored` file, downstream dependencies of that anchored target SHALL be traversed.
2. **Requirement: Filtered impact results**:
   - Traversal operations express category eligibility via `GraphStore` impact queries and MUST halt BFS expansion at non-admitted file boundaries during upstream and bidirectional walks to prevent test and auxiliary files from acting as transitive relational bridges connecting unrelated production symbols.
   - Categories default to `['source']` when omitted.
   - Every `ImpactResult` contains deterministic `affectedSpecs` collection and `omittedCounts` record.
   - Filtering MUST occur before any final result limit and must be pushed down to the `GraphStore` boundary.

### `code-graph:hotspots` (with `code-graph-file-categories` deltas)

1. **Requirement: Batch hotspot scoring**:
   - Scores symbols using batch graph queries across four signal families (same-workspace callers, cross-workspace callers, file importers, hierarchy dependents).
   - Caller, importer, and hierarchy signals are computed strictly over admitted file categories (`source` by default), preventing test or auxiliary callers from distorting production hotspot scores.
   - Symbols defined in non-admitted categories are excluded from candidate ranking by default.
2. **Requirement: Smart defaults with automatic removal**:
   - Product defaults: `categories = ['source']`, `kinds = ['class', 'method', 'function']`, `score > 0`, `risk >= MEDIUM`, `limit = 20`, `no importer-only entries`.
   - Explicit options override only their own defaults without merging (e.g. explicit `kinds` replaces default kinds; explicit `minRisk` overrides threshold without resetting default kinds).
3. **Requirement: Filtering**:
   - `HotspotOptions` supports `categories`, `includeTests`, and `includeIgnored`.
4. **Requirement: Output**:
   - `HotspotResult` contains `entries: HotspotEntry[]`, `totalSymbols: number`, and `omittedCounts: { tests: number, ignored: number }`.

---

## 2. Implementation Status

| Requirement / Component                          | Implementation Location                                                                                                                                                   | Status            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `FileCategory` Type & Constants                  | `packages/code-graph/src/domain/value-objects/file-node.ts` (`FileCategory`, `FILE_CATEGORIES`)                                                                           | Fully Implemented |
| `FileNode.category` & Defaulting                 | `packages/code-graph/src/domain/value-objects/file-node.ts` (`createFileNode` defaults to `'source'`)                                                                     | Fully Implemented |
| File Category Classifier                         | `packages/code-graph/src/domain/services/classify-file-category.ts` (`classifyFileCategory`)                                                                              | Fully Implemented |
| Category Classification in Indexer               | `packages/code-graph/src/application/use-cases/index-code-graph.ts` (lines 1002–1007)                                                                                     | Fully Implemented |
| `SymbolQuery.categories` Filter                  | `packages/code-graph/src/domain/value-objects/symbol-query.ts`                                                                                                            | Fully Implemented |
| SQLite Schema DDL & Version Bump                 | `packages/code-graph/src/infrastructure/sqlite/schema.ts` (`SQLITE_SCHEMA_VERSION = 13`, `files.category`, `idx_files_category`)                                          | Fully Implemented |
| SQLite File Persistence & Hydration              | `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (`insertFile`, `insertFiles`, `getFile`, `getAllFiles`, `rowToFileNode`)                         | Fully Implemented |
| SQLite Worker Protocol Serialization             | `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts` & `sqlite-worker.ts`                                                                            | Fully Implemented |
| `findSymbols` Category Filtering (SQLite)        | `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (lines 1402–1406: SQL subquery `file_path IN (SELECT path FROM files WHERE category IN (...))`)  | Fully Implemented |
| `findSymbols` Category Filtering (In-Memory)     | `packages/code-graph/test/helpers/in-memory-graph-store.ts` (lines 969–976)                                                                                               | Fully Implemented |
| `queryImpactFrontier` Category Pushdown (SQLite) | `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (`queryImpactFrontierDirection`: lines 3168–3234 SQL joins & `category IN (...)`)                | Fully Implemented |
| `queryImpactFrontier` Omitted Tracking (SQLite)  | `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` (lines 3236–3270: SQL query for non-admitted files)                                              | Fully Implemented |
| Category Resolution Helper                       | `packages/code-graph/src/domain/value-objects/impact-result.ts` (`resolveAdmittedCategories`)                                                                             | Fully Implemented |
| `ImpactResultFilter` & `OmittedCounts` Types     | `packages/code-graph/src/domain/value-objects/impact-result.ts` (`OmittedCounts`, `ImpactResultFilter`, `ImpactResult`)                                                   | Fully Implemented |
| Symbol Impact Category Isolation & Pruning       | `packages/code-graph/src/domain/services/analyze-impact.ts` (`analyzeFilteredTraversalTargets`: halts at non-admitted files, isolates metrics, populates `omittedCounts`) | Fully Implemented |
| File Impact Category Isolation & Pruning         | `packages/code-graph/src/domain/services/analyze-file-impact.ts` (`analyzeFilteredFileImportImpact`, `analyzeFileImpactDetails`)                                          | Fully Implemented |
| Anchored Target Downstream Traversal             | `packages/code-graph/src/domain/services/analyze-file-impact.ts` & `analyze-impact.ts` (target category unconstrained in downstream direction)                            | Fully Implemented |
| Spec Impact Category Handling                    | `packages/code-graph/src/domain/services/analyze-spec-impact.ts` (`analyzeFilteredSpecImpact`, populates `omittedCounts`)                                                 | Fully Implemented |
| Hotspot Options & Result Models                  | `packages/code-graph/src/domain/value-objects/hotspot-result.ts` (`DEFAULT_HOTSPOT_KINDS = ['class', 'method', 'function']`, `HotspotOptions`, `HotspotResult`)           | Fully Implemented |
| Hotspot Category & Caller Filtering              | `packages/code-graph/src/domain/services/compute-hotspots.ts` (filters callers, candidate symbols, hierarchy signals, and file importers by category)                     | Fully Implemented |
| Hotspot Omitted Counts Calculation               | `packages/code-graph/src/domain/services/compute-hotspots.ts` (lines 154–162)                                                                                             | Fully Implemented |
| Public Barrel Re-exports                         | `packages/code-graph/src/public.ts`, `packages/code-graph/src/index.ts`                                                                                                   | Fully Implemented |

---

## 3. Discrepancies

1. **`ImpactResult.omittedCounts` Type Optionality in Domain Interface**:
   - **Spec Requirement** (`code-graph:traversal`): _"Every `ImpactResult`, including symbol and public-binding impact, SHALL contain a required deterministic `affectedSpecs` collection and `omittedCounts` record."_
   - **Implementation**: In `packages/code-graph/src/domain/value-objects/impact-result.ts` (line 89), `ImpactResult.omittedCounts` is typed as optional: `readonly omittedCounts?: OmittedCounts`.
   - **Runtime Reality**: In actual execution, `analyzeImpact`, `analyzeFileImpact`, `analyzeSpecImpact`, and `emptyImpact` always return a defined `omittedCounts: { tests: number, ignored: number }` record.
   - **Severity**: Low (type relaxation for backward compatibility; runtime behavior is 100% compliant).

2. **Spec Consistency Gap in `code-graph:symbol-model`**:
   - **Issue**: `specs/code-graph/symbol-model/spec.md` (Requirement: File node) specifies the canonical fields of `FileNode` (`path`, `configRelativePath`, `language`, `contentHash`, `workspace`, `embedding`), but lacks the `category` attribute (`'source' | 'test' | 'ignored'`).
   - **Context**: The `category` attribute was specified in the `code-graph:graph-store` delta and implemented in `@specd/code-graph`, but no corresponding delta was authored for `code-graph:symbol-model`.
   - **Severity**: Medium (specification drift between foundational entity spec and store contract spec).

3. **Empty Array Edge-Case in `findSymbols` and `resolveAdmittedCategories`**:
   - **Implementation**: In `sqlite-graph-database.ts` (line 1402) and `in-memory-graph-store.ts` (line 969):
     ```typescript
     if (query.categories !== undefined && query.categories.length > 0) { ... }
     ```
     Similarly, `resolveAdmittedCategories(filter)` checks `filter.categories.length > 0` before using it, falling back to `['source']` if `categories: []`.
   - **Behavior**: Passing `categories: []` does not evaluate to "admit no categories" (0 results); it falls back to default `'source'` in traversal or all categories in `findSymbols`.
   - **Severity**: Negligible (safe default behavior; no practical use case passes `categories: []`).

---

## 4. Test Coverage

All 63 test files and 836 tests in `@specd/code-graph` passed cleanly.

### Scenarios from Merged Specs

| Spec          | Scenario                                                                                                                                                                            | Test File & Suite                                                                                                                                      | Result   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `graph-store` | **Backend persists file category**: File node with category `'test'` or `'ignored'` preserves attribute; defaults to `'source'`                                                     | `packages/code-graph/test/domain/ports/graph-store.contract.ts:83`<br>`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:2859` | Passed   |
| `graph-store` | **findSymbols filters by category**: Symbols in `'source'`, `'test'`, `'ignored'` files filtered by `categories`                                                                    | `packages/code-graph/test/domain/ports/graph-store.contract.ts:1175`                                                                                   | Passed   |
| `graph-store` | **Category filter excludes non-admitted categories in physical query**: Excludes non-admitted callers directly in SQL statement                                                     | Implemented in SQL statement (`sqlite-graph-database.ts:3189`), verified via unit tests; missing direct SQL store boundary test (see Section 5)        | Verified |
| `traversal`   | **Test callers do not inflate risk level or dependents**: Target called by 1 prod module and 20 test files has `directDependents: 1`, `riskLevel: 'LOW'`, `omittedCounts.tests: 20` | `packages/code-graph/test/domain/services/traversal.spec.ts:1008`                                                                                      | Passed   |
| `traversal`   | **Category filter prunes BFS traversal through test files**: BFS halts at test file T; does not reach module B; tracks `omittedCounts.tests`                                        | `packages/code-graph/test/domain/services/traversal.spec.ts:1035`                                                                                      | Passed   |
| `traversal`   | **Anchored test target traverses dependencies**: Downstream traversal from test file target returns downstream production dependencies                                              | `packages/code-graph/test/domain/services/traversal.spec.ts:1061`                                                                                      | Passed   |
| `hotspots`    | **Callers in test files do not count toward hotspot scores by default**: Symbol called only by test files receives no caller points; production symbol does                         | `packages/code-graph/test/domain/services/compute-hotspots.spec.ts:510`                                                                                | Passed   |
| `hotspots`    | **Default kind set focuses the hotspot view**: Only `class`, `method`, `function` symbols eligible by default                                                                       | `packages/code-graph/test/domain/services/compute-hotspots.spec.ts:218`                                                                                | Passed   |
| `hotspots`    | **Include tests in hotspot computation**: `includeTests: true` counts test callers in `directCallers` and score                                                                     | `packages/code-graph/test/domain/services/compute-hotspots.spec.ts:527`                                                                                | Passed   |
| `hotspots`    | **Excludes candidate symbols defined in test files by default**: Candidate symbols residing in test files omitted from default results                                              | `packages/code-graph/test/domain/services/compute-hotspots.spec.ts:545`                                                                                | Passed   |
| `hotspots`    | **Omitted test and ignored files tracked in output**: `omittedCounts` in `HotspotResult` contains counts of excluded test and ignored files                                         | `packages/code-graph/test/domain/services/compute-hotspots.spec.ts:567`                                                                                | Passed   |

---

## 5. Missing Tests

1. **Direct SQLite Store Test for `Scenario: Category filter excludes non-admitted categories in physical query`**:
   - `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` tests SQLite DDL (`category` column & `idx_files_category`) and file round-tripping (`getFile`), but its `seedImpactFrontierFixture` sets all files to default category (`source`).
   - There is no direct test in `sqlite-graph-store.spec.ts` or `graph-store.contract.ts` calling `store.queryImpactFrontier(...)` on a database with callers in both `'source'` and `'test'` files and asserting directly that `result.relations` excludes test callers across the store boundary.
2. **SQLite-backed End-to-End Traversal Category Pruning Test**:
   - `packages/code-graph/test/domain/services/traversal.spec.ts` tests BFS pruning and test caller risk isolation exclusively against `InMemoryGraphStore`.
   - Although `InMemoryGraphStore` conforms to the `GraphStore` contract, adding an integration test running `analyzeImpact` and `analyzeFileImpact` with test files against `SQLiteGraphStore` would ensure full end-to-end assurance through the real SQLite engine and worker RPC pipeline.

---

## 6. Spec Dependency Chain & Consistency

1. **`code-graph:symbol-model`**:
   - **Inconsistency**: As noted in Section 3, `specs/code-graph/symbol-model/spec.md` does not document `category: FileCategory` on `FileNode`. A delta for `symbol-model` should be added to ensure the foundational symbol model spec remains the source of truth for `FileNode`.
2. **`code-graph:staleness-detection`**:
   - **Full Consistency**: Schema version was cleanly bumped to 13 (`SQLITE_SCHEMA_VERSION = 13`). Staleness detection and derivation fingerprinting (`computeGraphFingerprint`) incorporate config-level `graph` options and workspace configurations without conflict.
3. **`default:_global/architecture`**:
   - **Hexagonal Architecture**:
     - `domain`: `FileCategory`, `FileNode`, `ImpactResultFilter`, `OmittedCounts`, `HotspotOptions`, and `HotspotResult` are immutable value objects. `classifyFileCategory` is a pure, stateless domain service with zero I/O.
     - `application/ports`: `GraphStore` is an abstract class defining contracts for `queryImpactFrontier`, `findSymbols`, `getFileImporterCounts`, and file queries.
     - `infrastructure/sqlite`: Storage and SQL statements are isolated to `SQLiteGraphDatabase` and `SQLiteGraphStore`. Physical pushdown avoids loading unadmitted rows across the boundary.
     - `composition`: Provider wiring in `createCodeGraphProvider` preserves the boundary.
   - **No Circular Dependencies**: Clear unidirectional dependency hierarchy (`domain` -> `application/ports` -> `infrastructure`/`composition`).
4. **`default:_global/conventions`**:
   - TypeScript strict mode compliance verified.
   - ESM-only with explicit `.js` import extensions.
   - Pure functions for stateless domain services (`classifyFileCategory`, `resolveAdmittedCategories`).
   - Named exports only; no default exports.

---

## 7. Summary Counts

- **Specs Audited**: 3 (`code-graph:graph-store`, `code-graph:traversal`, `code-graph:hotspots`)
- **Requirements Audited**: 7
- **Fully Implemented**: 7
- **Discrepancies**: 3 (1 type optionality, 1 spec drift in `symbol-model`, 1 empty array edge-case)
- **Missing Tests**: 2 (direct SQLite queryImpactFrontier category test, end-to-end SQLite traversal category test)
- **Total `@specd/code-graph` Test Files Passed**: 63 / 63
- **Total `@specd/code-graph` Tests Passed**: 836 / 836
