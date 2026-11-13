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
