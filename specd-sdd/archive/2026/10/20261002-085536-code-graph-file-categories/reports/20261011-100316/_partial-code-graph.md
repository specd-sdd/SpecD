# Spec Compliance Partial Report: Code Graph (`code-graph` batch)

**Change:** `code-graph-file-categories`  
**Audit Directory:** `specd-sdd/changes/20261002-085536-code-graph-file-categories/reports/20261011-100316`  
**Auditor:** Spec Compliance Subagent (`code-graph` batch)  
**Timestamp:** 2026-10-11T10:11:30+02:00

---

## Executive Summary

This partial audit reviews the implementation, test coverage, and specification consistency of the `code-graph-file-categories` change across the three target specs in the `code-graph` workspace:

1. [`code-graph:graph-store`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/graph-store/spec.md)
2. [`code-graph:traversal`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/spec.md)
3. [`code-graph:hotspots`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/hotspots/spec.md)

In addition, direct dependencies and cross-cutting specifications were analyzed:

- [`code-graph:symbol-model`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/symbol-model/spec.md)
- [`code-graph:staleness-detection`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/staleness-detection/spec.md)
- [`code-graph:document-model`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/document-model/spec.md)
- [`code-graph:resolve-symbol-reference`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/resolve-symbol-reference/spec.md)

### Key Findings Summary

- **Overall Implementation:** The core mechanisms for file semantic categorization (`source`, `test`, `ignored`), SQLite schema persistence, physical push-down filtering during BFS frontier queries, category isolation in risk calculations, anchored target downstream reachability, and omitted file accounting are implemented and functional. All 63 test suites (836 tests) in `@specd/code-graph` pass.
- **Critical Discrepancy Found (Spec vs Code):**
  - **`DEFAULT_HOTSPOT_KINDS` in `code-graph:hotspots`:** The merged spec explicitly defines `kinds = ['class', 'method', 'function', 'interface']` for the default hotspot view, and the verification scenario specifically asserts that `interface` symbols are eligible. However, `DEFAULT_HOTSPOT_KINDS` in [hotspot-result.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/hotspot-result.ts#L8-L12) and unit tests in [compute-hotspots.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L245) only include `['class', 'method', 'function']`. `interface` is omitted in the code.
- **Specification Drift / Inconsistency Found (Cross-Spec):**
  - **`FileNode` in `code-graph:symbol-model` vs `code-graph:graph-store`:** `code-graph:symbol-model` defines the domain model for `FileNode` (properties: `path`, `configRelativePath`, `language`, `contentHash`, `workspace`, `embedding`). The delta for `code-graph:graph-store` adds `category` to the minimum persisted file node semantics, and [file-node.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/file-node.ts#L16) implements `category: FileCategory`. However, `code-graph:symbol-model` was not updated in this change to declare `category` as a property of `FileNode`.
  - **Graph Fingerprint Derivation in `code-graph:staleness-detection`:** The derivation fingerprint computed in [compute-graph-fingerprint.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts#L104) does not incorporate `testPaths` and `ignorePaths`. As a result, changes to test or ignore patterns in `specd.yaml` do not trigger a derivation fingerprint mismatch, even though they alter file categorization.
- **Test Coverage Gaps:**
  - **Direct SQLite Physical Frontier Category Filtering:** In `code-graph:graph-store`, the scenario _"Category filter excludes non-admitted categories in physical query"_ requires verifying that an SQLite store excludes test callers directly in SQL statements and returns only admitted callers. While [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts#L1008) tests this against `InMemoryGraphStore`, there is no direct unit test in [sqlite-graph-store.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts) asserting that `SQLiteGraphStore.queryImpactFrontier` physically suppresses test callers and returns SQL-populated `omittedFiles`.

---

## Detailed Findings: `code-graph:graph-store`

### Requirements Summary

The `graph-store` spec establishes the abstract storage contract for code-graph entities, persisted relations, metadata, querying, and atomic lifecycle. The delta introduced in `code-graph-file-categories` mandates:

1. File nodes carrying semantic category (`source` | `test` | `ignored`), with `'source'` as the default.
2. The `files` table persisting and indexing the `category` attribute to support low-latency filtering.
3. Query method `findSymbols(query: SymbolQuery)` supporting optional `categories: readonly FileCategory[]` for filtering symbols by the category of their declaring file.
4. `GraphStore.queryImpactFrontier` exposing backend-neutral impact queries accepting `categories?: readonly FileCategory[]`, `includeTests?: boolean`, `includeIgnored?: boolean`, defaulting to `['source']` when unspecified.
5. Push-down physical execution: Store implementations MUST apply category predicates in physical query execution (e.g. SQL joins/where clauses) and MUST NOT load an unrestricted candidate set across the adapter boundary to filter in TypeScript.

### Implementation Status

**Status: Fully Implemented with 1 Testing Gap.**

- **Database Schema:** [schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/schema.ts#L6-L15) defines `category TEXT NOT NULL DEFAULT 'source'` on table `files`, and [schema.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/schema.ts#L149) creates index `idx_files_category ON files(category)`. Schema version is 13.
- **Entity Creation & Mapping:** [file-node.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/file-node.ts#L59) defaults `category` to `'source'`. [sqlite-graph-database.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L3715) maps `row.category ?? 'source'`.
- **Symbol Query Filtering:** [sqlite-graph-database.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L1402-L1406) adds `file_path IN (SELECT path FROM files WHERE category IN (?))` when `query.categories` is provided.
- **Impact Frontier Push-Down Query:** [sqlite-graph-database.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L3188-L3191) joins `files f` and injects `category IN (...)` directly into SQL conditions. Non-admitted category candidates are captured via a dedicated SQL `SELECT DISTINCT ... category IN (nonAdmitted)` query ([L3261-L3270](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L3261-L3270)), ensuring no non-admitted relations cross the boundary into TypeScript.
- **Worker Protocol:** [sqlite-worker-protocol.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts#L247) preserves the entire filter payload across the worker boundary.

### Requirement-by-Requirement Audit

| Requirement                        | Spec Clause                                                                                  | Code Evidence                                                                                                                                                        | Status        |
| :--------------------------------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------ |
| **Minimum graph semantics**        | Persist and index `category` attribute (`source` \| `test` \| `ignored`, default `'source'`) | `schema.ts`: `category TEXT NOT NULL DEFAULT 'source'`, `CREATE INDEX idx_files_category`<br>`sqlite-graph-database.ts`: `insertFile` / `insertFiles` / `mapFileRow` | **COMPLIANT** |
| **Query methods**                  | `findSymbols(query: SymbolQuery)` accepts `categories`                                       | `graph-store.ts`: `SymbolQuery.categories`<br>`sqlite-graph-database.ts` lines 1402–1406                                                                             | **COMPLIANT** |
| **Filtered impact query contract** | Admitted categories default to `['source']`                                                  | `impact-result.ts`: `resolveAdmittedCategories`<br>`sqlite-graph-database.ts` line 3162                                                                              | **COMPLIANT** |
| **Filtered impact query contract** | Physical query execution push-down (no load-then-drop)                                       | `sqlite-graph-database.ts`: `JOIN files f ON f.path = n.file_path WHERE f.category IN (...)` directly in SQL                                                         | **COMPLIANT** |
| **Filtered impact query contract** | Worker request preserves category filters                                                    | `sqlite-worker-protocol.ts`, `sqlite-worker.ts`: passes `filter` intact to `queryImpactFrontier`                                                                     | **COMPLIANT** |

### Verification Scenarios Audit

1. **Scenario: Backend persists file category**
   - _Requirement:_ When file with `'test'` or `'ignored'` is persisted, loaded `FileNode` preserves `category`; files without explicit category default to `'source'`.
   - _Evidence:_ Verified in [sqlite-graph-store.spec.ts#L2840-L2883](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts#L2840-L2883) (`persists and hydrates file categories for test, ignored, and source files`) and [file-node.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/value-objects/file-node.spec.ts).
   - _Status:_ **PASS**
2. **Scenario: findSymbols filters by category**
   - _Requirement:_ Given symbols in `'source'`, `'test'`, `'ignored'`, `findSymbols({ categories: ['source'] })` returns only source symbols.
   - _Evidence:_ Verified in [graph-store.contract.ts#L1217-L1222](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/ports/graph-store.contract.ts#L1217-L1222).
   - _Status:_ **PASS**
3. **Scenario: Category filter excludes non-admitted categories in physical query**
   - _Requirement:_ SQLite store with callers in `'source'` and `'test'` files excludes `'test'` callers directly in SQL and returns only `'source'` callers across boundary.
   - _Evidence:_ Tested at traversal service layer with `InMemoryGraphStore` in [traversal.spec.ts#L1008-L1033](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts#L1008-L1033). SQLite implementation in [sqlite-graph-database.ts#L3188](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts#L3188) enforces this in SQL. However, a dedicated contract unit test in `sqlite-graph-store.spec.ts` executing `queryImpactFrontier` with mixed file categories is absent.
   - _Status:_ **PARTIAL (Logic compliant, direct SQLite contract test missing)**

---

## Detailed Findings: `code-graph:traversal`

### Requirements Summary

Defines graph traversal, reachability, and blast-radius impact analysis across symbols, files, and specs. The delta introduced in `code-graph-file-categories` mandates:

1. `ImpactResult` carries `omittedCounts: { tests: number, ignored: number }`.
2. Dependent counts (`directDependents`, `indirectDependents`, `transitiveDependents`) and derived `riskLevel` must be calculated strictly over admitted categories (`'source'` by default). Non-admitted test or ignored dependents MUST NOT inflate dependent counts or risk level.
3. Downstream traversal for anchored non-source targets: when the target symbol or file is explicitly located in a `test` or `ignored` file, downstream dependencies of that target MUST be traversed.
4. BFS pruning: Upstream and bidirectional BFS expansion MUST halt at non-admitted file boundaries so test files do not act as relational bridges between unrelated production modules.
5. All entry points (`analyzeImpact`, `analyzeFileImpact`, `analyzeFilesImpact`) accept category filters and default to `['source']`.

### Implementation Status

**Status: Fully Implemented & Fully Verified.**

- **Domain Model:** [impact-result.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/impact-result.ts#L14-L29) defines `OmittedCounts`, `CategoryFilterOptions`, `resolveAdmittedCategories`, and updates `ImpactResult` with `omittedCounts` and optional `omittedFiles`.
- **Service Orchestration:** [analyze-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-impact.ts#L155-L170) defaults `filter.categories` to `resolveAdmittedCategories(filter)` (`['source']`).
- **Omission Tracking:** Omitted files reported from `queryImpactFrontier` are collected into `omittedTestFiles` and `omittedIgnoredFiles` sets ([analyze-impact.ts#L220](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-impact.ts#L220)).
- **BFS Pruning:** Because the physical store query does not admit non-admitted files or their symbols, adjacent endpoints in non-admitted categories are omitted from `nextSymbols` and `nextFiles`, halting BFS traversal before traversing their transitive relations.
- **Anchored Target Downstream Traversal:** In [analyze-file-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-file-impact.ts#L116-L135), when target is `test/my.spec.ts` and direction is `'downstream'`, root symbols are loaded via `findSymbols({ filePath })`. Outgoing relations (`CALLS`, `IMPORTS`) target production code (`src/index.ts`). Since `'source'` is an admitted category, `queryImpactFrontier` admits those target nodes and returns them.

### Verification Scenarios Audit

1. **Scenario: Test callers do not inflate risk level or dependents**
   - _Requirement:_ Production symbol called by 1 production module and 20 test files returns `directDependents: 1`, `riskLevel: 'LOW'`, `omittedCounts.tests: 20`.
   - _Evidence:_ Fully verified in [traversal.spec.ts#L1008-L1033](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts#L1008-L1033).
   - _Status:_ **PASS**
2. **Scenario: Category filter prunes BFS traversal through test files**
   - _Requirement:_ Module A called by Test T, Test T called by Module B. Traversal from A halts at T; B is NOT reached.
   - _Evidence:_ Fully verified in [traversal.spec.ts#L1035-L1059](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts#L1035-L1059).
   - _Status:_ **PASS**
3. **Scenario: Anchored test target traverses dependencies**
   - _Requirement:_ Target is `test/my.spec.ts`. Downstream impact returns downstream dependencies in `affectedFiles`.
   - _Evidence:_ Fully verified in [traversal.spec.ts#L1061-L1085](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts#L1061-L1085).
   - _Status:_ **PASS**

---

## Detailed Findings: `code-graph:hotspots`

### Requirements Summary

Computes hotspot ranking across the code graph using batch queries. The delta introduced in `code-graph-file-categories` mandates:

1. Signal calculations (`sameWorkspaceCallers`, `crossWorkspaceCallers`, `fileImporters`, hierarchy dependents) must be computed strictly over admitted categories (`'source'` by default).
2. Symbols declared in non-admitted categories must be excluded from candidate ranking by default.
3. `HotspotOptions` supports `categories`, `includeTests`, and `includeIgnored`.
4. Smart defaults: `categories = ['source']`, `kinds = ['class', 'method', 'function', 'interface']`, `risk >= MEDIUM`, `limit 20`, importer-only excluded.
5. Output `HotspotResult` contains `omittedCounts: { tests: number, ignored: number }`.

### Implementation Status

**Status: Implemented with 1 Discrepancy.**

- **Service Logic:** [compute-hotspots.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts) implements category isolation across:
  - Caller rows ([lines 176–185](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L176-L185)): filters `callerCategory` and `symbolCategory`.
  - Importers ([line 146](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L146)): passes admitted categories to `store.getFileImporterCounts`.
  - Hierarchy dependents ([lines 98–104](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L98-L104)): filters `sourceCategory`.
  - Candidate symbols ([lines 219–224](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L219-L224)): excludes non-admitted symbol declarations.
  - Omitted counts ([lines 154–162](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/compute-hotspots.ts#L154-L162)): counts omitted test and ignored files across all indexed files.

### Discrepancy (Spec vs Code): `DEFAULT_HOTSPOT_KINDS`

- **Spec Requirement:**
  From `specs/code-graph/hotspots/spec.md`:
  > **Smart defaults with automatic removal**  
  > `- kinds = ['class', 'method', 'function', 'interface'] — the default hotspot view focuses on callable or structural symbols`
  >
  > **Scenario: Default kind set focuses the hotspot view**  
  > `THEN only class, method, function, and interface symbols are eligible for the default hotspot view`
- **Code Reality:**
  In [hotspot-result.ts#L8-L12](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/hotspot-result.ts#L8-L12):
  ```typescript
  export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
    SymbolKindEnum.Class,
    SymbolKindEnum.Method,
    SymbolKindEnum.Function,
  ] as const
  ```
  In [compute-hotspots.spec.ts#L245](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L245):
  ```typescript
  expect(DEFAULT_HOTSPOT_KINDS).toEqual(['class', 'method', 'function'])
  ```
- **Analysis:**
  `SymbolKind.Interface` is absent from `DEFAULT_HOTSPOT_KINDS` in the implementation and test assertion. In TypeScript codebases, interfaces are prominent structural contracts; the spec explicitly mandated their inclusion in the default hotspot view alongside `class`, `method`, and `function`. Either the implementation has a bug omitting `interface`, or the spec delta intended to include `interface` but the code author chose not to update `DEFAULT_HOTSPOT_KINDS` to avoid changing existing scoring behavior.

### Verification Scenarios Audit

1. **Scenario: Callers in test files do not count toward hotspot scores by default**
   - _Requirement:_ Symbol called only by test files does not receive caller points by default; symbol called by production code reflects callers.
   - _Evidence:_ Verified in [compute-hotspots.spec.ts#L499-L525](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L499-L525).
   - _Status:_ **PASS**
2. **Scenario: Include tests in hotspot computation**
   - _Requirement:_ `computeHotspots({ includeTests: true })` counts test callers in directCallers and score.
   - _Evidence:_ Verified in [compute-hotspots.spec.ts#L527-L543](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L527-L543).
   - _Status:_ **PASS**
3. **Scenario: Omitted test and ignored files tracked in output**
   - _Requirement:_ `omittedCounts` in `HotspotResult` contains counts of excluded test and ignored files.
   - _Evidence:_ Verified in [compute-hotspots.spec.ts#L567-L581](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L567-L581).
   - _Status:_ **PASS**
4. **Scenario: Default kind set focuses the hotspot view**
   - _Requirement:_ Default kinds include `interface`.
   - _Evidence:_ FAILS due to `DEFAULT_HOTSPOT_KINDS` lacking `interface`.
   - _Status:_ **FAIL (Discrepancy)**

---

## Direct Dependencies & Cross-Cutting Architecture Audit

### 1. Classification Engine (`classify-file-category.ts`)

- Implemented in [classify-file-category.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/classify-file-category.ts).
- Precedence order:
  1. `ignorePatterns` -> `'ignored'`
  2. `testPatterns` -> `'test'`
  3. Default -> `'source'`
- Uses the `ignore` npm package (gitignore standard compliance). Strips workspace prefixes and handles Windows/POSIX paths.
- Verified in [classify-file-category.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/classify-file-category.spec.ts) (5 tests passing).

### 2. Search Code Graph Integration (`search-code-graph.ts`)

- [search-code-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/search-code-graph.ts) integrates `fileCategories`, `includeTests`, and `includeIgnored`.
- Emits `omittedCounts: { tests: number, ignored: number }` on `SearchCodeGraphResult`.
- Aligned with architecture constraint: The low-level `searchSourceContentCandidates` on Store does not take category filters; `SearchCodeGraph.searchFiles` performs exact category admission and omission counting alongside snippet extraction and symbol suppression.
- Verified in [search-code-graph.spec.ts#L857-L922](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/application/use-cases/search-code-graph.spec.ts#L857-L922).

### 3. Spec Dependency: `code-graph:symbol-model`

- **Issue:** Spec Drift.
- In `specs/code-graph/symbol-model/spec.md`, Requirement `File node` lists: `path`, `configRelativePath`, `language`, `contentHash`, `workspace`, `embedding`.
- The delta for this change updated `code-graph:graph-store` to require `category` on `FileNode`, and the code in [file-node.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/file-node.ts#L16) has `category: FileCategory`.
- `code-graph:symbol-model` is the foundational domain entity spec defining `FileNode`, but it was not updated in this change to include `category`.

### 4. Spec Dependency: `code-graph:staleness-detection`

- **Issue:** Fingerprint Coverage Gap.
- In [compute-graph-fingerprint.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts#L104), the derivation fingerprint payload includes package version, workspaces (`codeRoot`, `allowedPaths`, `excludePaths`, `respectGitignore`), and resolution inputs.
- `testPaths` and `ignorePaths` are configured in `specd.yaml` and used by `classifyFileCategory` during indexing. However, they are not incorporated into the derivation fingerprint payload.
- If a developer edits `testPaths` or `ignorePaths` in `specd.yaml`, the derivation fingerprint remains unchanged, and `isGraphStale` will report the graph as fresh even though category classifications are outdated.

---

## Test Coverage Summary

| Area / File                           | Unit / Integration Test Suites                                                      | Status    |
| :------------------------------------ | :---------------------------------------------------------------------------------- | :-------- |
| `FileNode` entity & defaults          | `test/domain/value-objects/file-node.spec.ts` (10 tests)                            | 100% Pass |
| `classifyFileCategory` logic          | `test/domain/services/classify-file-category.spec.ts` (5 tests)                     | 100% Pass |
| SQLite Schema & Persistence           | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts` (DDL & file category tests) | 100% Pass |
| Category filter in `findSymbols`      | `test/domain/ports/graph-store.contract.ts` (line 1217)                             | 100% Pass |
| Traversal risk isolation & omission   | `test/domain/services/traversal.spec.ts` (lines 1008–1085)                          | 100% Pass |
| Hotspot category isolation & omission | `test/domain/services/compute-hotspots.spec.ts` (lines 499–581)                     | 100% Pass |
| Search category filtering & omission  | `test/application/use-cases/search-code-graph.spec.ts` (lines 857–922)              | 100% Pass |
| Wide traversal integration            | `test/integration/sqlite-wide-traversal.spec.ts` (4 tests)                          | 100% Pass |

---

## Summary Counts

| Metric                                      | Count                                                                                   |
| :------------------------------------------ | :-------------------------------------------------------------------------------------- |
| **Total Requirements Audited**              | 8                                                                                       |
| **Fully Compliant Requirements**            | 7                                                                                       |
| **Partially Compliant / Discrepancies**     | 1 (`code-graph:hotspots` default kinds)                                                 |
| **Spec Dependencies Audited**               | 4 (`symbol-model`, `staleness-detection`, `document-model`, `resolve-symbol-reference`) |
| **Spec Drift / Inconsistencies Found**      | 2 (`symbol-model` FileNode missing category; fingerprint excludes test/ignore patterns) |
| **Verification Scenarios Audited**          | 9                                                                                       |
| **Scenarios Passing**                       | 8                                                                                       |
| **Scenarios Failing / Missing Evidence**    | 1 (Hotspots default kind set with interface)                                            |
| **Total Test Suites Passing in Code Graph** | 63 (836 tests)                                                                          |

---

## Actionable Recommendations

1. **Resolve `DEFAULT_HOTSPOT_KINDS` discrepancy in `code-graph:hotspots`:**
   - Either add `SymbolKind.Interface` to `DEFAULT_HOTSPOT_KINDS` in [hotspot-result.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/value-objects/hotspot-result.ts#L8-L12) and update [compute-hotspots.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/compute-hotspots.spec.ts#L245) to match the spec, or update the spec delta in `hotspots/spec.md.delta.yaml` if interfaces were intentionally excluded from default hotspot ranking.
2. **Harmonize `code-graph:symbol-model` with `code-graph:graph-store`:**
   - Add a delta for `specs/code-graph/symbol-model/spec.md` documenting `category: FileCategory` on `FileNode`.
3. **Include `testPaths` and `ignorePaths` in graph derivation fingerprint:**
   - Update `computeGraphFingerprint` in [compute-graph-fingerprint.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts#L104) to serialize `testPaths` and `ignorePaths` so configuration updates invalidate stale graph classifications.
4. **Add direct SQLite physical query test for category exclusions:**
   - In [sqlite-graph-store.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts), add a test asserting that `store.queryImpactFrontier` against SQLite directly excludes `'test'` category callers in SQL and populates `omittedFiles`.
