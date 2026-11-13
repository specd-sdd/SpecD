# Spec Compliance Audit: SDK Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T11:10:00Z  
**Batch Scope:** `sdk:run-graph-search`, `sdk:run-graph-hotspots`, `sdk:run-graph-impact`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the `@specd/sdk` orchestration layer introduced under change `unify-graph-project-relative-paths`. The change establishes host-agnostic query orchestrators (`runGraphSearch`, `runGraphHotspots`, and `runGraphImpact`) designed to execute code graph operations, manage provider lifecycles cleanly, and project repository filesystem paths canonically onto `projectRelativePath` (relative to `projectRoot`) while eliminating legacy path properties (`configRelativePath`, `displayPath`, and `displayTargets`).

### Key Findings

1. **Path Projection and Legacy Elimination Conformant:**
   Across all three orchestration modules, `projectRelativePath` is consistently surfaced on target and affected elements, while legacy properties (`configRelativePath`, `displayPath`, `displayTargets`) are completely omitted from result types and projections.
2. **Critical Architectural Gap in `sdk:run-graph-impact`:**
   Public export route impact analysis (`--export` and `--from` / `surface`) is mandated in requirement 1.4, requirement 8, and verify scenario "Public export route impact analysis" of `sdk:run-graph-impact`. However, it is **completely missing** from `RunGraphImpactInput` and `runGraphImpact`. Instead, public export impact remains implemented directly inside `@specd/cli` (`packages/cli/src/commands/graph/impact.ts:handlePublicExportImpact`), bypassing SDK orchestration.
3. **Missing Input Parameter Aliases and Fidelity Options:**
   - In `sdk:run-graph-search`: `filePattern`, `includeSnippet`, and `exactFile` are absent from `RunGraphSearchInput`; `exactFile` is never forwarded to `provider.search(...)`.
   - In `sdk:run-graph-hotspots`: `filePath` is absent from `RunGraphHotspotsInput` (only `file` is supported).
4. **Architectural Deviation in `runGraphHotspots` Config Projection:**
   `runGraphHotspots` does not call `ctx.kernel.project.getConfig.execute()` as specified in requirement 4 of `sdk:run-graph-hotspots`. Instead, it passes through `e.symbol.projectRelativePath` directly from `@specd/code-graph` (leveraging ADR-0028 denormalization). While computationally efficient, it lacks fallback projection if the symbol location is not already pre-populated.
5. **Significant Test Coverage Deficit:**
   Test suites in `packages/sdk/test/orchestration/` only provide 2 to 3 smoke tests per orchestrator. Extensive verification scenarios defined in `verify.md` (including option forwarding, parameter aliases, spec impact, caller-owned lifecycle non-closure, and error handling) have no corresponding unit test assertions.

---

## 2. Per-Spec Detailed Analysis

### 2.1. `sdk:run-graph-search`

- **Spec Path:** `specs/sdk/run-graph-search/spec.md`
- **Verify Path:** `specs/sdk/run-graph-search/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-search.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-search.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-search.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-search.spec.ts)

#### Requirements Summary

1. **`runGraphSearch` orchestration:**
   - Accept search parameters covering 100% of code-graph search options (`query`, `categories`, `kinds`, `file`/`filePattern`, `exactFile`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit`, `snippet`/`includeSnippet`, `specContent`, `provider`).
   - Open transient provider via `withOpenGraphProvider` when `provider` is omitted; reuse caller-provided provider without closing.
   - Forward all search options to `provider.search(...)`.
   - Project canonical graph locations to `projectRelativePath` via `ctx.kernel.project.getConfig.execute()`:
     - Symbols: declarations (`declaration.location.projectRelativePath`), symbol hits (`symbol.projectRelativePath`), logical targets (`projectRelativePath`), public bindings (`projectRelativePath`).
     - Files: include `projectRelativePath`, omit `configRelativePath`.
     - Documents: include `projectRelativePath`, omit `configRelativePath`.
     - Specs: preserve `specId`, `path`, `title`, `description`.
   - Return category-grouped `RunGraphSearchResult`.
2. **Elimination of legacy path properties:** Result SHALL NOT expose `configRelativePath` or `displayPath`.
3. **Pure path projection:** Project paths using configuration alone without graph store reads.
4. **No presenter formatting:** Return pure structured data.

#### Implementation Status

- **Core Orchestration:** Fully implemented. Uses `withOpenGraphProvider(ctx, ...)` for transient lifecycle, or delegates directly to `input.provider`.
- **Projection:** Maps declaration locations, logical targets, public bindings, files, and documents to `projectRelativePath`.
- **Legacy Removal:** `configRelativePath` and `displayPath` are omitted from all exported result interfaces.
- **Pure Projection:** Uses `toProjectRelativePath(config, ...)` synchronously with zero database access.

#### Discrepancies

1. **Missing `exactFile`, `filePattern`, and `includeSnippet` in `RunGraphSearchInput`:**
   - _Observation:_ In `run-graph-search.ts`, `RunGraphSearchInput` only accepts `file?: string` and `snippet?: boolean`. It does not declare `filePattern?: string`, `includeSnippet?: boolean`, or `exactFile?: boolean`.
   - _Search Input Forwarding:_ In `searchInput` (lines 201–216), `exactFile` is never passed to `provider.search(...)`, and `input.filePattern` is ignored.
   - _Dual Perspective:_
     - **Implementation Bug:** The spec explicitly requires 100% option coverage and names `exactFile` and aliases (`file`/`filePattern`, `snippet`/`includeSnippet`). Omitting `exactFile` drops critical single-file resolution context used by Code Graph to bypass fuzzy path scoring.
     - **Spec Drift:** The author of `RunGraphSearchInput` may have chosen a cleaner, deduplicated public interface (`file`, `snippet`) instead of carrying forward duplicate aliases. However, omitting `exactFile` remains an operational defect.
2. **Fallback Projection on Symbol Hits:**
   - _Observation:_ Line 284 assigns `projectRelativePath: h.symbol.projectRelativePath`. Unlike declaration locations (which do `d.declaration.location.projectRelativePath ?? toProjectRelativePath(config, d.declaration.location.filePath)`), symbol hits do not provide a fallback to `toProjectRelativePath(config, h.symbol.filePath)`.
   - _Dual Perspective:_
     - **Implementation Bug:** Inconsistent with declaration mapping; if a provider returns a raw `SymbolNode` without denormalized `projectRelativePath`, it remains undefined.
     - **Spec Drift / ADR-0028:** Under ADR-0028, SQLite store schema v14 ensures `symbols.project_relative_path` is always populated.

#### Test Coverage vs `verify.md`

| Scenario from `verify.md`                                                       | Tested in `run-graph-search.spec.ts` | Status | Notes                                                                                                                                                              |
| :------------------------------------------------------------------------------ | :----------------------------------: | :----: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Full graph search with transient provider`                                     |               Partial                |   ⚠️   | Transient open/close called, but does not assert returned projection output through transient path                                                                 |
| `Graph search with caller-owned open provider`                                  |               Partial                |   ⚠️   | Passes `provider`, but does not assert `mockProvider.close` was NOT called                                                                                         |
| `Symbols expose projectRelativePath on declarations, hits, and logical targets` |                 Yes                  |   ✅   | Fully asserted                                                                                                                                                     |
| `Files and documents expose projectRelativePath`                                |                 Yes                  |   ✅   | Fully asserted                                                                                                                                                     |
| `All search options forwarded to provider`                                      |                  No                  |   ❌   | No test verifies forwarding of `kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit`, `exactFile` |
| `Aliases file/filePattern and snippet/includeSnippet behave identically`        |                  No                  |   ❌   | Neither alias is supported or tested                                                                                                                               |
| `configRelativePath is not present`                                             |                 Yes                  |   ✅   | Explicitly asserted on files and documents                                                                                                                         |
| `displayPath is not present`                                                    |               Partial                |   ⚠️   | Checked implicitly on file types, but no explicit assertion `expect(item.displayPath).toBeUndefined()`                                                             |
| `Path projection does not invoke provider or store reads`                       |               Implicit               |   ⚠️   | Pure synchronous mock config used, but no explicit spy asserting no store methods invoked                                                                          |
| `Pure structured data returned`                                                 |                 Yes                  |   ✅   | Output structure asserted                                                                                                                                          |

#### Missing Tests

- Test verifying all filtering options (`kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit`, `exactFile`) are forwarded to `provider.search(...)`.
- Test verifying that caller-owned provider is NOT closed by `runGraphSearch`.
- Test verifying that `filePattern` and `includeSnippet` aliases map identically to `file` and `snippet`.

---

### 2.2. `sdk:run-graph-hotspots`

- **Spec Path:** `specs/sdk/run-graph-hotspots/spec.md`
- **Verify Path:** `specs/sdk/run-graph-hotspots/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-hotspots.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-hotspots.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-hotspots.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-hotspots.spec.ts)

#### Requirements Summary

1. **`runGraphHotspots` orchestration:**
   - Accept hotspot filtering options covering 100% of code-graph hotspot options (`workspace`, `kinds`, `file`/`filePath`, `excludePaths`, `excludeWorkspaces`, `limit`, `minScore`, `minRisk`, `includeImporterOnly`, `categories`, `includeTests`, `includeIgnored`, `provider`).
   - Open transient provider via `withOpenGraphProvider` when omitted; execute on caller provider directly when provided.
   - Forward all options to `provider.getHotspots(...)`.
   - Project each hotspot entry's location to `projectRelativePath` using project configuration and workspace code roots (`ctx.kernel.project.getConfig.execute()`).
   - Include derived `workspace` name, symbol payload, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, and `riskLevel`.
   - Return `RunGraphHotspotsResult` (`totalSymbols`, `entries`, `omittedCounts`).
2. **Elimination of displayPath:** Entries SHALL expose `projectRelativePath` and SHALL NOT expose `displayPath`.
3. **Pure path projection:** Project canonical symbol locations using project/workspace configuration alone without extra graph store queries.
4. **No presenter formatting:** Return pure structured data.

#### Implementation Status

- **Core Orchestration:** Implemented. Handles transient and caller-owned providers.
- **Result Structure:** Includes `totalSymbols`, `entries` (with `workspace`, `riskLevel`, `directCallers`, etc.), and `omittedCounts`.
- **Legacy Removal:** `displayPath` is omitted from `ProjectedHotspotEntry`.

#### Discrepancies

1. **Missing `filePath` alias in `RunGraphHotspotsInput`:**
   - _Observation:_ `RunGraphHotspotsInput` only accepts `file?: string`. `filePath` is not recognized.
   - _Dual Perspective:_
     - **Implementation Bug:** Spec Requirement 1.3 states "`file` or `filePath`: optional file path filter", and verification scenario explicitly tests "Aliases file and filePath behave identically".
     - **Spec Drift:** The SDK author standardized on `file` across search, hotspots, and impact, deviating from provider's internal `filePath` naming without updating the spec.
2. **`ctx.kernel.project.getConfig.execute()` is NOT called:**
   - _Observation:_ In `run-graph-hotspots.ts`, lines 103–112:
     ```ts
     const entries: ProjectedHotspotEntry[] = raw.entries.map((e) => ({
       symbol: e.symbol,
       score: e.score,
       directCallers: e.directCallers,
       crossWorkspaceCallers: e.crossWorkspaceCallers,
       fileImporters: e.fileImporters,
       riskLevel: e.riskLevel,
       workspace: splitWorkspaceIdentity(e.symbol.filePath)?.workspace ?? '',
       projectRelativePath: e.symbol.projectRelativePath,
     }))
     ```
     `ctx.kernel.project.getConfig` is completely ignored. `projectRelativePath` is passed through from `e.symbol.projectRelativePath`, and `workspace` is extracted via `splitWorkspaceIdentity`.
   - _Dual Perspective:_
     - **Implementation Bug:** Spec Requirement 4 explicitly mandates: "Project each hotspot entry's location to `projectRelativePath` using project configuration and workspace code roots (`ctx.kernel.project.getConfig.execute()`)." If `e.symbol.projectRelativePath` is missing, there is no configuration fallback.
     - **Spec Drift / ADR-0028:** In ADR-0028, SQLite store schema v14 denormalizes `project_relative_path` directly into the `symbols` table. Therefore, reading configuration at runtime in `runGraphHotspots` is unnecessary when the provider supplies native project-relative paths. The spec was written prior to or without acknowledging that hotspots already return pre-projected `SymbolNode` objects.

#### Test Coverage vs `verify.md`

| Scenario from `verify.md`                           | Tested in `run-graph-hotspots.spec.ts` | Status | Notes                                                                                                                                                                                                  |
| :-------------------------------------------------- | :------------------------------------: | :----: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Hotspots ranked with transient provider`           |                Partial                 |   ⚠️   | Only tests that `open` and `close` are called, not the returned result structure                                                                                                                       |
| `Hotspots with caller-owned open provider`          |                Partial                 |   ⚠️   | Passes `provider`, but does not assert that `provider.close` was NOT called                                                                                                                            |
| `Entries include projectRelativePath and workspace` |                  Yes                   |   ✅   | Fully asserted                                                                                                                                                                                         |
| `All hotspot options forwarded to provider`         |                   No                   |   ❌   | No test verifies options forwarding (`kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `limit`, `minScore`, `minRisk`, `includeImporterOnly`, `categories`, `includeTests`, `includeIgnored`) |
| `Aliases file and filePath behave identically`      |                   No                   |   ❌   | `filePath` alias neither accepted nor tested                                                                                                                                                           |
| `displayPath is omitted from hotspot entries`       |                  Yes                   |   ✅   | Explicitly asserted: `expect((entry as any).displayPath).toBeUndefined()`                                                                                                                              |
| `Hotspot projection uses configuration alone`       |                   No                   |   ❌   | Configuration is not even invoked                                                                                                                                                                      |
| `Pure structured data returned`                     |                  Yes                   |   ✅   | Output structure asserted                                                                                                                                                                              |

#### Missing Tests

- Test verifying forwarding of all hotspot options to `provider.getHotspots(...)`.
- Test verifying caller-owned provider is NOT closed.
- Test verifying full return payload under transient provider execution.
- Test verifying `filePath` alias mapping to `provider.getHotspots({ filePath })`.

---

### 2.3. `sdk:run-graph-impact`

- **Spec Path:** `specs/sdk/run-graph-impact/spec.md`
- **Verify Path:** `specs/sdk/run-graph-impact/verify.md`
- **Implementation File:** [`packages/sdk/src/orchestration/run-graph-impact.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/src/orchestration/run-graph-impact.ts)
- **Test File:** [`packages/sdk/test/orchestration/run-graph-impact.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/sdk/test/orchestration/run-graph-impact.spec.ts)

#### Requirements Summary

1. **`runGraphImpact` orchestration:**
   - Accept target selectors across all four supported target types:
     - `files`: one or more file selectors (`workspace:path`, config-relative, or absolute).
     - `symbol`: symbol identifier or qualified name.
     - `spec`: specification identifier (`workspace:capability-path`).
     - `export` and `from` (or `surface`): public export route name and surface file.
   - Accept traversal direction (`upstream`, `downstream`, `both`, `dependents`, `dependencies`) and `depth` (defaults to 3).
   - Accept provider-side filter constraints `filter: ImpactResultFilter`.
   - Open transient provider when omitted; execute on caller provider directly when provided.
   - For file targets: resolve using `provider.resolveFileSelector` and execute `analyzeFileImpact` / `analyzeFilesImpact`.
   - For symbol targets: resolve using `provider.resolveSymbolSelector` and execute `analyzeImpact`.
   - For spec targets: validate existence using `provider.getSpec` and execute `analyzeSpecImpact`.
   - For public export targets: resolve public surface and binding using `provider.resolveSymbolReference` and `provider.getExactPublicBinding`, and execute `provider.analyzePublicBindingImpact`.
   - Project all target and affected locations to `projectRelativePath` via `ctx.kernel.project.getConfig.execute()`:
     - Single-file: `canonicalPath` and `projectRelativePath`.
     - Multi-file: `targets` and `projectRelativeTargets`.
     - Symbol: `projectRelativePath`.
     - Public export: `projectRelativeSurface`.
     - Affected files/symbols: projected to `projectRelativePath`.
   - Return `RunGraphImpactResult` containing aggregate metrics.
2. **Elimination of displayPath and displayTargets:** Result SHALL expose `projectRelativePath` and `projectRelativeTargets`, and SHALL NOT expose `displayPath` or `displayTargets`.
3. **Pure path projection:** Derives project-relative paths exclusively from project configuration without extra store reads.
4. **No presenter formatting:** Pure structured data returned.

#### Implementation Status

- **File Impact:** Fully implemented for single-file and multi-file. Resolves selectors and maps affected files and symbols using `toProjectRelativePath`.
- **Symbol Impact:** Implemented. Resolves selector (handling missing, ambiguous, and exact matches) and projects affected paths.
- **Spec Impact:** Implemented. Validates existence via `getSpec` and executes `analyzeSpecImpact`.
- **Public Export Impact:** **UNIMPLEMENTED.** Not present in `RunGraphImpactInput` or `runGraphImpact`.
- **Direction / Depth / Filters:** Normalized and forwarded for files, symbols, and specs.
- **Legacy Removal:** `displayPath` and `displayTargets` are omitted from all result interfaces.

#### Discrepancies

1. **CRITICAL: Public Export Route Impact is Completely Missing in SDK:**
   - _Observation:_ Requirement 1.4, Requirement 8, Requirement 10.4, and verify scenario "Public export route impact analysis" specify public export impact analysis (`export` and `from`/`surface`).
     In `run-graph-impact.ts`:
     - `RunGraphImpactInput` contains no `export`, `from`, or `surface` fields.
     - `executeWithProvider` throws `GraphSelectorError('Either files, symbol, or spec must be specified for impact analysis.')`.
     - In `packages/cli/src/commands/graph/impact.ts`, lines 515–632 retain an internal private function `handlePublicExportImpact` which directly calls `provider.resolveSymbolReference`, `provider.getExactPublicBinding`, and `provider.analyzePublicBindingImpact`, bypassing SDK orchestration entirely.
   - _Dual Perspective:_
     - **Implementation Bug:** High severity. The purpose of `@specd/sdk` orchestration is to provide host-agnostic business logic so that CLI, MCP, and IDE plugins do not duplicate graph analysis orchestration. By leaving `handlePublicExportImpact` in CLI and omitting it from SDK, MCP and other hosts cannot perform public export impact analysis through `@specd/sdk`.
     - **Spec Drift:** The change author may have prioritized file, symbol, and spec impact for initial migration, deferring the more complex public export routing logic. However, the spec was already finalized with requirement 8 and verify scenarios included.
2. **Incomplete Error Outcome Typing for Specs:**
   - _Observation:_ For missing symbols, `runGraphImpact` returns `{ kind: 'symbol', status: 'not_found' }`. For missing specs, it throws `GraphSpecNotFoundError`.
   - _Dual Perspective:_
     - **Spec Drift:** Requirement 7 says "validate spec existence using `provider.getSpec` and execute `provider.analyzeSpecImpact`", but does not specify whether missing spec should return a failure object or throw. The implementation matches existing behavior of throwing `GraphSpecNotFoundError`.

#### Test Coverage vs `verify.md`

| Scenario from `verify.md`                          | Tested in `run-graph-impact.spec.ts` | Status | Notes                                                                                                                  |
| :------------------------------------------------- | :----------------------------------: | :----: | :--------------------------------------------------------------------------------------------------------------------- |
| `File impact with transient provider`              |                  No                  |   ❌   | Test 1 passes `{ provider: mockProvider }`. Transient provider lifecycle is never tested in `run-graph-impact.spec.ts` |
| `Multi-file impact exposes projectRelativeTargets` |                 Yes                  |   ✅   | Fully asserted                                                                                                         |
| `Symbol impact analysis`                           |                 Yes                  |   ✅   | Fully asserted for exact resolved symbol                                                                               |
| `Spec impact analysis`                             |                  No                  |   ❌   | No unit test in `run-graph-impact.spec.ts` tests `runGraphImpact(ctx, { spec: ... })`                                  |
| `Public export route impact analysis`              |                  No                  |   ❌   | Completely missing (unimplemented in code)                                                                             |
| `Provider filter forwarding across targets`        |                  No                  |   ❌   | No test verifies that `input.filter` is forwarded to provider methods                                                  |
| `Traversal direction and depth forwarding`         |                  No                  |   ❌   | No test verifies normalization of `direction` or forwarding of custom `depth`                                          |
| `Impact analysis with caller-owned open provider`  |               Partial                |   ⚠️   | Tests pass `provider`, but do not assert `provider.close` was NOT called                                               |
| `displayPath and displayTargets are omitted`       |                 Yes                  |   ✅   | Explicitly asserted for single-file, multi-file, and symbol results                                                    |
| `Impact projection uses configuration alone`       |                 Yes                  |   ✅   | Mock configuration used; no store reads                                                                                |
| `Pure structured data returned`                    |                 Yes                  |   ✅   | Output structure asserted                                                                                              |

#### Missing Tests

- Test verifying transient provider opening and closing for `runGraphImpact`.
- Test verifying `runGraphImpact` with spec targets (`{ spec: 'core:config' }`).
- Test verifying forwarding of `direction`, `depth`, and `filter` options to provider.
- Test verifying error states: empty file selector, file not found, ambiguous file selector, symbol `not_found`, symbol `ambiguous`, spec `GraphSpecNotFoundError`.
- Test verifying public export route impact (once implemented).

---

## 3. Spec Dependency Chain & Cross-Spec Consistency

```
sdk:run-graph-search  ──► sdk:host-context
sdk:run-graph-hotspots ──► sdk:with-open-graph-provider
sdk:run-graph-impact   ──► core:config
                       └──► code-graph:composition / traversal / hotspots / document-model
```

### Consistency Checks

1. **`sdk:host-context` & `sdk:with-open-graph-provider`:**
   All three orchestrators consistently accept `SdkHostContext` and delegate transient provider management to `withOpenGraphProvider`. This pattern is cleanly decoupled and conforms to SDK lifecycle architecture.
2. **`core:config` vs ADR-0028 Denormalization:**
   - In `run-graph-search` and `run-graph-impact`, `ctx.kernel.project.getConfig.execute()` is invoked to map canonical surfaces, declarations, and affected files using `toProjectRelativePath(config, ...)`.
   - In `run-graph-hotspots`, `ctx.kernel.project.getConfig.execute()` is NOT called because `@specd/code-graph` already populates `projectRelativePath` directly on `SymbolNode` via SQLite schema v14 (ADR-0028).
   - _Recommendation:_ Either update `sdk:run-graph-hotspots` spec requirement 4 to reflect ADR-0028 native pass-through, or add a defensive fallback `toProjectRelativePath(config, e.symbol.filePath)` in `runGraphHotspots` to maintain uniformity.
3. **CLI Presentation Boundary:**
   CLI commands (`packages/cli/src/commands/graph/search.ts`, `hotspots.ts`, and `impact.ts`) delegate search and hotspots to SDK. However, `impact.ts` maintains a parallel implementation of public export impact instead of delegating to SDK, breaking the intended architectural boundary.

---

## 4. Compliance Summary Table

| Spec ID                      |  Overall Status   | Requirements Implemented |       Test Coverage        | Critical Findings & Discrepancies                                                                                                                                                                                    |
| :--------------------------- | :---------------: | :----------------------: | :------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`sdk:run-graph-search`**   |    **PARTIAL**    |    **90%** (4.5 / 5)     | **45%** (4 / 10 scenarios) | • Missing `exactFile`, `filePattern`, and `includeSnippet` in `RunGraphSearchInput`.<br>• `exactFile` dropped from provider call.<br>• No tests for filter forwarding or parameter aliases.                          |
| **`sdk:run-graph-hotspots`** |    **PARTIAL**    |    **85%** (3.5 / 4)     | **40%** (3 / 8 scenarios)  | • Missing `filePath` alias on input.<br>• Config `getConfig.execute()` not called (relies solely on provider `SymbolNode`).<br>• No tests for options forwarding or transient return payload.                        |
| **`sdk:run-graph-impact`**   | **NON-COMPLIANT** |    **70%** (3.5 / 5)     | **35%** (4 / 11 scenarios) | • **CRITICAL:** Public export impact (`export`, `from`) completely missing from SDK.<br>• CLI retains private export impact logic.<br>• Spec impact completely untested.<br>• Transient provider lifecycle untested. |

---

## 5. Actionable Recommendations

1. **Implement Public Export Impact in `runGraphImpact` (`sdk:run-graph-impact`):**
   - Add `export?: string` and `from?: string` / `surface?: string` to `RunGraphImpactInput`.
   - Migrate public export resolution and binding impact logic from `packages/cli/src/commands/graph/impact.ts:handlePublicExportImpact` into `packages/sdk/src/orchestration/run-graph-impact.ts`.
   - Ensure `projectRelativeSurface` and projected affected paths are returned.
2. **Align Search & Hotspot Input Aliases (`sdk:run-graph-search`, `sdk:run-graph-hotspots`):**
   - Add `filePattern?: string`, `includeSnippet?: boolean`, and `exactFile?: boolean` to `RunGraphSearchInput` and forward `exactFile` to `provider.search(...)`.
   - Add `filePath?: string` alias to `RunGraphHotspotsInput` and map to `input.filePath ?? input.file`.
3. **Harmonize `runGraphHotspots` Path Projection:**
   - Add fallback `projectRelativePath: e.symbol.projectRelativePath || toProjectRelativePath(config, e.symbol.filePath)` in `runGraphHotspots` to satisfy requirement 4 and guarantee robustness.
4. **Expand SDK Unit Test Suites:**
   - Add dedicated test cases in `run-graph-search.spec.ts` for option forwarding and alias mapping.
   - Add test cases in `run-graph-hotspots.spec.ts` for option forwarding and transient payload.
   - Add test cases in `run-graph-impact.spec.ts` for transient lifecycle, spec impact, filter forwarding, and public export impact.
