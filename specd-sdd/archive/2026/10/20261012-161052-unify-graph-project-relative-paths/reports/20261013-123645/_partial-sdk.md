# Spec Compliance Audit: SDK Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T12:45:00Z  
**Batch Scope:** `sdk:run-graph-search`, `sdk:run-graph-hotspots`, `sdk:run-graph-impact`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-123645/_partial-sdk.md`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the second-iteration state of the `@specd/sdk` orchestration layer under change `unify-graph-project-relative-paths`. The audited modules are `runGraphSearch`, `runGraphHotspots`, and `runGraphImpact`.

Compared to the previous audit baseline (`reports/20261013-110331/_partial-sdk.md`), significant architectural and implementation remediation has occurred:

1. **Public Export Route Impact Analysis (`sdk:run-graph-impact`) is now fully implemented**:
   - `export` and `from`/`surface` are first-class inputs in `RunGraphImpactInput`.
   - `runGraphImpact` resolves public surfaces and bindings via `provider.resolveSymbolReference` and `provider.getExactPublicBinding`, analyzes impact via `provider.analyzePublicBindingImpact`, and maps all targets and affected paths to `projectRelativeSurface` and `projectRelativePath`.
   - `@specd/cli`'s `impact.ts` has been refactored to delegate directly to `runGraphImpact`, eliminating duplicated provider queries and presenter drift.
2. **Input Aliases and Options Aligned**:
   - `filePattern`, `exactFile`, and `includeSnippet` have been added to `RunGraphSearchInput` and forwarded to `provider.search(...)`.
   - `filePath` alias has been added to `RunGraphHotspotsInput` alongside `file` and forwarded to `provider.getHotspots(...)`.
3. **Defensive Path Projection Added**:
   - In `runGraphHotspots`, a fallback to `toProjectRelativePath(config, e.symbol.filePath)` has been introduced in case `e.symbol.projectRelativePath` is unpopulated.
   - In `runGraphSearch`, symbol hits fall back to `toProjectRelativePath(config, h.symbol.filePath)`.
4. **Substantial Test Suite Expansion**:
   - 18 unit tests now cover the three orchestrator suites (plus 10 tests for `project-relative-path.ts`), asserting provider lifecycles, options forwarding, parameter aliases, spec impact, and public export route impact.

### Remaining Issues & Discrepancies

- **Defect in `runGraphSearch` snippet projection when using `includeSnippet` alias**:
  In `packages/sdk/src/orchestration/run-graph-search.ts`, `includeSnippet = input.includeSnippet ?? input.snippet ?? false` correctly resolves the alias for the provider call. However, the subsequent output mapping across symbols (line 309), file matches (line 325), specs (line 339), and documents (line 349) checks `input.snippet && ...` instead of `includeSnippet && ...`. Consequently, invoking `runGraphSearch(ctx, { query: '...', includeSnippet: true })` causes the provider to compute snippets but causes the SDK to omit snippets from the returned results.
- **Missing Error and Outcome Tests in `runGraphImpact`**:
  While happy paths for single-file, multi-file, symbol, spec, and public export impact are well tested, non-throwing outcome branches (symbol `not_found`, symbol `ambiguous`, export `not_found`, export `ambiguous`) and error validations (empty file selector, file not found, mismatched `export` and `from`) lack dedicated unit test assertions in `run-graph-impact.spec.ts`.

---

## 2. Summary Counts

| Metric                                    | Count  | Details                                                                  |
| :---------------------------------------- | :----: | :----------------------------------------------------------------------- |
| **Specs Audited**                         | **3**  | `sdk:run-graph-search`, `sdk:run-graph-hotspots`, `sdk:run-graph-impact` |
| **Requirements Checked**                  | **12** | 4 per spec (covering 22 distinct sub-mandates)                           |
| **Requirements Fully Satisfied**          | **11** | 1 partial (`runGraphSearch` snippet alias output projection)             |
| **Requirements Failed**                   | **0**  | 0 outright failures                                                      |
| **Verification Scenarios Checked**        | **29** | 10 in search, 8 in hotspots, 11 in impact                                |
| **Verification Scenarios Passed**         | **28** | Verified against implementation and test suites                          |
| **Verification Scenarios Failed**         | **1**  | Search alias scenario (`snippet/includeSnippet` output omission)         |
| **Automated Unit Tests in Scope**         | **28** | All 28 tests passing cleanly with 0 failures                             |
| **Identified Missing / Incomplete Tests** | **7**  | Error branches and parameter alias variants                              |

---

## 3. Detailed Per-Spec Analysis

### 3.1. `sdk:run-graph-search`

- **Spec Path:** `specs/sdk/run-graph-search/spec.md`
- **Verify Path:** `specs/sdk/run-graph-search/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-search.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-search.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-search.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-search.spec.ts)

#### Requirements Summary & Implementation Status

1. **`runGraphSearch` orchestration:**
   - **Parameter coverage (100%):** `query`, `categories` (defaults to all 4), `kinds`, `file`/`filePattern`, `exactFile`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit` (defaults to 20), `snippet`/`includeSnippet`, `specContent`, `provider`.
     - _Status:_ **IMPLEMENTED**. All properties declared on `RunGraphSearchInput`.
   - **Provider lifecycle:** Transient provider opened via `withOpenGraphProvider` when omitted; caller-provided provider executed directly without closing.
     - _Status:_ **IMPLEMENTED**.
   - **Forwarding to `provider.search(...)`:** All search parameters forwarded.
     - _Status:_ **IMPLEMENTED**.
   - **Path projection:** Projects declarations, symbol hits, logical targets, public bindings, files, and documents to `projectRelativePath` via `toProjectRelativePath(config, ...)`. Retains spec fields (`specId`, `path`, `title`, `description`).
     - _Status:_ **IMPLEMENTED**.
   - **Return structured result:** Grouped by `symbols`, `files`, `specs`, `documents`, and `omittedCounts`.
     - _Status:_ **IMPLEMENTED**.
2. **Elimination of legacy path properties:** Result does not expose `configRelativePath` or `displayPath`.
   - _Status:_ **IMPLEMENTED**. Interfaces and projection objects omit them.
3. **Pure path projection:** Projection uses configuration alone without graph store reads.
   - _Status:_ **IMPLEMENTED**. Pure synchronous projection via `toProjectRelativePath`.
4. **No presenter formatting:** Pure structured data returned with no ANSI codes or tables.
   - _Status:_ **IMPLEMENTED**.

#### Verification Scenarios Matrix

| Scenario from `verify.md`                                                       | Code Status | Test Coverage |    Verdict    | Notes                                                                                                                                                                                                     |
| :------------------------------------------------------------------------------ | :---------: | :-----------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Full graph search with transient provider`                                     |  Satisfied  |     High      |   ✅ PASSED   | Tested in `run-graph-search.spec.ts:162`. Verifies `open` and `close` invocations.                                                                                                                        |
| `Graph search with caller-owned open provider`                                  |  Satisfied  |     High      |   ✅ PASSED   | Tested in `run-graph-search.spec.ts:187`. Verifies `close` was not called.                                                                                                                                |
| `Symbols expose projectRelativePath on declarations, hits, and logical targets` |  Satisfied  |     High      |   ✅ PASSED   | Tested in `run-graph-search.spec.ts:114`. Asserts targets, declarations, bindings, and hits.                                                                                                              |
| `Files and documents expose projectRelativePath`                                |  Satisfied  |     High      |   ✅ PASSED   | Tested in `run-graph-search.spec.ts:114`. Asserts files and documents.                                                                                                                                    |
| `All search options forwarded to provider`                                      |  Satisfied  |     High      |   ✅ PASSED   | Tested in `run-graph-search.spec.ts:211`. Asserts forwarding of all 11 filter options.                                                                                                                    |
| `Aliases file/filePattern and snippet/includeSnippet behave identically`        | **Defect**  |    Partial    | ❌ **FAILED** | Provider call forwarding works (test line 263), but output projection uses `input.snippet && ...` instead of `includeSnippet && ...`. Passing `includeSnippet: true` drops snippet from returned results. |
| `configRelativePath is not present`                                             |  Satisfied  |     High      |   ✅ PASSED   | Explicitly asserted: `expect(result.files[0].configRelativePath).toBeUndefined()`.                                                                                                                        |
| `displayPath is not present`                                                    |  Satisfied  |   Implicit    |   ✅ PASSED   | Excluded from type definitions and projection objects.                                                                                                                                                    |
| `Path projection does not invoke provider or store reads`                       |  Satisfied  |     High      |   ✅ PASSED   | Pure config mock used; zero provider store methods called during projection.                                                                                                                              |
| `Pure structured data returned`                                                 |  Satisfied  |     High      |   ✅ PASSED   | Returns pure TypeScript objects.                                                                                                                                                                          |

#### Discrepancies & Findings

- **Snippet Projection Bug on `includeSnippet` alias:**
  - _Location:_ `packages/sdk/src/orchestration/run-graph-search.ts:309, 325, 339, 349`.
  - _Code snippet:_
    ```ts
    // Line 208:
    const includeSnippet = input.includeSnippet ?? input.snippet ?? false
    ...
    // Line 309:
    ...(input.snippet && h.snippet !== undefined ? { snippet: h.snippet } : {})
    ```
  - _Impact:_ When a caller specifies `{ includeSnippet: true }`, `provider.search` correctly computes and returns snippets, but `runGraphSearch` strips them because `input.snippet` is `undefined`.
  - _Remediation:_ Change all four occurrences (`lines 309, 325, 339, 349`) to use `includeSnippet` instead of `input.snippet`.

#### Missing Tests

1. Test asserting that passing `{ includeSnippet: true }` retains `snippet` in the output items (symbols, files, specs, documents).
2. Test verifying `specContent: true` maps `content` onto `result.specs[0]`.
3. Explicit assertion `expect((symGroup.hits[0]!.symbol as any).displayPath).toBeUndefined()`.

---

### 3.2. `sdk:run-graph-hotspots`

- **Spec Path:** `specs/sdk/run-graph-hotspots/spec.md`
- **Verify Path:** `specs/sdk/run-graph-hotspots/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-hotspots.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-hotspots.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-hotspots.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-hotspots.spec.ts)

#### Requirements Summary & Implementation Status

1. **`runGraphHotspots` orchestration:**
   - **Parameter coverage (100%):** `workspace`, `kinds`, `file`/`filePath`, `excludePaths`, `excludeWorkspaces`, `limit` (defaults to 20), `minScore` (defaults to 1), `minRisk`, `includeImporterOnly`, `categories`, `includeTests`, `includeIgnored`, `provider`.
     - _Status:_ **IMPLEMENTED**. All options declared on `RunGraphHotspotsInput` and forwarded to `provider.getHotspots(options)`.
   - **Provider lifecycle:** Transient provider opened via `withOpenGraphProvider` when omitted; caller provider executed without closing.
     - _Status:_ **IMPLEMENTED**.
   - **Forwarding:** All options forwarded to `provider.getHotspots(...)`.
     - _Status:_ **IMPLEMENTED**.
   - **Path projection:** Calls `ctx.kernel.project.getConfig.execute()` and maps `projectRelativePath: e.symbol.projectRelativePath || toProjectRelativePath(config, e.symbol.filePath)`. Derives owning `workspace`.
     - _Status:_ **IMPLEMENTED**.
   - **Output structure:** Returns `totalSymbols`, `entries` (with `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, `riskLevel`), and `omittedCounts`.
     - _Status:_ **IMPLEMENTED**.
2. **Elimination of displayPath:** Entries expose `projectRelativePath` and do not expose `displayPath`.
   - _Status:_ **IMPLEMENTED**.
3. **Pure path projection:** Uses configuration alone without extra provider lookups.
   - _Status:_ **IMPLEMENTED**.
4. **No presenter formatting:** Pure structured data returned.
   - _Status:_ **IMPLEMENTED**.

#### Verification Scenarios Matrix

| Scenario from `verify.md`                           | Code Status | Test Coverage |  Verdict  | Notes                                                                              |
| :-------------------------------------------------- | :---------: | :-----------: | :-------: | :--------------------------------------------------------------------------------- |
| `Hotspots ranked with transient provider`           |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-hotspots.spec.ts:70`.                                         |
| `Hotspots with caller-owned open provider`          |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-hotspots.spec.ts:95`.                                         |
| `Entries include projectRelativePath and workspace` |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-hotspots.spec.ts:39`.                                         |
| `All hotspot options forwarded to provider`         |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-hotspots.spec.ts:119`.                                        |
| `Aliases file and filePath behave identically`      |  Satisfied  |    Partial    | ✅ PASSED | Code resolves `input.filePath ?? input.file`. Test line 119 exercises `filePath`.  |
| `displayPath is omitted from hotspot entries`       |  Satisfied  |     High      | ✅ PASSED | Explicitly asserted: `expect((entry as any).displayPath).toBeUndefined()`.         |
| `Hotspot projection uses configuration alone`       |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-hotspots.spec.ts:169` (exercises fallback config projection). |
| `Pure structured data returned`                     |  Satisfied  |     High      | ✅ PASSED | Output asserted as pure data structure.                                            |

#### Discrepancies & Findings

- **None.** Code and spec are in 100% alignment.

#### Missing Tests

1. Test calling `runGraphHotspots` with `file: 'src/kernel.ts'` (instead of `filePath`) to verify identical forwarding to `provider.getHotspots({ filePath: 'src/kernel.ts' })`.

---

### 3.3. `sdk:run-graph-impact`

- **Spec Path:** `specs/sdk/run-graph-impact/spec.md`
- **Verify Path:** `specs/sdk/run-graph-impact/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-impact.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-impact.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-impact.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-impact.spec.ts)

#### Requirements Summary & Implementation Status

1. **`runGraphImpact` orchestration:**
   - **Target selectors (all 4 types):**
     - Single-file and multi-file selectors (`files: string[]`) -> **IMPLEMENTED**.
     - Symbol selector (`symbol: string`) -> **IMPLEMENTED**.
     - Spec identifier (`spec: string`) -> **IMPLEMENTED**.
     - Public export route (`export: string`, `from: string` / `surface: string`) -> **IMPLEMENTED**.
   - **Traversal options:** Direction (`upstream`, `downstream`, `both`, `dependents`, `dependencies`) normalized via `normalizeDirection`; depth defaults to 3.
     - _Status:_ **IMPLEMENTED**.
   - **Filter constraints:** `filter: ImpactResultFilter` forwarded to provider methods.
     - _Status:_ **IMPLEMENTED**.
   - **Provider lifecycle:** Transient provider opened and closed when omitted; caller provider executed without closing.
     - _Status:_ **IMPLEMENTED**.
   - **Selector execution:**
     - Files: `provider.resolveFileSelector` + `analyzeFileImpact` / `analyzeFilesImpact`.
     - Symbol: `provider.resolveSymbolSelector` + `analyzeImpact`.
     - Spec: `provider.getSpec` + `analyzeSpecImpact`.
     - Public export: `provider.resolveSymbolReference` + `provider.getExactPublicBinding` + `provider.analyzePublicBindingImpact`.
     - _Status:_ **IMPLEMENTED**.
   - **Path projection:** Maps all targets and affected files/symbols to `projectRelativePath` (and `projectRelativeSurface` for exports) using `toProjectRelativePath(config, ...)`.
     - _Status:_ **IMPLEMENTED**.
   - **Aggregate metrics:** Surfaced across all result kinds (`riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`).
     - _Status:_ **IMPLEMENTED**.
2. **Elimination of displayPath and displayTargets:** Results expose `projectRelativePath` and `projectRelativeTargets`; omit `displayPath` and `displayTargets`.
   - _Status:_ **IMPLEMENTED**.
3. **Pure path projection:** Derives paths exclusively from configuration without store queries.
   - _Status:_ **IMPLEMENTED**.
4. **No presenter formatting:** Pure structured data returned.
   - _Status:_ **IMPLEMENTED**.

#### Verification Scenarios Matrix

| Scenario from `verify.md`                          | Code Status | Test Coverage |  Verdict  | Notes                                                                                                      |
| :------------------------------------------------- | :---------: | :-----------: | :-------: | :--------------------------------------------------------------------------------------------------------- |
| `File impact with transient provider`              |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:205` and `16`.                                                         |
| `Multi-file impact exposes projectRelativeTargets` |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:77`. Asserts `targets` and `projectRelativeTargets`.                   |
| `Symbol impact analysis`                           |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:151`.                                                                  |
| `Spec impact analysis`                             |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:290`. Asserts projected affected files/symbols.                        |
| `Public export route impact analysis`              |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:344`. Asserts `projectRelativeSurface`, binding, and canonical impact. |
| `Provider filter forwarding across targets`        |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:452`.                                                                  |
| `Traversal direction and depth forwarding`         |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:452` (checks `dependencies` -> `downstream`, depth = 5).               |
| `Impact analysis with caller-owned open provider`  |  Satisfied  |     High      | ✅ PASSED | Tested in `run-graph-impact.spec.ts:248`.                                                                  |
| `displayPath and displayTargets are omitted`       |  Satisfied  |     High      | ✅ PASSED | Explicitly asserted across single-file (line 67), multi-file (line 145), and symbol (line 200).            |
| `Impact projection uses configuration alone`       |  Satisfied  |     High      | ✅ PASSED | Mock config used throughout.                                                                               |
| `Pure structured data returned`                    |  Satisfied  |     High      | ✅ PASSED | Return shape verified across all kinds.                                                                    |

#### Discrepancies & Findings

- **None.** The previous critical omission of public export impact has been completely resolved.

#### Missing Tests

1. Test verifying symbol `not_found` outcome when symbol is missing (`{ kind: 'symbol', status: 'not_found' }`).
2. Test verifying symbol `ambiguous` outcome when multiple candidates exist (`{ kind: 'symbol', status: 'ambiguous', candidates }`).
3. Test verifying error throwing on missing spec (`GraphSpecNotFoundError`).
4. Test verifying error throwing on invalid selector combination (e.g., `export` without `from`, or empty selectors).
5. Test verifying unresolved public export outcomes (`status: 'not_found'`, `status: 'ambiguous'`).

---

## 4. Cross-Spec & Global Specs Consistency

### 4.1. Global Error Handling Conventions (`default:_global/error-handling-conventions`)

- **Base Class:** `GraphSelectorError` extends `SpecdError` from `@specd/core`.
- **Discriminator:** Inherits `readonly specd = true` from `SpecdError`.
- **Machine-Readable Code:** Defines `override get code(): string { return 'INVALID_GRAPH_SELECTOR' }` in valid `UPPER_SNAKE_CASE`.
- **Actionable Messages:** Provides descriptive messages:
  - `"empty file selector"`
  - `"no indexed file matches \"<trimmed>\""`
  - `"ambiguous selector \"<trimmed>\": matches <count> files across workspaces"`
  - `"export and from (or surface) must be specified together for public export impact analysis."`
  - `"ambiguous public surface \"<surface>\": <matches>"`
  - `"Either files, symbol, spec, or export with from must be specified for impact analysis."`
- **JSDoc Documentation:** `GraphSelectorError` includes complete JSDoc annotations.
- **Spec Not Found:** Throws `GraphSpecNotFoundError` (re-exported from `@specd/code-graph`), which also extends `SpecdError`.

### 4.2. Global Architecture & Monorepo Conventions (`default:_global/architecture`, `default:_global/conventions`)

- **Package Layering:**
  ```
  @specd/cli ──► @specd/sdk ──► @specd/code-graph ──► @specd/core
  ```
  No circular dependencies exist.
- **Host Agnosticism:**
  All three orchestrators return structured TypeScript data models. No terminal layout, ANSI color escapes, table borders, or interactive prompts exist within `@specd/sdk`.
- **CLI Presentation Boundary:**
  `@specd/cli`'s `search.ts`, `hotspots.ts`, and `impact.ts` cleanly delegate business execution to `runGraphSearch`, `runGraphHotspots`, and `runGraphImpact`, restricting CLI responsibility to argument parsing, terminal tables, TOON/JSON serialization, and exit codes.

---

## 5. Actionable Recommendations

1. **Fix Snippet Output Projection in `runGraphSearch` (High Priority):**
   In `packages/sdk/src/orchestration/run-graph-search.ts`, replace `input.snippet` with `includeSnippet` in lines 309, 325, 339, and 349:

   ```diff
   - ...(input.snippet && h.snippet !== undefined ? { snippet: h.snippet } : {}),
   + ...(includeSnippet && h.snippet !== undefined ? { snippet: h.snippet } : {}),
   ```

   Add a test in `run-graph-search.spec.ts` asserting that `includeSnippet: true` populates snippet fields on symbol hits, source files, specs, and documents.

2. **Add Coverage for Negative & Polymorphic Branches in `runGraphImpact` (Medium Priority):**
   In `packages/sdk/test/orchestration/run-graph-impact.spec.ts`, add test cases for:
   - Missing symbol returning `{ kind: 'symbol', status: 'not_found' }`.
   - Ambiguous symbol returning `{ kind: 'symbol', status: 'ambiguous', candidates: [...] }`.
   - Missing spec throwing `GraphSpecNotFoundError`.
   - Selector errors throwing `GraphSelectorError` (empty file, invalid export/from pair).
   - Unresolved export route returning `status: 'not_found'`.

3. **Add Hotspot `file` Alias Test (Low Priority):**
   In `packages/sdk/test/orchestration/run-graph-hotspots.spec.ts`, add an assertion testing `file: 'src/kernel.ts'` to verify that both `file` and `filePath` spellings map identically.
