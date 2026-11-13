# Spec Compliance Audit Report: `code-graph-file-categories`

**Audit Mode:** Change-specific (`--change code-graph-file-categories`)  
**Change Directory:** `specd-sdd/changes/20261002-085536-code-graph-file-categories`  
**Report Directory:** `specd-sdd/changes/20261002-085536-code-graph-file-categories/reports/20261011-100316`  
**Generated At:** 2026-10-11T10:14:00+02:00

---

## 1. Executive Summary & Aggregate Metrics

This audit evaluates the compliance of the implementation in `packages/core`, `packages/code-graph`, and `packages/cli` against the 7 change-scoped specs and their direct dependencies for change `code-graph-file-categories`.

### Aggregate Metrics

| Metric                                      | Total                                                                                                                                                                                         |
| :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Specs Audited in Change Scope**           | 7 (`core:config`, `code-graph:graph-store`, `code-graph:traversal`, `code-graph:hotspots`, `cli:graph-impact`, `cli:graph-hotspots`, `cli:graph-search`)                                      |
| **Direct Spec Dependencies Audited**        | 10 (`architecture`, `conventions`, `vcs-adapter-port`, `symbol-model`, `staleness-detection`, `document-model`, `resolve-symbol-reference`, `entrypoint`, `graph-cli-context`, `composition`) |
| **Total Requirements Audited**              | 45                                                                                                                                                                                            |
| **Fully Compliant Requirements**            | 44                                                                                                                                                                                            |
| **Functional Discrepancies**                | 1 (`DEFAULT_HOTSPOT_KINDS` in `code-graph:hotspots`)                                                                                                                                          |
| **Cross-Spec Drift / Consistency Findings** | 2 (`FileNode.category` in `code-graph:symbol-model`, fingerprint inputs in `code-graph:staleness-detection`)                                                                                  |
| **Documentation / Help Text Drift**         | 1 (`addHelpText` JSON schema omitted `omittedCounts` in CLI commands)                                                                                                                         |
| **Verification Scenarios Evaluated**        | 57 across all 7 specs                                                                                                                                                                         |
| **Scenarios Passing with Automated Tests**  | 56                                                                                                                                                                                            |
| **Total Unit/Integration Tests Passing**    | 2,089 (100% pass rate: 133 in core config, 836 in code-graph, 1,120 in cli)                                                                                                                   |

---

## 2. Identified Discrepancies and Findings

### 1. Functional Discrepancy: `DEFAULT_HOTSPOT_KINDS` in `code-graph:hotspots`

- **Spec:** The merged spec delta for `code-graph:hotspots` states:
  > `kinds = ['class', 'method', 'function', 'interface'] — the default hotspot view focuses on callable or structural symbols`
- **Code:** In `packages/code-graph/src/domain/value-objects/hotspot-result.ts`, `DEFAULT_HOTSPOT_KINDS` contains only `['class', 'method', 'function']`. Unit tests in `compute-hotspots.spec.ts` assert this 3-item list.
- **Analysis:** `interface` symbols are omitted from the default hotspot view in code.

### 2. Cross-Spec Drift: `FileNode.category` in `code-graph:symbol-model`

- **Spec:** `code-graph:symbol-model` is the canonical domain specification for `FileNode`. It lists `path`, `configRelativePath`, `language`, `contentHash`, `workspace`, and `embedding`.
- **Finding:** The delta for `code-graph:graph-store` introduces `category: FileCategory` on `FileNode`, and `packages/code-graph/src/domain/value-objects/file-node.ts` implements it. However, the upstream foundational spec `code-graph:symbol-model` was not updated in this change.

### 3. Staleness Fingerprint Gap in `code-graph:staleness-detection`

- **Finding:** In `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`, `testPaths` and `ignorePaths` are not serialized into the derivation fingerprint payload.
- **Impact:** Modifying `graph.testPaths` or `graph.ignorePaths` in `specd.yaml` does not trigger a fingerprint mismatch or mark the graph as stale.

### 4. CLI Help Schema Drift

- **Finding:** In `graph impact`, `graph hotspots`, and `graph search`, `addHelpText('after', ...)` does not document the newly added `omittedCounts` field in the example JSON schemas.

---

## 3. Detailed Findings by Batch

### Batch 1: Core Specs (`core:config`)

_Verbatim subagent audit findings:_

<!-- BEGIN VERBATIM PARTIAL CORE -->

# Partial: Core specs — `code-graph-file-categories`

**Specs audited:** `core:config`  
**Dependencies checked:** `default:_global/architecture`, `core:vcs-adapter-port`

---

## 1. Requirements Summary

| Spec          | Requirement / Area                                                                  | Impl Status | Notes                                                                |
| :------------ | :---------------------------------------------------------------------------------- | :---------- | :------------------------------------------------------------------- |
| `core:config` | Workspace-level graph configuration (`testPaths`, `ignorePaths`)                    | ✅ Pass     | Supported in types, Zod schema, and loader                           |
| `core:config` | Project-level graph configuration (`testPaths` defaults & overrides, `ignorePaths`) | ✅ Pass     | Defaults applied when omitted; overrides respected                   |
| `core:config` | Categorization precedence specification                                             | ✅ Pass     | Documented in spec; consumed by `@specd/code-graph`                  |
| `core:config` | Verification scenarios satisfaction                                                 | ✅ Pass     | All workspace and project graph verification scenarios covered       |
| `core:config` | Hexagonal architecture & boundary validation                                        | ✅ Pass     | YAML inputs validated at boundary; pure interfaces preserved         |
| `core:config` | Direct dependencies conformance (`_global/architecture`, `vcs-adapter-port`)        | ✅ Pass     | No circular dependencies; repository bounding via VCS adapter intact |

---

## 2. Implementation Status

### 2.1 Domain & Application Types (`packages/core/src/application/specd-config.ts`)

- **`SpecdWorkspaceGraphConfig`**:
  - Added `readonly testPaths?: readonly string[]` for workspace-specific test patterns.
  - Added `readonly ignorePaths?: readonly string[]` for workspace-specific ignored patterns.
  - Preserved existing `respectGitignore`, `excludePaths`, and `allowedPaths`.
- **`SpecdGraphConfig`**:
  - Added `readonly testPaths?: readonly string[]` for project-global test patterns.
  - Added `readonly ignorePaths?: readonly string[]` for project-global ignored patterns.
  - Preserved existing `includePaths` and `excludePaths`.
- **Constants**:
  - `DEFAULT_GRAPH_TEST_PATHS`: Exported as `['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`.
  - `DEFAULT_GRAPH_IGNORE_PATHS`: Exported as empty array `[]`.
- **Public Exports**:
  - Re-exported from `packages/core/src/application/index.ts` and `packages/core/src/public.ts`, ensuring availability to downstream consumers (`@specd/code-graph`, `@specd/cli`) via public entry points.

### 2.2 Boundary Schema Validation (`packages/core/src/application/ports/config-schema.ts`)

- **`WorkspaceGraphZodSchema`**:
  - Extended with `testPaths: z.array(z.string()).optional()` and `ignorePaths: z.array(z.string()).optional()`.
  - Maintained `.strict()` mode to reject unrecognized fields.
- **`ProjectGraphZodSchema`**:
  - Extended with `testPaths: z.array(z.string()).optional()` and `ignorePaths: z.array(z.string()).optional()`.
  - Maintained `.strict()` mode to reject unrecognized fields.
- Conforms to architecture invariant: unvalidated YAML cannot reach domain or application objects.

### 2.3 Configuration Loader (`packages/core/src/infrastructure/fs/config-loader.ts`)

- **Workspace parsing** (lines 457–477):
  - Preserves `testPaths` and `ignorePaths` onto `SpecdWorkspaceConfig.graph` when defined.
  - Keeps `SpecdWorkspaceConfig.graph` `undefined` when the `graph` block is absent on the workspace.
- **Project-level parsing** (lines 629–638):
  - Populates `testPaths` with `data.graph?.testPaths ?? DEFAULT_GRAPH_TEST_PATHS`.
  - Populates `ignorePaths` with `data.graph?.ignorePaths ?? DEFAULT_GRAPH_IGNORE_PATHS`.
  - Guarantees default test and ignore paths are present even when `graph` is completely omitted from `specd.yaml`.

---

## 3. Verification Scenarios Satisfaction

### Workspace-level Graph Configuration

| Scenario                                              | Spec Expectation                                                                   | Implementation / Test                                                                                      | Result  |
| :---------------------------------------------------- | :--------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------ |
| **Allowed paths constrain workspace indexing**        | Declared `graph.allowedPaths` preserved on workspace config                        | `config-loader.spec.ts:1568` (`it('parses graph.allowedPaths correctly')`)                                 | ✅ Pass |
| **excludePaths replaces built-in defaults**           | Declared `graph.excludePaths` preserved without merging built-in defaults          | `config-loader.spec.ts:1514` (`it('parses graph.excludePaths and graph.respectGitignore correctly')`)      | ✅ Pass |
| **graph block absent — no field on workspace config** | Workspace `graph` is `undefined` when omitted                                      | `config-loader.spec.ts:1558` (`it('graph field is undefined on workspace when graph block is absent')`)    | ✅ Pass |
| **respectGitignore defaults to true**                 | `respectGitignore` omitted is `undefined` on config (treated as `true` by indexer) | `config-loader.spec.ts:1568` & `code-graph` indexer                                                        | ✅ Pass |
| **respectGitignore set to false**                     | Explicit `respectGitignore: false` preserved                                       | `config-loader.spec.ts:1514`                                                                               | ✅ Pass |
| **Workspace testPaths and ignorePaths configured**    | Workspace `testPaths` and `ignorePaths` parsed and preserved                       | `config-loader.spec.ts:1753` (`it('parses graph.testPaths and graph.ignorePaths correctly on workspace')`) | ✅ Pass |

### Project-level Graph Configuration

| Scenario                                         | Spec Expectation                                                                     | Implementation / Test                                                                                                                                                                                                  | Result  |
| :----------------------------------------------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------ |
| **Project graph include paths discovered**       | `graph.includePaths` parsed into `config.graph.includePaths`                         | `config-loader.spec.ts:1795` (`it('reads graph.includePaths and graph.excludePaths into SpecdConfig')`)                                                                                                                | ✅ Pass |
| **Project graph exclude paths discovered**       | `graph.excludePaths` parsed into `config.graph.excludePaths`                         | `config-loader.spec.ts:1795`                                                                                                                                                                                           | ✅ Pass |
| **Project testPaths and ignorePaths configured** | Explicit `testPaths` and `ignorePaths` loaded into `SpecdConfig.graph`               | `config-loader.spec.ts:1826` (`it('reads configured graph.testPaths and graph.ignorePaths into SpecdConfig')`)                                                                                                         | ✅ Pass |
| **Project testPaths omitted defaults applied**   | Defaults applied when `testPaths` omitted from `graph` or when `graph` block omitted | `config-loader.spec.ts:1844` (`it('populates default testPaths and ignorePaths when omitted in graph block')`) and `1867` (`it('populates default testPaths and ignorePaths when graph block is completely omitted')`) | ✅ Pass |

---

## 4. Discrepancies & Observations

### OBS-CORE-1 — Negative Type Validation Test Gap (Severity: Low / Test Gap)

- **Finding:** While negative tests exist in `packages/core/test/infrastructure/fs/config-loader.spec.ts` for non-array `includePaths` (`it('rejects graph.includePaths when given a bare string instead of array')`), non-boolean `respectGitignore`, non-array `excludePaths`, non-array `allowedPaths`, and unknown fields in `graph`, there is no explicit test verifying that non-array / bare string `testPaths` or `ignorePaths` causes a validation failure.
- **Assessment:**
  - `ProjectGraphZodSchema` and `WorkspaceGraphZodSchema` strictly declare `z.array(z.string()).optional()`, so Zod will correctly reject strings, numbers, or objects.
  - However, adding explicit test cases for `testPaths: "bare-string"` and `ignorePaths: "bare-string"` would improve full symmetry across all array fields in `config-loader.spec.ts`.
- **Action:** Non-blocking test gap recommendation for future cleanup.

### OBS-CORE-2 — Interface Optionality vs Loader Guarantee (Severity: Info / Design Note)

- **Finding:** In `packages/core/src/application/specd-config.ts`, `SpecdConfig.graph` is defined as `readonly graph?: SpecdGraphConfig` (optional). In `packages/core/src/infrastructure/fs/config-loader.ts`, `ConfigLoader.load()` always populates `graph: { ... testPaths: [...], ignorePaths: [...] }`.
- **Assessment:**
  - This is intentional: typing `graph?: SpecdGraphConfig` allows flexibility for mock configs, partial overrides, or non-filesystem loader implementations, while `ConfigLoader` guarantees default values are populated at runtime.
  - Downstream consumers in `@specd/code-graph` (e.g. `buildProjectGraphConfig`) safely use `config.graph?.testPaths ?? DEFAULT_GRAPH_TEST_PATHS`.

---

## 5. Test Coverage Analysis

| Test Suite / Block                    | Coverage Scope                                                                                                                                                                | Status            |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- |
| `Requirement: Workspace graph config` | 8 tests: `excludePaths`, `respectGitignore`, absent block, `allowedPaths`, invalid types, unknown keys, `testPaths`, `ignorePaths`                                            | ✅ 8 / 8 Pass     |
| `Requirement: Project graph config`   | 5 tests: `includePaths`, `excludePaths`, non-array `includePaths` rejection, explicit `testPaths`/`ignorePaths`, omitted defaults in block, completely omitted block defaults | ✅ 5 / 5 Pass     |
| Full `config-loader.spec.ts` suite    | 133 tests covering entire config loading, cascade, validation, and defaults                                                                                                   | ✅ 133 / 133 Pass |

---

## 6. Architecture & Direct Dependency Compliance

1. **Hexagonal Architecture (`default:_global/architecture`):**
   - Pure domain contracts: Interfaces `SpecdGraphConfig`, `SpecdWorkspaceGraphConfig`, and constants `DEFAULT_GRAPH_TEST_PATHS`, `DEFAULT_GRAPH_IGNORE_PATHS` reside in `application/`.
   - Port validation: Zod schemas in `application/ports/config-schema.ts`.
   - Infrastructure implementation: `ConfigLoader` in `infrastructure/fs/config-loader.ts`.
   - Public barrel curation: `packages/core/src/public.ts` exports types and constants, without leaking internal adapter classes.
2. **VCS Port Bounding (`core:vcs-adapter-port`):**
   - `ConfigLoader` resolution continues to use the active VCS adapter for bounding repository walk-up without interference from new graph configuration fields.
3. **No Circular Package Dependencies:**
   - `@specd/core` has zero dependencies on `@specd/code-graph` or other downstream packages. `@specd/code-graph` imports the types and default constants from `@specd/core`.

---

## 7. Summary

- **Total requirements / scenarios audited:** 10
- **Passing:** 10
- **Failing:** 0
- **Spec Drift:** 0
- **Test Gaps:** 1 minor (negative type tests for new array fields)
- **Verdict:** **COMPLIANT**
<!-- END VERBATIM PARTIAL CORE -->

---

### Batch 2: Code Graph Specs (`code-graph:graph-store`, `code-graph:traversal`, `code-graph:hotspots`)

_Verbatim subagent audit findings:_

<!-- BEGIN VERBATIM PARTIAL CODE GRAPH -->

# Spec Compliance Partial Report: Code Graph (`code-graph` batch)

**Change:** `code-graph-file-categories`  
**Audit Directory:** `specd-sdd/changes/20261002-085536-code-graph-file-categories/reports/20261011-100316`  
**Auditor:** Spec Compliance Subagent (`code-graph` batch)  
**Timestamp:** 2026-10-11T10:11:30+02:00

---

## Executive Summary

This partial audit reviews the implementation, test coverage, and specification consistency of the `code-graph-file-categories` change across the three target specs in the `code-graph` workspace:

1. `code-graph:graph-store`
2. `code-graph:traversal`
3. `code-graph:hotspots`

In addition, direct dependencies and cross-cutting specifications were analyzed:

- `code-graph:symbol-model`
- `code-graph:staleness-detection`
- `code-graph:document-model`
- `code-graph:resolve-symbol-reference`

### Key Findings Summary

- **Overall Implementation:** The core mechanisms for file semantic categorization (`source`, `test`, `ignored`), SQLite schema persistence, physical push-down filtering during BFS frontier queries, category isolation in risk calculations, anchored target downstream reachability, and omitted file accounting are implemented and functional. All 63 test suites (836 tests) in `@specd/code-graph` pass.
- **Critical Discrepancy Found (Spec vs Code):**
  - **`DEFAULT_HOTSPOT_KINDS` in `code-graph:hotspots`:** The merged spec explicitly defines `kinds = ['class', 'method', 'function', 'interface']` for the default hotspot view, and the verification scenario specifically asserts that `interface` symbols are eligible. However, `DEFAULT_HOTSPOT_KINDS` in `hotspot-result.ts` and unit tests in `compute-hotspots.spec.ts` only include `['class', 'method', 'function']`. `interface` is omitted in the code.
- **Specification Drift / Inconsistency Found (Cross-Spec):**
  - **`FileNode` in `code-graph:symbol-model` vs `code-graph:graph-store`:** `code-graph:symbol-model` defines the domain model for `FileNode` (properties: `path`, `configRelativePath`, `language`, `contentHash`, `workspace`, `embedding`). The delta for `code-graph:graph-store` adds `category` to the minimum persisted file node semantics, and `file-node.ts` implements `category: FileCategory`. However, `code-graph:symbol-model` was not updated in this change to declare `category` as a property of `FileNode`.
  - **Graph Fingerprint Derivation in `code-graph:staleness-detection`:** The derivation fingerprint computed in `compute-graph-fingerprint.ts` does not incorporate `testPaths` and `ignorePaths`. As a result, changes to test or ignore patterns in `specd.yaml` do not trigger a derivation fingerprint mismatch, even though they alter file categorization.
- **Test Coverage Gaps:**
  - **Direct SQLite Physical Frontier Category Filtering:** In `code-graph:graph-store`, the scenario _"Category filter excludes non-admitted categories in physical query"_ requires verifying that an SQLite store excludes test callers directly in SQL statements and returns only admitted callers. While `traversal.spec.ts` tests this against `InMemoryGraphStore`, there is no direct unit test in `sqlite-graph-store.spec.ts` asserting that `SQLiteGraphStore.queryImpactFrontier` physically suppresses test callers and returns SQL-populated `omittedFiles`.

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

- **Database Schema:** `schema.ts` defines `category TEXT NOT NULL DEFAULT 'source'` on table `files`, and creates index `idx_files_category ON files(category)`. Schema version is 13.
- **Entity Creation & Mapping:** `file-node.ts` defaults `category` to `'source'`. `sqlite-graph-database.ts` maps `row.category ?? 'source'`.
- **Symbol Query Filtering:** `sqlite-graph-database.ts` adds `file_path IN (SELECT path FROM files WHERE category IN (?))` when `query.categories` is provided.
- **Impact Frontier Push-Down Query:** `sqlite-graph-database.ts` joins `files f` and injects `category IN (...)` directly into SQL conditions. Non-admitted category candidates are captured via a dedicated SQL `SELECT DISTINCT ... category IN (nonAdmitted)` query, ensuring no non-admitted relations cross the boundary into TypeScript.
- **Worker Protocol:** `sqlite-worker-protocol.ts` preserves the entire filter payload across the worker boundary.

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
   - _Evidence:_ Verified in `sqlite-graph-store.spec.ts` (`persists and hydrates file categories for test, ignored, and source files`) and `file-node.spec.ts`.
   - _Status:_ **PASS**
2. **Scenario: findSymbols filters by category**
   - _Requirement:_ Given symbols in `'source'`, `'test'`, `'ignored'`, `findSymbols({ categories: ['source'] })` returns only source symbols.
   - _Evidence:_ Verified in `graph-store.contract.ts`.
   - _Status:_ **PASS**
3. **Scenario: Category filter excludes non-admitted categories in physical query**
   - _Requirement:_ SQLite store with callers in `'source'` and `'test'` files excludes `'test'` callers directly in SQL and returns only `'source'` callers across boundary.
   - _Evidence:_ Tested at traversal service layer with `InMemoryGraphStore` in `traversal.spec.ts`. SQLite implementation in `sqlite-graph-database.ts` enforces this in SQL. However, a dedicated contract unit test in `sqlite-graph-store.spec.ts` executing `queryImpactFrontier` with mixed file categories is absent.
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

- **Domain Model:** `impact-result.ts` defines `OmittedCounts`, `CategoryFilterOptions`, `resolveAdmittedCategories`, and updates `ImpactResult` with `omittedCounts` and optional `omittedFiles`.
- **Service Orchestration:** `analyze-impact.ts` defaults `filter.categories` to `resolveAdmittedCategories(filter)` (`['source']`).
- **Omission Tracking:** Omitted files reported from `queryImpactFrontier` are collected into `omittedTestFiles` and `omittedIgnoredFiles` sets (`analyze-impact.ts`).
- **BFS Pruning:** Because the physical store query does not admit non-admitted files or their symbols, adjacent endpoints in non-admitted categories are omitted from `nextSymbols` and `nextFiles`, halting BFS traversal before traversing their transitive relations.
- **Anchored Target Downstream Traversal:** In `analyze-file-impact.ts`, when target is `test/my.spec.ts` and direction is `'downstream'`, root symbols are loaded via `findSymbols({ filePath })`. Outgoing relations (`CALLS`, `IMPORTS`) target production code (`src/index.ts`). Since `'source'` is an admitted category, `queryImpactFrontier` admits those target nodes and returns them.

### Verification Scenarios Audit

1. **Scenario: Test callers do not inflate risk level or dependents**
   - _Requirement:_ Production symbol called by 1 production module and 20 test files returns `directDependents: 1`, `riskLevel: 'LOW'`, `omittedCounts.tests: 20`.
   - _Evidence:_ Fully verified in `traversal.spec.ts`.
   - _Status:_ **PASS**
2. **Scenario: Category filter prunes BFS traversal through test files**
   - _Requirement:_ Module A called by Test T, Test T called by Module B. Traversal from A halts at T; B is NOT reached.
   - _Evidence:_ Fully verified in `traversal.spec.ts`.
   - _Status:_ **PASS**
3. **Scenario: Anchored test target traverses dependencies**
   - _Requirement:_ Target is `test/my.spec.ts`. Downstream impact returns downstream dependencies in `affectedFiles`.
   - _Evidence:_ Fully verified in `traversal.spec.ts`.
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

- **Service Logic:** `compute-hotspots.ts` implements category isolation across caller rows, importers, hierarchy dependents, candidate symbols, and omitted counts.

### Discrepancy (Spec vs Code): `DEFAULT_HOTSPOT_KINDS`

- **Spec Requirement:**
  From `specs/code-graph/hotspots/spec.md`:
  > **Smart defaults with automatic removal**  
  > `- kinds = ['class', 'method', 'function', 'interface'] — the default hotspot view focuses on callable or structural symbols`  
  > **Scenario: Default kind set focuses the hotspot view**  
  > `THEN only class, method, function, and interface symbols are eligible for the default hotspot view`
- **Code Reality:**
  In `hotspot-result.ts`:
  ```typescript
  export const DEFAULT_HOTSPOT_KINDS: readonly SymbolKind[] = [
    SymbolKindEnum.Class,
    SymbolKindEnum.Method,
    SymbolKindEnum.Function,
  ] as const
  ```
  In `compute-hotspots.spec.ts`:
  ```typescript
  expect(DEFAULT_HOTSPOT_KINDS).toEqual(['class', 'method', 'function'])
  ```
- **Analysis:**
  `SymbolKind.Interface` is absent from `DEFAULT_HOTSPOT_KINDS` in the implementation and test assertion. In TypeScript codebases, interfaces are prominent structural contracts; the spec explicitly mandated their inclusion in the default hotspot view alongside `class`, `method`, and `function`.

### Verification Scenarios Audit

1. **Scenario: Callers in test files do not count toward hotspot scores by default**
   - _Requirement:_ Symbol called only by test files does not receive caller points by default; symbol called by production code reflects callers.
   - _Evidence:_ Verified in `compute-hotspots.spec.ts`.
   - _Status:_ **PASS**
2. **Scenario: Include tests in hotspot computation**
   - _Requirement:_ `computeHotspots({ includeTests: true })` counts test callers in directCallers and score.
   - _Evidence:_ Verified in `compute-hotspots.spec.ts`.
   - _Status:_ **PASS**
3. **Scenario: Omitted test and ignored files tracked in output**
   - _Requirement:_ `omittedCounts` in `HotspotResult` contains counts of excluded test and ignored files.
   - _Evidence:_ Verified in `compute-hotspots.spec.ts`.
   - _Status:_ **PASS**
4. **Scenario: Default kind set focuses the hotspot view**
   - _Requirement:_ Default kinds include `interface`.
   - _Evidence:_ FAILS due to `DEFAULT_HOTSPOT_KINDS` lacking `interface`.
   - _Status:_ **FAIL (Discrepancy)**

---

## Direct Dependencies & Cross-Cutting Architecture Audit

### 1. Classification Engine (`classify-file-category.ts`)

- Precedence order: `ignorePatterns` -> `'ignored'`, `testPatterns` -> `'test'`, Default -> `'source'`.
- Uses `ignore` npm package. Strips workspace prefixes and handles Windows/POSIX paths. Verified in `classify-file-category.spec.ts` (5 tests passing).

### 2. Search Code Graph Integration (`search-code-graph.ts`)

- Integrates `fileCategories`, `includeTests`, and `includeIgnored`. Emits `omittedCounts: { tests: number, ignored: number }`. Verified in `search-code-graph.spec.ts`.

### 3. Spec Dependency: `code-graph:symbol-model`

- **Issue:** Spec Drift. `code-graph:symbol-model` defines `FileNode`, but was not updated to declare `category: FileCategory`.

### 4. Spec Dependency: `code-graph:staleness-detection`

- **Issue:** Fingerprint Coverage Gap. `testPaths` and `ignorePaths` are not serialized in `computeGraphFingerprint`. Updating patterns in `specd.yaml` does not trigger staleness detection.

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

<!-- END VERBATIM PARTIAL CODE GRAPH -->

---

### Batch 3: CLI Specs (`cli:graph-impact`, `cli:graph-hotspots`, `cli:graph-search`)

_Verbatim subagent audit findings:_

<!-- BEGIN VERBATIM PARTIAL CLI -->

# Spec Compliance Audit — CLI Batch (Change `code-graph-file-categories`)

**Audit Scope:**

- `cli:graph-impact`
- `cli:graph-hotspots`
- `cli:graph-search`

**Direct Spec Dependencies:**

- `cli:entrypoint`
- `cli:graph-cli-context`
- `code-graph:composition`

**Implementation Files Audited:**

- `packages/cli/src/commands/graph/format-omission-notice.ts`
- `packages/cli/src/commands/graph/impact.ts`
- `packages/cli/src/commands/graph/hotspots.ts`
- `packages/cli/src/commands/graph/search.ts`

**Test Files Audited:**

- `packages/cli/test/commands/graph-impact.spec.ts`
- `packages/cli/test/commands/graph-hotspots.spec.ts`
- `packages/cli/test/commands/graph-search.spec.ts`

---

## Executive Summary

The CLI implementation for change `code-graph-file-categories` introduces file category filtering (`source`, `test`, `ignored`), omission notices in human-readable text output, and structured `omittedCounts` across `graph impact`, `graph hotspots`, and `graph search`.

All core behavioral requirements of the change deltas are implemented cleanly and conform to the architectural contracts:

- Category admission flags (`--include-tests`, `--include-ignored`, `--all`, `--category <source|test|ignored>`, and `--tests` alias) are properly parsed, validated with exit code 1 on invalid values, and passed through to the provider layer without post-filtering in the CLI.
- Shared formatting helper `formatOmissionNotice` accurately handles notice rendering in text mode across all command target variants.
- Structured output formats (`json`, `toon`) include `omittedCounts: { tests: number, ignored: number }` across all leaf command results.
- Provider delegation follows `cli:graph-cli-context` and `code-graph:composition` without performing CLI-side graph re-computation.

A minor documentation discrepancy was identified across all three commands: the `addHelpText('after', ...)` JSON/TOON output schema blocks have not been updated to document `omittedCounts` (and for `impact`, the top-level aggregate deps count fields), which conflicts with `cli:entrypoint`'s help schema requirement.

---

## 1. cli:graph-impact

### Requirements Summary

| #   | Requirement                                                                                                                                                                                                                            | Delta Status | Priority |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>` alongside existing selectors and flags                                                                                 | Modified     | MUST     |
| R2  | Target family exclusivity: exactly one target family (`--file`, `--symbol`, `--spec`, or `--export` + `--from`)                                                                                                                        | Existing     | MUST     |
| R3  | `--category` validates argument is one of `source`, `test`, `ignored`; fails with exit code 1 before provider access                                                                                                                   | Modified     | MUST     |
| R4  | Category options normalized into typed provider impact filter (`ImpactResultFilter`) without CLI post-filtering                                                                                                                        | Modified     | MUST     |
| R5  | Filter passed through to provider for all 5 target families (single file, multi-file, symbol, spec, public export)                                                                                                                     | Modified     | MUST     |
| R6  | Pure display-path projection derived from configuration alone without graph reads                                                                                                                                                      | Existing     | MUST     |
| R7  | Text output displays omission notice when `omittedCounts` indicates `tests > 0` or `ignored > 0`: `ℹ Excluded from results: <count> test files, <count> ignored files. Use --include-tests, --include-ignored, or --all to view them.` | Modified     | MUST     |
| R8  | Single-category omission notice MAY mention only that category                                                                                                                                                                         | Modified     | MAY      |
| R9  | JSON/TOON mode includes `omittedCounts: { tests: number, ignored: number }`                                                                                                                                                            | Modified     | MUST     |
| R10 | JSON mode includes aggregate impact fields: `riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`                                                                          | Modified     | MUST     |
| R11 | Provider lifecycle managed via `withProvider` with availability checked once per run                                                                                                                                                   | Existing     | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                        |
| --- | -------------- | --------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/commands/graph/impact.ts` L362–365            |
| R2  | ✅ Implemented | L426–437: checks `selectorCount === 1` and exits with code 1    |
| R3  | ✅ Implemented | L97–103: throws `cliError` before provider open                 |
| R4  | ✅ Implemented | L132–150: `normalizeImpactResultFilter` populates typed filter  |
| R5  | ✅ Implemented | L466, L655, L720, L888, L956: passed to all provider methods    |
| R6  | ✅ Implemented | L648, L825, L957: `toGraphDisplayPath` without graph reads      |
| R7  | ✅ Implemented | Calls `formatOmissionNotice` across all 5 handler paths         |
| R8  | ✅ Implemented | `format-omission-notice.ts` pushes only non-zero categories     |
| R9  | ✅ Implemented | Included in all output branches                                 |
| R10 | ✅ Implemented | Single-file, multi-file, symbol, and spec include aggregates    |
| R11 | ✅ Implemented | L453–457: `withProvider` wraps execution; `warnGraphStale` once |

### Verification Scenarios Audit

All 14 base and delta verification scenarios pass in `packages/cli/test/commands/graph-impact.spec.ts`.

---

## 2. cli:graph-hotspots

### Requirements Summary

| #   | Requirement                                                                                                                                               | Delta Status | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>`                                           | Modified     | MUST     |
| R2  | Default hotspot policy: `categories = source`, `kinds = class,method,function`, importer-only excluded, `minScore > 0`, `minRisk >= MEDIUM`, `limit = 20` | Modified     | MUST     |
| R3  | Explicit category options adjust only the admitted categories without altering other defaults                                                             | Modified     | MUST     |
| R4  | `--category` validates argument is one of `source`, `test`, `ignored`; fails with code 1 before provider access                                           | Modified     | MUST     |
| R5  | Passes all category options to `provider.getHotspots(...)`                                                                                                | Modified     | MUST     |
| R6  | Text mode prints omission notice when `omittedCounts` has `tests > 0` or `ignored > 0`                                                                    | Modified     | MUST     |
| R7  | JSON/TOON mode includes `omittedCounts: { tests: number, ignored: number }` in root output object                                                         | Modified     | MUST     |
| R8  | JSON/TOON mode includes `totalSymbols`, `entries`, and per-entry `workspace` field                                                                        | Existing     | MUST     |

### Implementation Status

All requirements are implemented in `packages/cli/src/commands/graph/hotspots.ts`. All 11 verification scenarios pass in `packages/cli/test/commands/graph-hotspots.spec.ts`.

---

## 3. cli:graph-search

### Requirements Summary

| #   | Requirement                                                                                                                 | Delta Status | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--tests`, `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>`  | Modified     | MUST     |
| R2  | `--tests` acts as a convenience alias for `--category test`                                                                 | Modified     | MUST     |
| R3  | `--category` validates that argument is one of `source`, `test`, `ignored`; fails with exit code 1 before provider open     | Modified     | MUST     |
| R4  | Category options passed to Code Graph search in `SearchCodeGraphInput` (`fileCategories`, `includeTests`, `includeIgnored`) | Modified     | MUST     |
| R5  | CLI sends one unified search request without pre-limiting, post-filtering, or reconstructing results                        | Existing     | MUST     |
| R6  | Text output displays omission notice when `omittedCounts` indicates `tests > 0` or `ignored > 0`                            | Modified     | MUST     |
| R7  | JSON/TOON output includes `omittedCounts: { tests: number, ignored: number }` in root object                                | Modified     | MUST     |
| R8  | Deterministic category output order (`symbols`, `files`, `specs`, `documents`) preserved in all formats                     | Existing     | MUST     |

### Implementation Status

All requirements are implemented in `packages/cli/src/commands/graph/search.ts`. All 13 verification scenarios pass in `packages/cli/test/commands/graph-search.spec.ts`.

---

## 4. Metrics & Summary

| Spec                 | Total Requirements Audited | Implemented | Discrepancies                   | Scenarios with Tests | Missing Test Scenarios |
| -------------------- | -------------------------- | ----------- | ------------------------------- | -------------------- | ---------------------- |
| `cli:graph-impact`   | 11                         | 11          | 1 (help schema drift)           | 14 / 14              | 0                      |
| `cli:graph-hotspots` | 8                          | 8           | 1 (help schema drift)           | 11 / 11              | 0                      |
| `cli:graph-search`   | 8                          | 8           | 1 (help schema drift)           | 13 / 13              | 0                      |
| **Total**            | **27**                     | **27**      | **3 (all documentation drift)** | **38 / 38**          | **0**                  |

### Compliance Verdict

**CONFORMANT with minor documentation drift.**

<!-- END VERBATIM PARTIAL CLI -->
