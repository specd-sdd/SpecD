# Spec Compliance Audit Report: `unify-graph-project-relative-paths`

**Audit Timestamp:** 2026-10-13T15:27:23Z  
**Mode:** Change (`--change unify-graph-project-relative-paths`)  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-152723/specs-compliance-change-unify-graph-project-relative-paths-20261013-152723.md`

---

## 1. Executive Summary

This comprehensive spec-compliance audit evaluates the implementation, test coverage, and specification alignment for change `unify-graph-project-relative-paths`. The primary goal of this change is to unify code-graph CLI results and SDK orchestrations to consistently expose `projectRelativePath` across symbols, files, hotspots, and impact analyses, and to eliminate legacy path properties (`configRelativePath`, `displayPath`, `displayTargets`).

In the underlying database layer, SQLite schema version **14** (governed by **ADR-0028**) introduces native `project_relative_path` across `files`, `documents`, and denormalized into `symbols`, enabling **zero-join** queries for high-performance symbol search, hotspot ranking, and traversal.

### Aggregated Metrics

| Metric                                  |     Count     | Details                                                                           |
| :-------------------------------------- | :-----------: | :-------------------------------------------------------------------------------- |
| **Total Specs Audited**                 |    **10**     | 4 in `@specd/code-graph`, 3 in `@specd/sdk`, 3 in `@specd/cli`                    |
| **Total Requirements Audited**          |    **77**     | 37 (code-graph), 12 (sdk), 28 (cli)                                               |
| **Total Scenarios Audited**             |    **200**    | 92 (code-graph), 29 (sdk), 79 (cli)                                               |
| **Scenarios Passed**                    |    **200**    | **100.0%** passing rate                                                           |
| **Scenarios with Discrepancy / Issues** |     **0**     | All previously identified discrepancies are resolved                              |
| **Automated Tests Passing**             |  **1,044+**   | 844 (`@specd/code-graph`) + 110 (`@specd/sdk`) + 90 (`@specd/cli` graph commands) |
| **Overall Test Suite Status**           | **100% PASS** | Zero failing tests across all packages                                            |

---

## 2. Key Findings & Remediation Summary

1. **Native Domain & Storage Unification (`@specd/code-graph`)**:
   - `FileNode`, `DocumentNode`, and `SymbolNode` expose `readonly projectRelativePath: string`.
   - SQLite schema version is 14; `files` and `documents` drop `config_relative_path`; `symbols` denormalizes `project_relative_path`.
   - Zero-join queries select `project_relative_path` directly from `symbols`.
   - Incompatible older schemas ($\le 13$) and future schemas ($15+$) are rejected without migration, forcing a clean re-index.
   - All scenario requirements pass.

2. **SDK Orchestration Layer (`@specd/sdk`)**:
   - `runGraphSearch`, `runGraphHotspots`, and `runGraphImpact` provide host-agnostic query and impact analysis.
   - Public export route impact analysis (`export`, `from`/`surface`) is fully implemented in `runGraphImpact`.
   - Input options and parameter aliases (`filePattern`, `exactFile`, `includeSnippet`, `filePath`) are aligned.
   - Result projection for `includeSnippet` correctly outputs snippets for symbols, files, specs, and documents.
   - Pure path projections operate without database or provider reads.

3. **CLI Presentation Layer (`@specd/cli`)**:
   - `search.ts`, `hotspots.ts`, and `impact.ts` fully delegate business logic to SDK orchestrators.
   - Output across text, JSON, and TOON formats consistently exposes `projectRelativePath`.
   - Legacy `configRelativePath`, `displayPath`, and `displayTargets` are completely eliminated.
   - Verify scenario for single-file impact is aligned to `symbols` matching the domain model.

---

## 3. Discrepancies & Recommendations

- **Audit Result:** **Clean (0 discrepancies, 0 blockers)**.
- All 200 scenarios across all 10 specifications pass verification against implementation and automated test suites.
- All type checks, lint checks, and unit tests succeed.

---

## 4. Detailed Findings

### 4.1. Partial Report: `@specd/code-graph` Batch

# Spec Compliance Audit: Code-Graph Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T15:27:23Z  
**Batch Scope:** `code-graph:symbol-model`, `code-graph:document-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-152723/_partial-code-graph.md`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the `@specd/code-graph` package implementation and test suite against the four assigned specifications updated for the `unify-graph-project-relative-paths` change. The core architectural purpose of this change within `@specd/code-graph` (governed by **ADR-0028**) is to establish `projectRelativePath` as a first-class, natively owned domain property across all graph node types (`FileNode`, `DocumentNode`, and `SymbolNode`).

In SQLite storage, schema version **14** replaces legacy `config_relative_path` with `project_relative_path` in the `files` and `documents` tables, and denormalizes `project_relative_path` directly into the `symbols` table. This denormalization enables **zero-join** query execution across tens of thousands of symbols during search, traversal, and hotspot calculations. Furthermore, older databases (schema versions $\le 13$) and any future incompatible versions are strictly rejected without migration, mandating a destructive re-index.

### Key Audit Findings

1. **Overall Compliance: 100% COMPLIANT**:
   - `FileNode`, `DocumentNode`, and `SymbolNode` domain value objects cleanly expose `readonly projectRelativePath: string`.
   - Legacy `configRelativePath` has been completely eliminated from the domain, application, and infrastructure layers with 0 remaining references in source code.
   - SQLite schema version is set to **14**, DDL enforces `project_relative_path` columns and indexes on `files`, `documents`, and `symbols`, and drops `config_relative_path`.
   - Zero-join queries are implemented: `SYMBOL_ROW_COLUMNS`, `getExportedSymbols`, `getSymbolCallers`, and `searchSymbols` select `project_relative_path` directly from `symbols`.
   - Rejection logic strictly blocks version $\le 13$ and version $\ge 15$ databases without running migrations, cleanly throwing `GraphSchemaIncompatibleError`.

2. **Automated Test Suite Status**:
   - 844 automated unit and integration tests in `@specd/code-graph` pass with 100% success rate.
   - All previously flagged test gaps (equality, parent `..` segments, selector resolution, forward schema rejection) are verified by concrete tests in `file-node.spec.ts`, `symbol-node.spec.ts`, `document-node.spec.ts`, and SQLite test suites.

---

## 2. Summary Counts

| Metric                   |  Count  | Details                                                                                                                     |
| :----------------------- | :-----: | :-------------------------------------------------------------------------------------------------------------------------- |
| **Total Specs Audited**  |  **4**  | `code-graph:symbol-model`, `code-graph:document-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store` |
| **Requirements Audited** | **37**  | Full coverage of symbol, document, workspace, and SQLite requirements                                                       |
| **Scenarios Audited**    | **92**  | All GIVEN/WHEN/THEN scenarios verified against implementation and tests                                                     |
| **Scenarios Passing**    | **92**  | 100% compliance                                                                                                             |
| **Discrepancies Found**  |  **0**  | Clean alignment across domain, schema, and queries                                                                          |
| **Unit Tests Passing**   | **844** | 63 test files, 844 tests passing                                                                                            |

---

## 3. Detailed Specification Assessments

### 3.1 `code-graph:symbol-model`

- **Domain Model**: `FileNode` and `SymbolNode` expose `readonly projectRelativePath: string`.
- **Identity & Equality**: `FileNode` equality remains based on canonical `path` (`workspace:path`), with `projectRelativePath` preserved as repository-relative projection.
- **Symbol Id**: Deterministic symbol ID generation preserves workspace prefix and range enrichment without altering canonical symbol keys.
- **Denormalization**: `SymbolNode` carries `projectRelativePath` directly from the owning file.
- **Verification**: Verified by `packages/code-graph/test/domain/value-objects/file-node.spec.ts` and `symbol-node.spec.ts`.

### 3.2 `code-graph:document-model`

- **Domain Model**: `DocumentNode` exposes `readonly projectRelativePath: string`, `readonly path: string`, `readonly contentHash: string`, `readonly content: string`, `readonly workspace: string`.
- **No Legacy Fields**: No `configRelativePath` in `DocumentNode`.
- **Verification**: Verified by `packages/code-graph/test/domain/value-objects/document-node.spec.ts`.

### 3.3 `code-graph:workspace-integration`

- **Path Mapping**: Project-relative paths derive correctly from repo root to workspace code roots, including multi-workspace layouts and parent relative segments (`..`).
- **Selector Resolution**: CLI selectors support canonical (`core:src/index.ts`), project-relative (`packages/core/src/index.ts`), and absolute path lookups.
- **Verification**: Verified by `packages/code-graph/test/domain/services/` and `packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts`.

### 3.4 `code-graph:sqlite-graph-store`

- **Schema Version**: `GRAPH_SCHEMA_VERSION = 14`.
- **Tables & DDL**:
  - `files`: columns `canonical_path`, `project_relative_path`, `workspace`, `content_hash`, `source_content`, `category`.
  - `documents`: columns `canonical_path`, `project_relative_path`, `workspace`, `content_hash`, `content`.
  - `symbols`: columns `symbol_id`, `file_path`, `project_relative_path`, `kind`, `name`, `line`, `col`, etc.
  - No `config_relative_path` column in any table.
- **Zero-Join Symbol Retrieval**: Symbol search, callers, exports, and hotspot lookups read `project_relative_path` directly from `symbols`.
- **Schema Compatibility Gate**: Rejects schema versions $\le 13$ and $\ge 15$ with `GraphSchemaIncompatibleError`.
- **Verification**: Verified by `packages/code-graph/test/infrastructure/sqlite/` suites.

---

### 4.2. Partial Report: `@specd/sdk` Batch

# Spec Compliance Audit: SDK Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T15:27:23Z  
**Batch Scope:** `sdk:run-graph-search`, `sdk:run-graph-hotspots`, `sdk:run-graph-impact`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-152723/_partial-sdk.md`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the `@specd/sdk` orchestration layer implementations under change `unify-graph-project-relative-paths`. The audited specifications are:

- `sdk:run-graph-search`
- `sdk:run-graph-hotspots`
- `sdk:run-graph-impact`

### Key Architectural & Implementation Achievements

1. **Host-Agnostic Graph Orchestration**:
   - `runGraphSearch`, `runGraphHotspots`, and `runGraphImpact` encapsulate graph lifecycle management, input validation, provider invocation, and path projection.
   - Transient providers are opened cleanly via `withOpenGraphProvider` and closed on completion or error.
   - Caller-provided open providers are accepted and executed without premature closing.

2. **Consistent Project-Relative Path Projection**:
   - `runGraphSearch`: Projects `projectRelativePath` onto symbols (declarations, hits, and logical targets), files, and documents.
   - `runGraphHotspots`: Projects `projectRelativePath` and owning `workspace` onto all ranked hotspot entries.
   - `runGraphImpact`: Projects `projectRelativePath` onto input targets, multi-file targets (`projectRelativeTargets`), symbol file paths, affected files, affected symbols, and public export surfaces (`projectRelativeSurface`).
   - Legacy path properties (`configRelativePath`, `displayPath`, and `displayTargets`) are completely absent from returned objects.

3. **Input Option Aliases & Projection Alignment**:
   - `file` and `filePattern` map interchangeably.
   - `file` and `filePath` map interchangeably.
   - `snippet` and `includeSnippet` map interchangeably, and output projection checks `includeSnippet` across symbols, files, specs, and documents.

4. **Zero Provider / Database Reads During Projection**:
   - Projections operate purely using domain node fields or project configuration without querying the provider or database.

5. **Automated Test Suite Status**:
   - 13 test files and 110 tests in `@specd/sdk` pass with 100% success rate.
   - Dedicated orchestration test suites (`run-graph-search.spec.ts`, `run-graph-hotspots.spec.ts`, `run-graph-impact.spec.ts`, and `project-relative-path.spec.ts`) verify all scenario behaviors.

---

## 2. Summary Counts

| Metric                   |  Count  | Details                                                                   |
| :----------------------- | :-----: | :------------------------------------------------------------------------ |
| **Total Specs Audited**  |  **3**  | `sdk:run-graph-search`, `sdk:run-graph-hotspots`, `sdk:run-graph-impact`  |
| **Requirements Audited** | **12**  | Orchestration, legacy field elimination, pure projection, structured data |
| **Scenarios Audited**    | **29**  | All GIVEN/WHEN/THEN scenarios verified against implementation and tests   |
| **Scenarios Passing**    | **29**  | 100% compliance                                                           |
| **Discrepancies Found**  |  **0**  | All alias projections and path models verified                            |
| **Unit Tests Passing**   | **110** | 13 test files, 110 tests passing                                          |

---

## 3. Detailed Specification Assessments

### 3.1 `sdk:run-graph-search`

- **Orchestration**: `runGraphSearch` supports transient providers and open caller-supplied providers.
- **Path Projections**: Exposes `projectRelativePath` across declarations, hits, logical targets, files, and documents.
- **Legacy Elimination**: No `configRelativePath` or `displayPath` in returned data.
- **Aliases**: `includeSnippet` and `snippet` alias correctly for query and result projection.
- **Verification**: Verified by `packages/sdk/test/orchestration/run-graph-search.spec.ts`.

### 3.2 `sdk:run-graph-hotspots`

- **Orchestration**: `runGraphHotspots` manages provider lifecycle and forwards ranking options.
- **Path Projections**: Exposes `projectRelativePath` and `workspace` on all hotspot entries.
- **Legacy Elimination**: No `displayPath` in hotspot entries.
- **Verification**: Verified by `packages/sdk/test/orchestration/run-graph-hotspots.spec.ts`.

### 3.3 `sdk:run-graph-impact`

- **Orchestration**: `runGraphImpact` supports single-file, multi-file, symbol, spec, and public export impact analyses.
- **Path Projections**: Exposes `canonicalPath`, `projectRelativePath`, `projectRelativeTargets`, `projectRelativeSurface`.
- **Legacy Elimination**: No `displayPath` or `displayTargets` in results.
- **Verification**: Verified by `packages/sdk/test/orchestration/run-graph-impact.spec.ts`.

---

### 4.3. Partial Report: `@specd/cli` Batch

# Spec Compliance Audit: CLI Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T15:27:23Z  
**Batch Scope:** `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-impact`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-152723/_partial-cli.md`  
**Auditor Mode:** Read-only compliance audit

---

## 1. Executive Summary

This compliance audit evaluates the CLI command implementations under change `unify-graph-project-relative-paths`. The audited commands are:

- `specd graph search` (`cli:graph-search`)
- `specd graph hotspots` (`cli:graph-hotspots`)
- `specd graph impact` (`cli:graph-impact`)

### Key Architectural & Implementation Achievements

1. **Full Delegation to SDK Orchestration Layer**:
   - `search.ts` delegates querying and path projection directly to `sdk:run-graph-search` via `runGraphSearch(hostContext, ...)`.
   - `hotspots.ts` delegates hotspot ranking and path projection to `sdk:run-graph-hotspots` via `runGraphHotspots(hostContext, ...)`.
   - `impact.ts` delegates all four analysis forms (files, multi-files, symbols, specs, public exports) to `sdk:run-graph-impact` via `runGraphImpact(hostContext, ...)`.
   - Adheres strictly to `default:_global/architecture`: CLI commands contain presentation and CLI argument parsing only; graph querying, traversal, and configuration-driven path projections are handled within `@specd/sdk`.

2. **Project-Relative Path Consistency Across All Formats**:
   - In `search`:
     - Text output displays `projectRelativePath` for symbol declarations, matched export routes (`matched export: <project-relative-path>::<exported-name>`), files (`[workspace] <projectRelativePath>`), and documents (`[workspace] <projectRelativePath>`).
     - JSON and TOON structured output preserves `projectRelativePath` across symbol hits, declaration locations, public bindings, file matches, and documents.
     - Legacy `configRelativePath` has been completely eliminated from structured file and document entries.
   - In `hotspots`:
     - Text output displays `[workspace] <projectRelativePath>:<line>`.
     - JSON and TOON structured output exposes `projectRelativePath` and derived `workspace` on each entry.
     - Legacy `displayPath` has been completely eliminated from hotspot entries and symbol nodes.
   - In `impact`:
     - Text output formats all input targets, affected files, changed symbol locations, and breakdown entries as project-relative paths.
     - Single-file JSON/TOON output exposes `canonicalPath`, `projectRelativePath`, and `symbols`.
     - Multi-file JSON/TOON output exposes `targets` (canonical) and `projectRelativeTargets` (project-relative).
     - Symbol impact exposes `projectRelativePath` and canonical `symbol.filePath`.
     - Legacy `displayPath` and `displayTargets` have been completely removed from structured output.

3. **Pure Display-Path Projection & Zero Provider Reads**:
   - Display path projections rely solely on project configuration without issuing database reads, availability probes, or store operations.
   - Confirmed by unit tests asserting zero `getFile` or `getDocument` calls during output formatting.

4. **Resolved Spec Alignment**:
   - Scenario `JSON output includes symbols for file impact` in `specs/cli/graph-impact/verify.md` is aligned with `symbols` property, resolving previous naming drift.

5. **Clean Builds, Typing, and Linting**:
   - All 90 automated unit tests in `graph-search.spec.ts`, `graph-hotspots.spec.ts`, and `graph-impact.spec.ts` pass without failure.
   - All 1134 CLI package unit tests pass.
   - Typechecking (`tsc --noEmit`) and ESLint (`eslint .`) pass cleanly with 0 errors and 0 warnings.

---

## 2. Summary Counts

| Metric                   | Count  | Details                                                                 |
| :----------------------- | :----: | :---------------------------------------------------------------------- |
| **Total Specs Audited**  | **3**  | `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-impact`            |
| **Requirements Audited** | **28** | Command signatures, output formatting, filters, semantic lanes          |
| **Scenarios Audited**    | **79** | All GIVEN/WHEN/THEN scenarios verified against implementation and tests |
| **Scenarios Passing**    | **79** | 100% compliance                                                         |
| **Discrepancies Found**  | **0**  | Clean alignment across presentation, options, and formatting            |
| **Unit Tests Passing**   | **90** | Graph CLI unit tests passing (1134 total CLI tests passing)             |

---

## 3. Detailed Specification Assessments

### 3.1 `cli:graph-search`

- **Presentation**: Text mode groups by category, shows workspace in brackets, renders project-relative paths.
- **Structured Data**: JSON and TOON include `projectRelativePath` for symbols, files, and documents; omit `configRelativePath` and `displayPath`.
- **Options & Filters**: Kinds, file wildcards, workspace, category filters, and `--spec-content` behavior fully verified.
- **Verification**: Verified by `packages/cli/test/commands/graph-search.spec.ts`.

### 3.2 `cli:graph-hotspots`

- **Presentation**: Text mode outputs ranked table with workspace-qualified project-relative file location.
- **Structured Data**: JSON outputs `entries` with `projectRelativePath` and `workspace`, without `displayPath`.
- **Omission Notices**: Reports excluded test/ignored files in text mode and JSON `omittedCounts`.
- **Verification**: Verified by `packages/cli/test/commands/graph-hotspots.spec.ts`.

### 3.3 `cli:graph-impact`

- **Presentation**: Text output renders risk levels, counts, grouped changed symbols, and project-relative paths.
- **Structured Data**: Single-file JSON exposes `canonicalPath`, `projectRelativePath`, and `symbols` without `displayPath`. Multi-file JSON exposes `targets` and `projectRelativeTargets` without `displayTargets`. Symbol JSON exposes `projectRelativePath`.
- **Verification**: Verified by `packages/cli/test/commands/graph-impact.spec.ts`.
