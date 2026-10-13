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
