# Spec Compliance Audit Report: `unify-graph-project-relative-paths`

**Change Name:** `unify-graph-project-relative-paths`  
**Audit Timestamp:** 2026-10-13T11:03:31Z  
**Mode:** Change Mode (`--change unify-graph-project-relative-paths`)  
**Report Directory:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths/reports/20261013-110331`

---

## Executive Summary

This comprehensive spec compliance audit evaluates the changes made under `unify-graph-project-relative-paths` across `@specd/code-graph`, `@specd/sdk`, and `@specd/cli`.

The core goal of this change is to unify path representations in the SpecD Code Graph ecosystem by introducing `projectRelativePath` (relative to `projectRoot`) as the canonical project-relative location across all symbols, files, documents, and impact results, eliminating legacy path properties (`configRelativePath`, `displayPath`, and `displayTargets`). In `@specd/code-graph`, this is anchored by **ADR-0028**, upgrading the SQLite schema to version **14** and denormalizing `project_relative_path` into `symbols` for zero-join querying. In `@specd/sdk`, new host-agnostic orchestrators (`runGraphSearch`, `runGraphHotspots`, `runGraphImpact`) manage provider lifecycles and canonical path projections. In `@specd/cli`, commands delegate to the SDK orchestrators.

### Aggregate Compliance Status

| Metric                                        | Total  |
| :-------------------------------------------- | :----: |
| **Total Specs Audited**                       | **10** |
| **Fully Compliant Specs**                     | **6**  |
| **Partially Compliant / Non-Compliant Specs** | **4**  |
| **Total Discrepancies Identified**            | **8**  |
| **Total Test Coverage Gaps Identified**       | **22** |

### Key High-Level Findings

1. **Code Graph Domain & Storage (Compliant)**:
   - Schema version bumped to **14**.
   - `project_relative_path` persists cleanly across `files`, `documents`, and `symbols`.
   - Zero-join queries implemented for symbols.
   - `configRelativePath` is completely eliminated from `@specd/code-graph` (0 occurrences).
   - All 63 code-graph test suites pass (837 tests, 100%).

2. **SDK Query Orchestration (Partial / Non-Compliant)**:
   - `runGraphSearch`, `runGraphHotspots`, and `runGraphImpact` exist and project paths to `projectRelativePath`.
   - **Critical Gap (`sdk:run-graph-impact`)**: Public export route impact (`--export` and `--from`/`surface`) is completely missing from `RunGraphImpactInput` and `runGraphImpact`.
   - **Parameter Gaps**: `RunGraphSearchInput` omits `exactFile`, `filePattern`, `includeSnippet`. `RunGraphHotspotsInput` omits `filePath`.
   - Test suites in `packages/sdk/test/orchestration/` only contain basic smoke tests, leaving option forwarding, parameter aliases, and error states untested.

3. **CLI Presentation & Delegation (Partial / Discrepant)**:
   - Search and hotspots commands cleanly delegate to SDK and emit `projectRelativePath`.
   - All 87 CLI test suites pass (1,129 tests, 100%).
   - **Critical Gap (`cli:graph-impact`)**: Public export impact bypasses `sdk:run-graph-impact`, calling `provider` methods directly in the CLI, and outputs raw canonical paths (`core:src/login.ts`) instead of project-relative paths.

---

## Aggregate Summary Table

| Spec ID                            | Area                    |      Status       | Reqs Count | Discrepancies | Test Gaps |
| :--------------------------------- | :---------------------- | :---------------: | :--------: | :-----------: | :-------: |
| `cli:graph-search`                 | Presentation / CLI      |   **Compliant**   |     4      |       0       |     2     |
| `cli:graph-hotspots`               | Presentation / CLI      |   **Compliant**   |     8      |       0       |     0     |
| `cli:graph-impact`                 | Presentation / CLI      | **Non-Compliant** |     8      |       3       |     1     |
| `sdk:run-graph-search`             | Host SDK                |    **Partial**    |     5      |       2       |     3     |
| `sdk:run-graph-hotspots`           | Host SDK                |    **Partial**    |     4      |       2       |     4     |
| `sdk:run-graph-impact`             | Host SDK                | **Non-Compliant** |     5      |       1       |     5     |
| `code-graph:symbol-model`          | Domain Model            |   **Compliant**   |     5      |       0       |     3     |
| `code-graph:document-model`        | Domain Model            |   **Compliant**   |     4      |       0       |     0     |
| `code-graph:workspace-integration` | Application / Services  |   **Compliant**   |     3      |       0       |     2     |
| `code-graph:sqlite-graph-store`    | Infrastructure / SQLite |   **Compliant**   |     3      |       1       |     2     |
| **Total**                          |                         |                   |   **49**   |     **8**     |  **22**   |

---

## Detailed Findings

The complete, unabridged findings from each audited batch are included verbatim below.

### Batch 1: CLI (`packages/cli`)

<!-- BEGIN PARTIAL: cli -->

# Spec Compliance Audit Report: `cli` Batch

**Change**: `unify-graph-project-relative-paths`  
**Auditor**: Subagent (`cli` batch)  
**Timestamp**: 2026-10-13T11:10:00Z  
**Assigned Specs**:

- `cli:graph-search`
- `cli:graph-hotspots`
- `cli:graph-impact`

---

## Executive Summary

This compliance audit evaluates the `@specd/cli` package implementation and test suite against the specifications updated for the `unify-graph-project-relative-paths` change. The primary architectural objective of this change is to establish `projectRelativePath` as the sole, authoritative project-relative file location across structured outputs (`json` and `toon`) and text presenters, completely eliminating fragmented legacy properties (`configRelativePath`, `displayPath`, and `displayTargets`), and delegating query execution and path projection to host-agnostic `@specd/sdk` orchestrators (`runGraphSearch`, `runGraphHotspots`, `runGraphImpact`).

### Key Findings

1. **Overall Compliance**: The CLI commands largely conform to the refactored architecture. All three commands (`graph search`, `graph hotspots`, `graph impact`) successfully import and invoke SDK orchestration functions, omit legacy property names (`configRelativePath`, `displayPath`, `displayTargets`) from their structured outputs and CLI help documentation, and render `projectRelativePath` in terminal text and structured outputs.
2. **Public Export Impact Delegation & Path Gap (`cli:graph-impact`)**:
   - `cli:graph-impact` mandates that the command SHALL delegate impact analysis and path projection to `sdk:run-graph-impact`, and that all file paths rendered in impact output SHALL be formatted relative to the project root.
   - In implementation, while file, symbol, and spec impact delegate to `runGraphImpact`, public export impact (`--export <name> --from <surface>`) bypasses `sdk:run-graph-impact` and invokes `provider.resolveSymbolReference`, `provider.getExactPublicBinding`, and `provider.analyzePublicBindingImpact` directly on the `CodeGraphProvider`.
   - Consequently, the affected file paths emitted in public export impact structured and text outputs are raw canonical paths (e.g. `core:src/login.ts`) rather than projected `projectRelativePath` strings.
3. **Test Suite Status**: All 87 CLI test suites (1,129 tests) pass cleanly. However, two notable verification scenario gaps exist:
   - `cli:graph-search`: Missing tests verifying document search results containing `projectRelativePath` in JSON mode and document grouping in text mode (all search test fixtures supply `documents: []`).
   - `cli:graph-impact`: Missing test verifying `--symbol` impact in JSON mode asserting `projectRelativePath` presence and `displayPath` absence.

---

## Per-Spec Analysis

### Spec: `cli:graph-search`

#### 1. Requirements Summary

- **Delegation**: The command SHALL delegate graph querying and path projection to `sdk:run-graph-search`.
- **Output Ordering**: Text, JSON, and TOON SHALL remain category-grouped in deterministic `symbols`, `files`, `specs`, and `documents` order with active per-category limit and count headers.
- **Symbol Results**: Structured symbol entries SHALL expose logical identity, declarations, bindings, matched bindings, match tiers/reasons, construct and selection ranges, and `projectRelativePath` on every declaration location (`location.projectRelativePath`), symbol hit (`symbol.projectRelativePath`), and logical target / public binding surface (`projectRelativePath`). Serialized canonical IDs SHALL NOT be printed in text mode. When a public export caused a match, text SHALL show `matched export: <project-relative-path>::<exported-name>`.
- **File Results**: Expose file identity (`workspace` and canonical `path`), `projectRelativePath`, retained precise matches, `totalMatches`, and `omittedMatches`. Structured output SHALL NOT expose `configRelativePath`. Text renders `N more matches in this file` when matches are omitted.
- **Document Results**: Expose `projectRelativePath` and SHALL NOT expose `configRelativePath`.
- **Omission Notices**: Display omission notice in text mode when tests/ignored are excluded (`formatOmissionNotice`), and include `omittedCounts: { tests: number, ignored: number }` in structured JSON/TOON output.

#### 2. Implementation Status: COMPLIANT

- `packages/cli/src/commands/graph/search.ts`:
  - Imports and invokes `runGraphSearch(hostContext, input)` from `@specd/sdk`.
  - Structured output (`output(result, fmt)`) passes through the SDK result directly, which includes `projectRelativePath` across hits, declarations, matchedPublicBindings, files, and documents, omitting `configRelativePath`.
  - Text mode correctly renders `firstHit.symbol.projectRelativePath`, `binding.projectRelativePath::binding.exportedName`, `location.projectRelativePath`, `file.projectRelativePath`, and `doc.projectRelativePath`.
  - Omission notice and `omittedCounts` are properly rendered and emitted.
  - Help text schema (`addHelpText`) has been updated to document `projectRelativePath` across all categories and omit `configRelativePath`.

#### 3. Discrepancies

- None identified in code. Implementation adheres to all spec requirements.

#### 4. Test Coverage: PARTIAL (Coverage Gap on Documents)

- `packages/cli/test/commands/graph-search.spec.ts`:
  - **Covered**:
    - Delegation to `search` / `runGraphSearch`.
    - Structured JSON assertion of `projectRelativePath` on `symbol.hits[0].symbol`, `symbols[0].matchedPublicBindings[0]`, and `files[0]`.
    - Structured JSON assertion that `configRelativePath` is absent on symbols and files (`not.toHaveProperty('configRelativePath')`).
    - Text mode rendering of `matched export: <project-relative-path>::<name>` and `declaration: <project-relative-path>:<line>:<col>`.
    - Text mode rendering of `N more matches in this file`.
    - Text omission notice and JSON `omittedCounts`.
    - Filter options (`--kind`, `--category`, `--include-tests`, `--include-ignored`, `--all`, `--file`, `--workspace`, `--exclude-path`, `--exclude-workspace`).

#### 5. Missing Tests

- **Document Results Verification Scenarios**:
  - `Scenario: JSON output includes workspace and scores but excludes full content`:
    - Spec requirement: _"document entries include path, projectRelativePath but NOT content ... document entries do NOT include configRelativePath"_.
    - Current state: All mock fixtures in `packages/cli/test/commands/graph-search.spec.ts` return `documents: []`. There is no test asserting `doc.projectRelativePath` or absence of `configRelativePath` in JSON/TOON mode.
  - `Scenario: Text output groups document results separately`:
    - Spec requirement: _"GIVEN document search returns one or more matching documents ... stdout contains a Documents ( section ... shows owning workspace and match location metadata"_.
    - Current state: Not tested with non-empty document results in `graph-search.spec.ts`.

---

### Spec: `cli:graph-hotspots`

#### 1. Requirements Summary

- **Delegation**: The command SHALL delegate hotspot retrieval and path projection to `sdk:run-graph-hotspots`.
- **Text Presentation**: Print ranked table with total returned / total symbol count, Score, Risk, XWS, Kind, Name, and workspace-qualified file location (`[<workspace>] <projectRelativePath>:<line>`). Output `No hotspots found.` when empty.
- **Omission Notices**: Display `ℹ Excluded from results: ...` in text mode when filtered, and include `omittedCounts` in structured output.
- **Structured Output**: Emits `totalSymbols`, `entries`, and `omittedCounts`. Each entry includes symbol payload, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, `riskLevel`, `workspace`, and `projectRelativePath`. Hotspot entries in structured output SHALL NOT expose `displayPath`.

#### 2. Implementation Status: COMPLIANT

- `packages/cli/src/commands/graph/hotspots.ts`:
  - Imports and invokes `runGraphHotspots(hostContext, input)` from `@specd/sdk`.
  - Structured output forwards `result` directly, preserving `projectRelativePath` and derived `workspace` while omitting `displayPath`.
  - Text mode table formats entries using `[${entry.workspace}] ${entry.projectRelativePath}:${String(entry.symbol.line)}`.
  - Commander `addHelpText` accurately reflects the new output schema and semantics of `projectRelativePath`.

#### 3. Discrepancies

- None identified in code or documentation.

#### 4. Test Coverage: COMPLETE

- `packages/cli/test/commands/graph-hotspots.spec.ts`:
  - **Covered**:
    - `projects projectRelativePath and eliminates displayPath in JSON mode`: Explicitly asserts `entry.projectRelativePath === 'src/service.ts'`, `entry.workspace === 'default'`, `not.toHaveProperty('displayPath')`, and `entry.symbol.not.toHaveProperty('displayPath')`.
    - `renders projectRelativePath and avoids displayPath in TOON and text modes`: Asserts `[default] src/service.ts:10` in text, asserts `projectRelativePath` in TOON, and asserts absence of `displayPath` across both.
    - Omission notice in text mode and `omittedCounts` in JSON mode.
    - All filter combinations: default kinds, explicit `--kind`, `--min-score`, `--min-risk`, `--include-importer-only`, `--category`, `--include-tests`.

#### 5. Missing Tests

- None. All requirements and verification scenarios are thoroughly tested.

---

### Spec: `cli:graph-impact`

#### 1. Requirements Summary

- **Delegation**: The command SHALL delegate impact analysis and path projection to `sdk:run-graph-impact`.
- **Path Unification**: All file paths rendered in impact analysis output (both text and JSON) SHALL be formatted relative to the project root for consistency across multi-workspace projects.
- **Target Identities**: Target file and symbol entries SHALL expose `canonicalPath` and `projectRelativePath`. Multi-file impact results SHALL expose `targets` (canonical) and `projectRelativeTargets`. Structured output SHALL NOT expose `displayPath` or `displayTargets`.
- **Affected Nodes**: All affected file and symbol paths SHALL be formatted relative to the project root (`projectRelativePath`).
- **Presentations**:
  - Single-file text mode: header with depth, Risk level, Direct/Indirect/Transitive deps, Affected files count, `Changed symbols:`, `Affected files: <path>: <name>:<line> (d=N)`, `Per-symbol breakdown:`, Covering specs.
  - Multi-file text mode: aggregated summary, `Changed symbols:` grouped by input file, `Affected files:`, `Per-file breakdown:`.
  - Symbol text mode: `Impact analysis for <kind> <name> (<projectRelativePath>:<line>) (depth=N)`.
  - Spec text mode: `Impact analysis for spec <specId> (depth=N)`.
  - Covering specs: direct and blast-radius coverage presentation without CLI re-querying.
  - Public export impact: two views (exact public binding impact and canonical symbol impact).

#### 2. Implementation Status: PARTIAL / DISCREPANT

- `packages/cli/src/commands/graph/impact.ts`:
  - **File Impact (Single and Multi)**: Fully compliant. Calls `runGraphImpact(hostContext, { files, ... })`. Exposes `canonicalPath` and `projectRelativePath` for single-file, and `targets` and `projectRelativeTargets` for multi-file. Affected files and symbols are projected to `projectRelativePath`. Neither `displayPath` nor `displayTargets` is emitted.
  - **Symbol Impact**: Calls `runGraphImpact(hostContext, { symbol, ... })`. Exposes `symbol`, `projectRelativePath`, and `impact`. Ambiguous candidates expose `projectRelativePath`.
  - **Spec Impact**: Calls `runGraphImpact(hostContext, { spec, ... })`.
  - **Selector Resolution Helper**: `resolve-impact-file-selectors.ts` re-exports SDK utilities (`splitWorkspaceIdentity`, `toProjectRelativePath`, and legacy alias `toGraphDisplayPath`).

#### 3. Discrepancies

##### Discrepancy 1 (Implementation Drift / Incomplete SDK Delegation): Public Export Impact Bypasses SDK Orchestrator

- **Spec Clause**:
  > _"The command SHALL delegate impact analysis and path projection to `sdk:run-graph-impact`."_
- **Actual Code**:
  In `packages/cli/src/commands/graph/impact.ts` (lines 455-464 and lines 515-632), `handlePublicExportImpact` does not delegate to `runGraphImpact`. Instead, it calls `provider.resolveSymbolReference`, `provider.getExactPublicBinding`, and `provider.analyzePublicBindingImpact` directly on the `CodeGraphProvider`.
- **Root Cause**:
  `RunGraphImpactInput` in `@specd/sdk` (`packages/sdk/src/orchestration/run-graph-impact.ts`) was only defined with `files`, `symbol`, and `spec` options, omitting `export` and `from`/`surface`. As a result, the CLI retained its custom direct provider implementation for public export routes.
- **Classification**:
  - Implementation defect: The CLI should delegate export routes to `runGraphImpact`, or the SDK input type should be expanded to accept `export` and `from`.

##### Discrepancy 2 (Spec Violation): Canonical Paths Emitted in Public Export Impact

- **Spec Clause**:
  > _"All file paths rendered in the impact analysis output (both text and JSON) SHALL be formatted relative to the project root for consistency across multi-workspace projects."_
- **Actual Code**:
  In `handlePublicExportImpact` (lines 596-631), `result.bindingImpact.affectedFiles` and `result.canonicalImpact.affectedFiles` come raw from `provider.analyzePublicBindingImpact(...)`. In `code-graph`, `ImpactResult.affectedFiles` contains canonical workspace-prefixed strings (e.g. `core:src/login.ts`). Because `handlePublicExportImpact` does not project these through `toProjectRelativePath`, both terminal text and JSON output print canonical paths instead of project-relative paths.
- **Classification**:
  - Implementation bug: Public export impact output violates the project-wide path unification requirement.

##### Discrepancy 3 (Minor Terminology Residual): Re-export of `toGraphDisplayPath`

- **Spec Clause**:
  Proposal and specs state that `displayPath` terminology is retired without backward compatibility.
- **Actual Code**:
  `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts` line 58 re-exports `toGraphDisplayPath` (as an alias of `toProjectRelativePath`) from `@specd/sdk`. While no code inside `packages/cli/src/` uses it, `packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts` still tests `toGraphDisplayPath`.
- **Classification**:
  - Minor cleanup opportunity: Remove the deprecated alias re-export and rename the unit test file to test `toProjectRelativePath`.

#### 4. Test Coverage: PARTIAL

- `packages/cli/test/commands/graph-impact.spec.ts`:
  - **Covered**:
    - Single-file impact in JSON: asserts `projectRelativePath: 'packages/core/src/auth.ts'`, `not.toHaveProperty('displayPath')`, `affectedFiles: ['packages/core/src/login.ts']`, and `affectedSymbols[0].projectRelativePath`.
    - Multi-file impact in JSON: asserts `projectRelativeTargets`, `not.toHaveProperty('displayTargets')`, `perFile[0].projectRelativePath`, and `not.toHaveProperty('displayPath')`.
    - TOON output: asserts presence of `projectRelativePath` and absence of `displayPath` and `displayTargets`.
    - Text mode: depth indicators, changed symbols, per-symbol breakdown, per-file breakdown, covering specs.
    - Public export impact: tests exact binding lookup and two-view impact output.

#### 5. Missing Tests

- **Symbol Impact in JSON Mode**:
  - Verification scenario:
    ```
    #### Scenario: JSON output for symbol impact
    - WHEN specd graph impact --symbol createKernel --format json is run
    - THEN stdout is valid JSON containing symbol, impact, and projectRelativePath
    - AND stdout JSON does not contain displayPath
    ```
  - Current state: While `packages/cli/test/commands/graph-impact.spec.ts` tests `--symbol` in text mode and tests `--symbol SpecRepository --type specs --format json` (which only checks `impact.affectedSpecs`), there is NO test asserting that a standard symbol impact query in JSON mode contains `projectRelativePath` and does NOT contain `displayPath`.

<!-- END PARTIAL: cli -->

---

### Batch 2: SDK (`packages/sdk`)

<!-- BEGIN PARTIAL: sdk -->

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

#### Missing Tests

- Test verifying all filtering options (`kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit`, `exactFile`) are forwarded to `provider.search(...)`.
- Test verifying that caller-owned provider is NOT closed by `runGraphSearch`.
- Test verifying that `filePattern` and `includeSnippet` aliases map identically to `file` and `snippet`.

---

### 2.2. `sdk:run-graph-hotspots`

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
   - _Observation:_ In `run-graph-hotspots.ts`, lines 103–112, `ctx.kernel.project.getConfig` is completely ignored. `projectRelativePath` is passed through from `e.symbol.projectRelativePath`, and `workspace` is extracted via `splitWorkspaceIdentity`.
   - _Dual Perspective:_
     - **Implementation Bug:** Spec Requirement 4 explicitly mandates: "Project each hotspot entry's location to `projectRelativePath` using project configuration and workspace code roots (`ctx.kernel.project.getConfig.execute()`)." If `e.symbol.projectRelativePath` is missing, there is no configuration fallback.
     - **Spec Drift / ADR-0028:** In ADR-0028, SQLite store schema v14 denormalizes `project_relative_path` directly into the `symbols` table. Therefore, reading configuration at runtime in `runGraphHotspots` is unnecessary when the provider supplies native project-relative paths.

#### Missing Tests

- Test verifying forwarding of all hotspot options to `provider.getHotspots(...)`.
- Test verifying caller-owned provider is NOT closed.
- Test verifying full return payload under transient provider execution.
- Test verifying `filePath` alias mapping to `provider.getHotspots({ filePath })`.

---

### 2.3. `sdk:run-graph-impact`

#### Requirements Summary

1. **`runGraphImpact` orchestration:**
   - Accept target selectors across all four supported target types:
     - `files`: one or more file selectors (`workspace:path`, config-relative, or absolute).
     - `symbol`: symbol identifier or qualified name.
     - `spec`: specification identifier (`workspace:capability-path`).
     - `export` and `from` (or `surface`): public export route name and surface file.
   - Accept traversal direction and `depth`.
   - Accept provider-side filter constraints `filter: ImpactResultFilter`.
   - Open transient provider when omitted; execute on caller provider directly when provided.
   - For file targets: resolve using `provider.resolveFileSelector` and execute `analyzeFileImpact` / `analyzeFilesImpact`.
   - For symbol targets: resolve using `provider.resolveSymbolSelector` and execute `analyzeImpact`.
   - For spec targets: validate existence using `provider.getSpec` and execute `analyzeSpecImpact`.
   - For public export targets: resolve public surface and binding using `provider.resolveSymbolReference` and `provider.getExactPublicBinding`, and execute `provider.analyzePublicBindingImpact`.
   - Project all target and affected locations to `projectRelativePath` via `ctx.kernel.project.getConfig.execute()`.
   - Return `RunGraphImpactResult` containing aggregate metrics.
2. **Elimination of displayPath and displayTargets:** Result SHALL expose `projectRelativePath` and `projectRelativeTargets`, and SHALL NOT expose `displayPath` or `displayTargets`.
3. **Pure path projection:** Derives project-relative paths exclusively from project configuration without extra store reads.
4. **No presenter formatting:** Pure structured data returned.

#### Implementation Status

- **File Impact:** Fully implemented for single-file and multi-file. Resolves selectors and maps affected files and symbols using `toProjectRelativePath`.
- **Symbol Impact:** Implemented. Resolves selector and projects affected paths.
- **Spec Impact:** Implemented. Validates existence via `getSpec` and executes `analyzeSpecImpact`.
- **Public Export Impact:** **UNIMPLEMENTED.** Not present in `RunGraphImpactInput` or `runGraphImpact`.
- **Direction / Depth / Filters:** Normalized and forwarded for files, symbols, and specs.
- **Legacy Removal:** `displayPath` and `displayTargets` are omitted from all result interfaces.

#### Discrepancies

1. **CRITICAL: Public Export Route Impact is Completely Missing in SDK:**
   - _Observation:_ Requirement 1.4, Requirement 8, Requirement 10.4, and verify scenario "Public export route impact analysis" specify public export impact analysis (`export` and `from`/`surface`).
     In `run-graph-impact.ts`:
     - `RunGraphImpactInput` contains no `export`, `from`, or `surface` fields.
     - In `packages/cli/src/commands/graph/impact.ts`, lines 515–632 retain an internal private function `handlePublicExportImpact` which directly calls provider methods, bypassing SDK orchestration entirely.
   - _Dual Perspective:_
     - **Implementation Bug:** High severity. Host-agnostic SDK orchestration should allow CLI, MCP, and IDE plugins to execute all impact types uniformly.
     - **Spec Drift:** Initial implementation deferred public export impact.

#### Missing Tests

- Test verifying transient provider opening and closing for `runGraphImpact`.
- Test verifying `runGraphImpact` with spec targets (`{ spec: 'core:config' }`).
- Test verifying forwarding of `direction`, `depth`, and `filter` options to provider.
- Test verifying error states: empty file selector, file not found, ambiguous file selector, symbol `not_found`, symbol `ambiguous`, spec `GraphSpecNotFoundError`.
- Test verifying public export route impact (once implemented).

<!-- END PARTIAL: sdk -->

---

### Batch 3: Code Graph (`packages/code-graph`)

<!-- BEGIN PARTIAL: code-graph -->

# Spec Compliance Audit Report: `code-graph` Batch

**Change**: `unify-graph-project-relative-paths`  
**Auditor**: Subagent (`code-graph` batch)  
**Timestamp**: 2026-10-13T11:15:00Z  
**Assigned Specs**:

- `code-graph:symbol-model`
- `code-graph:document-model`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`

---

## Executive Summary

This compliance audit evaluates the `@specd/code-graph` package implementation and test suite against the four assigned specifications updated for the `unify-graph-project-relative-paths` change. The core architectural purpose of this change within `@specd/code-graph` (governed by **ADR-0028**) is to establish `projectRelativePath` as a first-class, natively owned domain property across all graph node types (`FileNode`, `DocumentNode`, and `SymbolNode`).

In SQLite storage, schema version **14** replaces legacy `config_relative_path` with `project_relative_path` in the `files` and `documents` tables, and denormalizes `project_relative_path` directly into the `symbols` table. This denormalization enables **zero-join** query execution across tens of thousands of symbols during search, traversal, and hotspot calculations. Furthermore, older databases (schema versions $\le 13$) are strictly rejected without migration, mandating a destructive re-index.

### Key Findings

1. **Overall Compliance**: The implementation across `@specd/code-graph` is fully aligned with the architectural design and domain model specifications.
   - `FileNode`, `DocumentNode`, and `SymbolNode` domain value objects cleanly expose `readonly projectRelativePath: string`.
   - Legacy `configRelativePath` has been completely eliminated from the domain, application, and infrastructure layers with 0 remaining references in source code.
   - SQLite schema version is bumped to **14**, DDL enforces `project_relative_path` columns and indexes on `files`, `documents`, and `symbols`, and drops `config_relative_path`.
   - Zero-join queries are implemented: `SYMBOL_ROW_COLUMNS`, `getExportedSymbols`, `getSymbolCallers`, and `searchSymbols` select `project_relative_path` directly from `symbols`.
   - The indexing pipeline (`index-code-graph.ts`) derives `projectRelativePath` from `projectRoot` and denormalizes it onto every extracted symbol.
   - Project-relative selector resolution (`resolve-graph-selector.ts`) resolves file selectors via `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath`.

2. **Error Wrapping Nuance on Open (`code-graph:sqlite-graph-store`)**:
   - The spec scenarios state that opening an incompatible database (e.g. schema 12 or 13 when expecting 14) rejects with `GraphSchemaIncompatibleError`.
   - In implementation, `SQLiteGraphDatabase.open()` catches `GraphSchemaIncompatibleError` and maps it via `getStorageRecoveryReason()` to `GraphStorageRecoveryRequiredError` with recovery reason `'SCHEMA_INCOMPATIBLE'`. Both inherit from `SpecdCodeGraphError`. This is an intended architectural design for storage recovery lifecycle management, though test assertions must check `GraphStorageRecoveryRequiredError`.

3. **Test Suite Status & Verification Gaps**:
   - The full `@specd/code-graph` test suite passes with **100% success** (63 test files, 837 tests passing cleanly).
   - However, specific verification scenarios added in the spec deltas lack direct, dedicated assertions:
     - `code-graph:symbol-model`: `test/domain/value-objects/symbol-node.spec.ts` lacks a test verifying that `SymbolNode` retains an explicitly supplied `projectRelativePath` (currently only tested with default fallbacks).
     - `code-graph:symbol-model`: `test/domain/value-objects/file-node.spec.ts` lacks tests for `FileNode` equality using canonical `path` when `projectRelativePath` differs, and for `projectRelativePath` containing `..` parent segments.
     - `code-graph:workspace-integration`: `test/application/services/resolve-graph-selector.spec.ts` does not test normalizing absolute path selectors against `projectRoot` or resolving paths containing parent segments (`../../`).
     - `code-graph:sqlite-graph-store`: `test/infrastructure/sqlite/sqlite-graph-store.spec.ts` tests schema versions $\le 13$ rejection, but does not test schema version 15 (forward incompatibility specified in `Scenario: Any other version is incompatible`). Additionally, no test explicitly seeds and reads back a symbol with a distinct `projectRelativePath` to verify denormalized persistence in isolation.

---

## Per-Spec Analysis

### Spec: `code-graph:symbol-model`

#### 1. Requirements Summary

- **Requirement: File node**:
  - `FileNode` SHALL represent a single source file in the workspace.
  - `path`: globally unique `{workspaceName}:{relativeToCodeRoot}`, forward-slash-normalized. Canonical identity.
  - `projectRelativePath`: forward-slash-normalized path from project root containing active `specd.yaml` to file on disk (e.g. `packages/core/src/index.ts`). May contain `..` segments when the file lives outside project root.
  - Equality: Two `FileNode` values are equal iff their `path` fields match. `projectRelativePath` MUST NOT replace the canonical path in relations or symbol IDs.
- **Requirement: Symbol node**:
  - `SymbolNode` SHALL represent a named code construct extracted from a file.
  - `id`: deterministic identifier computed from `filePath + kind + name + line + column`.
  - `filePath`: workspace-prefixed path of owning file.
  - `projectRelativePath`: forward-slash-normalized path from project root to file, denormalized from the owning file node at index time.
  - `line`, `column`, `endLine`, `endColumn`, `selectionRange`, `comment`.
  - Canonical identities remain unique primary keys across all node families.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/domain/value-objects/file-node.ts`:
  - `FileNode` interface exposes `readonly projectRelativePath: string`. `configRelativePath` is completely removed.
  - `createFileNode` normalizes backslashes to forward slashes for both `path` and `projectRelativePath`. Defaults `projectRelativePath` to `params.path` if omitted.
- `packages/code-graph/src/domain/value-objects/symbol-node.ts`:
  - `SymbolNode` interface exposes `readonly projectRelativePath: string`.
  - `createSymbolNode` normalizes backslashes and assigns `projectRelativePath: params.projectRelativePath ? params.projectRelativePath.replaceAll('\\', '/') : filePath`.
  - `computeSymbolId` preserves deterministic format `${filePath}:${kind}:${name}:${line}:${column}` using canonical `filePath`.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
  - Maps `projectRelativePath` for every discovered file and denormalizes it onto every extracted `SymbolNode` during analysis.

#### 3. Discrepancies

- None identified in implementation.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - `packages/code-graph/test/domain/value-objects/file-node.spec.ts`:
    - Normalizes `projectRelativePath` containing backslashes.
    - Preserves forward slashes in `projectRelativePath`.
    - Defaults `projectRelativePath` to `path` when omitted.
- **Missing Tests**:
  - `Scenario: FileNode equality still uses canonical path`.
  - `Scenario: FileNode projectRelativePath may include parent segments`.
  - `Scenario: SymbolNode carries denormalized projectRelativePath`.

---

### Spec: `code-graph:document-model`

#### 1. Requirements Summary

- **Requirement: DocumentNode properties**:
  - `DocumentNode` SHALL represent a textual non-code project resource.
  - Must include: `path`, `projectRelativePath`, `contentHash`, `content`, and `workspace`.
  - `projectRelativePath`: path relative to project root used for UI rendering and filesystem access.
- **Requirement: Reserved root namespace**:
  - Reserved `root:` prefix for node identities of project-global resources (`graph.includePaths`).
  - Format: `root:<project-relative-path>`.
- **Requirement: Textual classification fallback**:
  - Files without language adapter classified as `DocumentNode` if textual; binary files skipped.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/domain/value-objects/document-node.ts`:
  - Interface defines `path`, `projectRelativePath`, `contentHash`, `content`, and `workspace`.
- `packages/code-graph/src/infrastructure/sqlite/schema.ts`:
  - `documents` table persists `project_relative_path` and drops `config_relative_path`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
  - `findDocumentsByProjectRelativePath` provides indexed lookup.

#### 3. Discrepancies

- None identified.

#### 4. Test Coverage: COMPLETE

- Fully covered across unit, indexing use-case, and store contract tests.

---

### Spec: `code-graph:workspace-integration`

#### 1. Requirements Summary

- **Requirement: FileNode path and workspace semantics**:
  - Workspace Identity: `{workspaceName}:{relativeToCodeRoot}`.
  - Root Identity: `root:{projectRelativePath}`.
  - `path` remains canonical graph identity; each node also stores `projectRelativePath`.
- **Requirement: Project-relative file lookup**:
  - Resolving file selectors by path relative to project root containing active `specd.yaml`.
  - Computed during indexing, denormalized onto symbols, normalized to forward slashes without leading `./`.
  - CLI and hosts resolve unprefixed and absolute selectors back to canonical file nodes.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
  - Calculates `projectRelativePath = toPortableGraphPath(relative(options.projectRoot, absPath))`.
- `packages/code-graph/src/application/services/resolve-graph-selector.ts`:
  - `resolveFileSelector` resolves unprefixed project-relative paths and canonical paths.

#### 3. Discrepancies

- None identified in code logic.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - Resolves unprefixed project-relative selector `packages/core/src/index.ts` to `core:src/index.ts`.
- **Missing Tests**:
  - `Scenario: Absolute selector normalizes to projectRelativePath before lookup`.
  - `Scenario: Project-relative lookup supports parent segments`.

---

### Spec: `code-graph:sqlite-graph-store`

#### 1. Requirements Summary

- **Requirement: Persisted node storage**:
  - `File` and `Document` tables store `project_relative_path` and drop `config_relative_path`.
  - `Symbol` table stores denormalized `project_relative_path` for zero-join querying.
- **Requirement: Reference schema upgrade**:
  - Schema version MUST be **14** (`SQLITE_SCHEMA_VERSION = 14`).
  - Mismatch must reject ordinary reads with schema incompatibility error.
  - Re-indexing must recreate derived storage and rebuild search indexes without using `ALTER TABLE`.

#### 2. Implementation Status: COMPLIANT

- `packages/code-graph/src/infrastructure/sqlite/schema.ts`:
  - `SQLITE_SCHEMA_VERSION = 14`.
  - `files`, `documents`, and `symbols` contain `project_relative_path` and index columns.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`:
  - `SYMBOL_ROW_COLUMNS`, `getExportedSymbols`, `getSymbolCallers`, and `searchSymbols` select `project_relative_path` directly without joins.
  - Version verification rejects versions $\ne 14$.

#### 3. Discrepancies

- Exception type mapping: Throws `GraphStorageRecoveryRequiredError` wrapping `GraphSchemaIncompatibleError`.

#### 4. Test Coverage: PARTIAL

- **Covered**:
  - Rejection of schema versions 10, 11, 12, 13 without altering tables.
  - Reopening schema 14 without rebuilding stored rows.
  - `findFilesByProjectRelativePath` and `findDocumentsByProjectRelativePath`.
- **Missing Tests**:
  - `Scenario: Any other version is incompatible` (forward version 15).
  - `Scenario: Symbols table stores denormalized project_relative_path` (isolated assertion of denormalized readback).

<!-- END PARTIAL: code-graph -->

---

## Actionable Recommendations

1. **Implement Public Export Route Impact in `@specd/sdk`**:
   - Add `export` and `from`/`surface` to `RunGraphImpactInput`.
   - Migrate `handlePublicExportImpact` from `@specd/cli` into `packages/sdk/src/orchestration/run-graph-impact.ts`.
   - Ensure affected files and surfaces are projected to `projectRelativePath`.

2. **Delegate Public Export Route Impact from `@specd/cli`**:
   - Update `packages/cli/src/commands/graph/impact.ts` to delegate `--export ... --from ...` to `runGraphImpact`.
   - Eliminate raw canonical path output in public export impact.

3. **Align Input Parameter Aliases in `@specd/sdk`**:
   - Add `filePattern`, `includeSnippet`, and `exactFile` to `RunGraphSearchInput` and forward `exactFile` to `provider.search(...)`.
   - Add `filePath` alias to `RunGraphHotspotsInput`.
   - Add fallback path projection in `runGraphHotspots` if symbol does not already carry `projectRelativePath`.

4. **Address Test Coverage Deficits**:
   - Add SDK unit tests for option forwarding, parameter aliases, transient provider lifecycles, and spec impact.
   - Add CLI unit tests for document search results and symbol impact in JSON mode.
   - Add Code Graph tests for `FileNode` equality, parent `..` segments, and forward schema version 15 rejection.
