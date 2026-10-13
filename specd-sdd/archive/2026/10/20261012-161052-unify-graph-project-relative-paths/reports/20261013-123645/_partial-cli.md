# Spec Compliance Audit: CLI Batch (`unify-graph-project-relative-paths`)

**Audit Timestamp:** 2026-10-13T12:44:00Z  
**Batch Scope:** `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-impact`  
**Change Directory:** `specd-sdd/changes/20261012-161052-unify-graph-project-relative-paths`  
**Report File:** `reports/20261013-123645/_partial-cli.md`  
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
     - Single-file JSON/TOON output exposes `canonicalPath` and `projectRelativePath`.
     - Multi-file JSON/TOON output exposes `targets` (canonical) and `projectRelativeTargets` (project-relative).
     - Symbol impact exposes `projectRelativePath` and canonical `symbol.filePath`.
     - Legacy `displayPath` and `displayTargets` have been completely removed from structured output.
3. **Pure Display-Path Projection & Zero Provider Reads**:
   - Display path projections rely solely on project configuration without issuing database reads, availability probes, or store operations.
   - Confirmed by unit tests asserting zero `getFile` or `getDocument` calls during output formatting.
4. **Clean Builds, Typing, and Linting**:
   - All 90 automated unit tests in `graph-search.spec.ts`, `graph-hotspots.spec.ts`, and `graph-impact.spec.ts` pass without failure.
   - Typechecking (`tsc --noEmit`) and ESLint (`eslint .`) pass cleanly with 0 errors and 0 warnings.

### Discrepancies & Test Gaps

1. **Field Naming Discrepancy in Single-File Impact JSON Output (`symbols` vs `changedSymbols`)**:
   - `specs/cli/graph-impact/verify.md` defines scenario `JSON output includes changedSymbols for file impact`, requiring the output object to contain `changedSymbols`.
   - The implementation in `impact.ts:684` and `ImpactResult` emits `symbols: result.symbols`.
   - `graph-impact.spec.ts:1272` tests for `symbols` rather than `changedSymbols`.
   - This represents a spec drift between the verify scenario (which borrowed the text header `Changed symbols:`) and the domain model property `symbols`.
2. **Missing Unit Test Coverage for Edge Cases**:
   - `search.ts`: Rejection of `--spec-content` in text mode exits with code 1, but is not asserted in test suites.
   - `search.ts`: Spec results in text mode (`[workspace] <specId>`) are not exercised in text mode tests.
   - `hotspots.ts`: Empty result set producing `No hotspots found.` in text mode is implemented but lacks an automated test assertion.
   - All three commands: Provider busy (`GRAPH_BUSY`) or infrastructure failure exiting with code 3 is handled by `withProvider` and `handleError`, but because `withProvider` is mocked in the command test suites, this exit code 3 behavior is unverified in command unit tests.

---

## 2. Summary Counts

| Metric                                      | Count  | Details                                                                                     |
| :------------------------------------------ | :----: | :------------------------------------------------------------------------------------------ |
| **Specs Audited**                           | **3**  | `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-impact`                                |
| **Requirements Checked**                    | **28** | 7 in search, 9 in hotspots, 12 in impact                                                    |
| **Requirements Satisfied**                  | **27** | Fully implemented and conforming                                                            |
| **Requirements with Discrepancy**           | **1**  | Output format in `cli:graph-impact` (`symbols` vs `changedSymbols` property name)           |
| **Verification Scenarios Checked**          | **79** | 39 in search, 17 in hotspots, 23 in impact                                                  |
| **Verification Scenarios Passed**           | **78** | Validated against implementation                                                            |
| **Verification Scenarios with Discrepancy** | **1**  | `Scenario: JSON output includes changedSymbols for file impact`                             |
| **Automated Command Tests in Scope**        | **90** | 19 search, 21 hotspots, 50 impact (all passing)                                             |
| **Identified Missing / Incomplete Tests**   | **6**  | `--spec-content` text error, empty hotspots text, specs in search text, exit code 3 on busy |

---

## 3. Detailed Per-Spec Compliance Analysis

### 3.1. `cli:graph-search`

- **Spec Path:** `specs/cli/graph-search/spec.md` (merged with `deltas/cli/graph-search/spec.md.delta.yaml`)
- **Verify Path:** `specs/cli/graph-search/verify.md` (merged with `deltas/cli/graph-search/verify.md.delta.yaml`)
- **Implementation File:** [`packages/cli/src/commands/graph/search.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/search.ts)
- **Primary Test File:** [`packages/cli/test/commands/graph-search.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-search.spec.ts)
- **Supporting Test Files:** [`packages/cli/test/commands/graph/normalize-snippet.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph/normalize-snippet.spec.ts)

#### Requirements Breakdown & Implementation Status

1. **Requirement: Output format**
   - **Delegation to SDK:** `search.ts` delegates graph querying and path projection directly to `sdk:run-graph-search` via `runGraphSearch(hostContext, ...)`.
     - _Status:_ **IMPLEMENTED**.
   - **Category ordering:** Deterministic order `symbols`, `files`, `specs`, `documents`.
     - _Status:_ **IMPLEMENTED**. Lines 298, 351, 375, 387 in text; structured returns object with fixed keys.
   - **Symbol results:** Structured symbol entries expose `projectRelativePath` on every declaration location (`location.projectRelativePath`), symbol hit (`symbol.projectRelativePath`), and logical target / public binding surface (`projectRelativePath`). Text mode outputs `matched export: <project-relative-path>::<exported-name>` and `declaration: <project-relative-path>:<line>:<col>`. Serialized canonical IDs are suppressed.
     - _Status:_ **IMPLEMENTED**. Lines 306-342.
   - **File results:** Structured entries expose `workspace`, canonical `path`, `projectRelativePath`, `matches`, `totalMatches`, `omittedMatches`. Structured entries SHALL NOT expose `configRelativePath`. Text mode renders `[<workspace>] <projectRelativePath>` and `N more matches in this file`.
     - _Status:_ **IMPLEMENTED**. Lines 353-372.
   - **Document results:** Structured entries expose `workspace`, canonical `path`, `projectRelativePath`, `score`, `startLine`, `endLine`. Structured entries SHALL NOT expose `configRelativePath`. Text mode renders `[<workspace>] <projectRelativePath>` and line range.
     - _Status:_ **IMPLEMENTED**. Lines 387-399.
   - **Snippet handling:** With `--snippet`, snippet block rendered with line range header `snippet @ L<start>-L<end>:` and markers `>>>` / `<<<`. Indentation normalized and terminal escape sequences stripped. Without `--snippet`, previews omitted.
     - _Status:_ **IMPLEMENTED**. `normalize-snippet.ts` and `search.ts:69-79`.
   - **`--spec-content` flag:** Only valid with `--format json` or `--format toon`. In text format, fails with exit code 1.
     - _Status:_ **IMPLEMENTED**. Lines 210-212.
   - **Omission notice:** Displays `ℹ Excluded from results: ...` in text mode when `omittedCounts` has omissions. In JSON/TOON, output object includes `omittedCounts: { tests: number, ignored: number }`.
     - _Status:_ **IMPLEMENTED**. Lines 405-409.

2. **Requirement: Command signature & filters**
   - Options supported: `<query>`, `--symbols`, `--files`, `--specs`, `--documents`, `--snippet`, `--kind`, `--config`, `--path`, `--file`, `--workspace`, `--exclude-path`, `--exclude-workspace`, `--limit`, `--include-tests`, `--include-ignored`, `--all`, `--category`, `--spec-content`, `--format`.
   - Defaults: When no category flags are passed, all four categories (`symbols`, `files`, `specs`, `documents`) are queried.
     - _Status:_ **IMPLEMENTED**. Lines 240, 263-270.

3. **Requirement: Search behaviour, Reference-aware results, Semantic candidate lanes**
   - Delegated to `sdk:run-graph-search` and Code Graph provider. CLI accurately passes all options and presents the structured results.
     - _Status:_ **IMPLEMENTED**.

4. **Requirement: Error cases**
   - Mutually exclusive `--config` and `--path` fail fast with code 1.
     - _Status:_ **IMPLEMENTED**. Lines 217-219.
   - Invalid kind token or category token fails before query execution.
     - _Status:_ **IMPLEMENTED**. Lines 220, 241-247.
   - Provider open failure, busy (`GRAPH_BUSY`), or stale (`GRAPH_PROVIDER_STALE`) exits with code 3.
     - _Status:_ **IMPLEMENTED**. `withProvider` invokes `handleError`, mapping `GRAPH_BUSY` and unexpected errors to exit code 3.

#### Verification Scenarios Matrix (`verify.md`)

| Scenario                                                                       | Code Status | Test Coverage |     Verdict     | Notes                                                                                                         |
| :----------------------------------------------------------------------------- | :---------: | :-----------: | :-------------: | :------------------------------------------------------------------------------------------------------------ |
| `Text output groups by category`                                               |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:312`.                                                                         |
| `Text output omits snippet blocks by default`                                  |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:319`.                                                                         |
| `Text output renders snippets when requested`                                  |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:232`.                                                                         |
| `Category headers show explicit limits in text mode`                           |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:312`.                                                                         |
| `JSON output includes workspace and scores but excludes full content`          |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:410, 722`. Asserts `projectRelativePath` and absence of `configRelativePath`. |
| `JSON output includes snippet only when requested`                             |  Satisfied  |     High      |    ✅ PASSED    | Tested in `run-graph-search.spec.ts` & `graph-search.spec.ts:505`.                                            |
| `Toon output omits snippet unless requested`                                   |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:456`.                                                                         |
| `Toon output includes snippet when requested`                                  |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:456`.                                                                         |
| `JSON with --spec-content includes full spec content`                          |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:505`.                                                                         |
| `--spec-content with text format fails`                                        |  Satisfied  |     None      | ⚠️ **UNTESTED** | Implemented in `search.ts:210-212`, but not asserted in test suite.                                           |
| `Text output shows workspace in brackets`                                      |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:313`.                                                                         |
| `Text output groups document results separately`                               |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:764`.                                                                         |
| `Structured output includes documents array`                                   |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:722`.                                                                         |
| `Text-mode symbol snippet uses normalized indentation`                         |  Satisfied  |     High      |    ✅ PASSED    | Tested in `normalize-snippet.spec.ts:11`.                                                                     |
| `Text-mode snippet block uses line range header and custom markers`            |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:308`.                                                                         |
| `Text-mode snippet sanitizes terminal control sequences`                       |  Satisfied  |     High      |    ✅ PASSED    | Tested in `normalize-snippet.spec.ts:49, 55`.                                                                 |
| `Exact identity hit does not require raw boosted score as primary cue`         |  Satisfied  |     High      |    ✅ PASSED    | Output displays `matchTier` and `matchReasons` instead of raw score.                                          |
| `File result groups precise occurrences`                                       |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:232`.                                                                         |
| `Match and snippet ranges remain distinct`                                     |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:232`.                                                                         |
| `Structured category order includes files`                                     |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:430`.                                                                         |
| `Structured symbol output retains matched bindings`                            |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:431`.                                                                         |
| `Text favors declaration and matched export`                                   |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:319`.                                                                         |
| `Omitted file matches are summarized`                                          |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:345`.                                                                         |
| `Structured file output retains truncation counts`                             |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:444`.                                                                         |
| `Omission notice displayed in text mode when search prunes non-admitted files` |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:677`.                                                                         |
| `Search JSON output includes omittedCounts`                                    |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:701`.                                                                         |
| `Search both categories by default / Default request includes four categories` |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:177`.                                                                         |
| `Files category is distinct from file-path filter`                             |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:194`.                                                                         |
| `CLI delegates one unified request`                                            |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:177`.                                                                         |
| `Filter by multiple symbol kinds`                                              |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:208`.                                                                         |
| `Filter by file path wildcard`                                                 |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:204`.                                                                         |
| `Filter by workspace`                                                          |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:206`.                                                                         |
| `Filter by category`                                                           |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:583`.                                                                         |
| `Filter by comma-separated categories`                                         |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:607`.                                                                         |
| `Include tests alongside source`                                               |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:652`.                                                                         |
| `Invalid kind token fails before query execution`                              |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-search.spec.ts:543`.                                                                         |
| `Search surfaces provider busy after open`                                     |  Satisfied  |     None      | ⚠️ **UNTESTED** | Implemented via `handleError` (exit code 3), but `withProvider` is mocked in command test.                    |

---

### 3.2. `cli:graph-hotspots`

- **Spec Path:** `specs/cli/graph-hotspots/spec.md` (merged with `deltas/cli/graph-hotspots/spec.md.delta.yaml`)
- **Verify Path:** `specs/cli/graph-hotspots/verify.md` (merged with `deltas/cli/graph-hotspots/verify.md.delta.yaml`)
- **Implementation File:** [`packages/cli/src/commands/graph/hotspots.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/hotspots.ts)
- **Primary Test File:** [`packages/cli/test/commands/graph-hotspots.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-hotspots.spec.ts)

#### Requirements Breakdown & Implementation Status

1. **Requirement: Output format**
   - **Delegation to SDK:** `hotspots.ts` delegates hotspot retrieval and path projection to `sdk:run-graph-hotspots`.
     - _Status:_ **IMPLEMENTED**. Lines 207-223.
   - **Text mode table:** Prints ranked table with total returned entries, total symbol count, score, risk level, cross-workspace callers (`XWS`), kind, symbol name, and file location formatted as `[<workspace>] <projectRelativePath>:<line>`.
     - _Status:_ **IMPLEMENTED**. Lines 244-254.
   - **Empty results:** In text mode, prints `No hotspots found.` when entry list is empty.
     - _Status:_ **IMPLEMENTED**. Lines 226-235.
   - **Structured mode (JSON/TOON):** Emits object with `totalSymbols`, `entries`, and `omittedCounts`. Each entry includes symbol payload, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, `riskLevel`, derived `workspace`, and `projectRelativePath`. Hotspot entries SHALL NOT expose `displayPath`.
     - _Status:_ **IMPLEMENTED**. Lines 262-264.
   - **Omission notice:** Text mode prints omission notice when `omittedCounts` indicates exclusions.
     - _Status:_ **IMPLEMENTED**. Lines 228-232, 255-259.

2. **Requirement: Command signature & Kind filter semantics**
   - Default kinds `class,method,function`, score > 0, risk >= MEDIUM, limit 20. Explicit `--kind` completely replaces default kinds.
     - _Status:_ **IMPLEMENTED**. Lines 31-38, 57-59, 209.
   - `--include-importer-only` explicitly widens candidate set.
     - _Status:_ **IMPLEMENTED**. Lines 76-78, 218.
   - Category flags (`--include-tests`, `--include-ignored`, `--all`, `--category`) validated and forwarded.
     - _Status:_ **IMPLEMENTED**. Lines 186-200, 219-222.

3. **Requirement: Context resolution**
   - `--config` and `--path` supported; mutually exclusive.
     - _Status:_ **IMPLEMENTED**. Lines 156-158.
   - Config discovery and bootstrap mode handled via `resolveGraphCliContext`.
     - _Status:_ **IMPLEMENTED**. Lines 167-176.

4. **Requirement: Backpressure-safe presentation**
   - Renders results strictly from the returned `HotspotResult` without issuing per-entry graph reads.
     - _Status:_ **IMPLEMENTED**. Pure in-memory formatting.

5. **Requirement: Error cases & CLI documentation**
   - Mutually exclusive flags exit 1.
     - _Status:_ **IMPLEMENTED**. Line 157.
   - Infrastructure error / `GRAPH_BUSY` exits 3.
     - _Status:_ **IMPLEMENTED**. Handled via `withProvider`/`handleError`.
   - Command help and `cli-reference.md` document default kinds and widening switch.
     - _Status:_ **IMPLEMENTED**. Verified by tests.

#### Verification Scenarios Matrix (`verify.md`)

| Scenario                                                                | Code Status | Test Coverage |     Verdict     | Notes                                                                                                              |
| :---------------------------------------------------------------------- | :---------: | :-----------: | :-------------: | :----------------------------------------------------------------------------------------------------------------- |
| `Text output shows ranked hotspot table`                                |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:419`. Asserts `[default] src/service.ts:10`.                                     |
| `Empty result set in text mode`                                         |  Satisfied  |     None      | ⚠️ **UNTESTED** | Implemented in `hotspots.ts:227`, but `No hotspots found.` is not asserted in any unit test.                       |
| `JSON output includes derived workspace field`                          |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:355`. Verifies `projectRelativePath`, `workspace`, and absence of `displayPath`. |
| `Text output shows omission notice when items excluded`                 |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:323`.                                                                            |
| `JSON output includes omittedCounts`                                    |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:340`.                                                                            |
| `Default hotspot filters apply when no explicit overrides are provided` |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:101`.                                                                            |
| `Explicit limit changes only the limit`                                 |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:112`.                                                                            |
| `Explicit min-risk changes only the risk threshold`                     |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:150`.                                                                            |
| `Explicit min-score changes only the score threshold`                   |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:162`.                                                                            |
| `Explicit importer-only inclusion widens the query`                     |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:174`.                                                                            |
| `Category flags passed to hotspots`                                     |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:312`.                                                                            |
| `Category filter accepts comma-separated categories`                    |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:301`.                                                                            |
| `Explicit config path bypasses discovery`                               |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:70`.                                                                             |
| `Bootstrap mode via explicit path ignores config discovery`             |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:89`.                                                                             |
| `Comma-separated kind list is preserved as multiple kinds`              |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:124`.                                                                            |
| `Omitted --kind uses the default hotspot kind set`                      |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:101`.                                                                            |
| `Explicit --kind replaces the default set`                              |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:137`.                                                                            |
| `Invalid kind token fails before querying`                              |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:186`.                                                                            |
| `Mutually exclusive context flags fail fast`                            |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:207`.                                                                            |
| `Infrastructure error exits with code 3`                                |  Satisfied  |     None      | ⚠️ **UNTESTED** | Implemented via `handleError`, but `withProvider` is mocked in command test.                                       |
| `Command help documents default and explicit kind semantics`            |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:229`.                                                                            |
| `CLI reference documents graph hotspots bootstrap and kind semantics`   |  Satisfied  |     High      |    ✅ PASSED    | Tested in `graph-hotspots.spec.ts:247`.                                                                            |

---

### 3.3. `cli:graph-impact`

- **Spec Path:** `specs/cli/graph-impact/spec.md` (merged with `deltas/cli/graph-impact/spec.md.delta.yaml`)
- **Verify Path:** `specs/cli/graph-impact/verify.md` (merged with `deltas/cli/graph-impact/verify.md.delta.yaml`)
- **Implementation File:** [`packages/cli/src/commands/graph/impact.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts)
- **Primary Test File:** [`packages/cli/test/commands/graph-impact.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts)
- **Supporting Test Files:** [`packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts)

#### Requirements Breakdown & Implementation Status

1. **Requirement: Output format**
   - **Delegation to SDK:** `impact.ts` delegates analysis and path projection to `sdk:run-graph-impact` for files, symbols, specs, and public exports.
     - _Status:_ **IMPLEMENTED**. Lines 526, 630, 789, 887.
   - **Path projection relative to project root:** All file paths rendered in impact analysis output (text, JSON, TOON) SHALL be formatted relative to project root (`projectRelativePath`).
     - _Status:_ **IMPLEMENTED**. Text output uses `result.projectRelativePath`, `result.projectRelativeTargets`, and project-relative paths for affected symbols.
   - **Structured target properties:** Single-file impact exposes `canonicalPath` and `projectRelativePath`. Multi-file exposes `targets` (canonical) and `projectRelativeTargets` (project-relative). Symbol impact exposes `symbol` (canonical) and `projectRelativePath`. Public export impact exposes `resolution`, `binding`, `target`, `path`, and `projectRelativeSurface`.
     - _Status:_ **IMPLEMENTED**. Lines 596, 672-673, 745-746, 851-852.
   - **Elimination of legacy path properties:** Structured output SHALL NOT expose `displayPath` or `displayTargets`.
     - _Status:_ **IMPLEMENTED**. Explicitly asserted in test suite.
   - **Aggregate impact fields:** Includes `riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`.
     - _Status:_ **IMPLEMENTED**. Lines 674-678, 747-752, 853-858, 908-913.
   - **Single-file impact symbol field (`symbols` vs `changedSymbols`):**
     - _Status:_ ⚠️ **DISCREPANCY / SPEC DRIFT**. `verify.md` scenario expects `changedSymbols`, whereas `impact.ts` emits `symbols: result.symbols` and `graph-impact.spec.ts:1272` tests `expect(parsed).toHaveProperty('symbols')`.

2. **Requirement: Pure display-path projection**
   - Projections from canonical to project-relative paths rely on configuration alone. No graph store reads, no provider file/document lookups.
     - _Status:_ **IMPLEMENTED**. Verified by `graph-impact.spec.ts:566` (zero calls to `mockProvider.getFile` or `mockProvider.getDocument`).

3. **Requirement: File, Symbol, Spec, and Public Export Impact Analysis**
   - **File impact:** Single and multi-file analysis aggregate transitive dependencies and project-relative paths. Changed symbols block and breakdown rendered.
     - _Status:_ **IMPLEMENTED**. Lines 638-766.
   - **Symbol impact:** Single match, ambiguous match with candidate list, not found cleanly reported.
     - _Status:_ **IMPLEMENTED**. Lines 797-865.
   - **Spec impact:** Dependent specs and covered files/symbols surfaced.
     - _Status:_ **IMPLEMENTED**. Lines 895-919.
   - **Public export impact:** Routes and dual impact views (exact public-binding impact and canonical-symbol impact) surfaced.
     - _Status:_ **IMPLEMENTED**. Lines 535-608.

4. **Requirement: Command signature & Error handling**
   - Mutually exclusive selectors: exactly one of `--file`, `--symbol`, `--spec`, or `--export` with `--from`.
     - _Status:_ **IMPLEMENTED**. Lines 417-428.
   - Mutually exclusive `--config` and `--path` fail fast before provider open.
     - _Status:_ **IMPLEMENTED**. Lines 429-431.
   - Result type and kind validation: `--type` accepts only `files,symbols,specs`; `--kind` requires `--type` to include `symbols`.
     - _Status:_ **IMPLEMENTED**. Lines 93-115.

#### Verification Scenarios Matrix (`verify.md`)

| Scenario                                                         |   Code Status   |    Test Coverage     |     Verdict     | Notes                                                                                                       |
| :--------------------------------------------------------------- | :-------------: | :------------------: | :-------------: | :---------------------------------------------------------------------------------------------------------- |
| `Text output shows risk level and counts`                        |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:195`.                                                                       |
| `Text output shows changed symbols for file impact`              |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1241`.                                                                      |
| `Multi-file text output shows grouped changed symbols`           |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1173`.                                                                      |
| `JSON output includes changedSymbols for file impact`            | **Discrepancy** | High (for `symbols`) |  ⚠️ **DRIFT**   | Verify scenario specifies `changedSymbols`, but code and tests use `symbols`.                               |
| `JSON output for symbol impact`                                  |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:2199`. Asserts `symbol`, `impact`, `projectRelativePath`, no `displayPath`. |
| `JSON output includes aggregate impact fields`                   |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:767`.                                                                       |
| `Impact paths are rendered relative to project root`             |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1274, 1353, 1395, 2244`.                                                    |
| `Omission notice displayed in text mode when tests are excluded` |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:2131`.                                                                      |
| `Omitted counts included in JSON output`                         |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:2166`.                                                                      |
| `File paths render without graph reads`                          |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:566`.                                                                       |
| `Wide multi-file impact formats without overload`                |    Satisfied    |         High         |    ✅ PASSED    | Traversal and projection do not issue store reads.                                                          |
| `Availability validated once per run`                            |    Satisfied    |         High         |    ✅ PASSED    | Handled via `withOpenGraphProvider`.                                                                        |
| `No selector provided`                                           |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:596`.                                                                       |
| `Multiple selectors provided`                                    |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:611`.                                                                       |
| `Missing unprefixed selector reports normalized lookup`          |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:659`.                                                                       |
| `Mutually exclusive context flags fail fast`                     |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:635`.                                                                       |
| `Infrastructure error exits with code 3`                         |    Satisfied    |         None         | ⚠️ **UNTESTED** | Handled via `handleError`, but `withProvider` is mocked in command tests.                                   |
| `Export selector requires both flags`                            |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1447`.                                                                      |
| `Target families are exclusive`                                  |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:611`.                                                                       |
| `Case-exact symbol selector wins`                                |    Satisfied    |         High         |    ✅ PASSED    | Handled by provider/SDK.                                                                                    |
| `Exact ambiguity is bounded and not traversed`                   |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1026`.                                                                      |
| `Category inclusion flags widen analysis scope`                  |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:2095`.                                                                      |
| `Category filter accepts comma-separated categories`             |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:2033`.                                                                      |
| `Repeated filters are delegated in one request`                  |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1654`.                                                                      |
| `Unsupported result type fails before provider open`             |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1707`.                                                                      |
| `Symbol kind requires symbol results`                            |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1733`.                                                                      |
| `Workspace exclusion takes precedence`                           |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1654`.                                                                      |
| `Symbol target renders affected specs`                           |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:849`.                                                                       |
| `Structured output preserves two impact views`                   |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1874`.                                                                      |
| `Common export name cannot hide the selected binding`            |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1467`.                                                                      |
| `Text separates direct and blast-radius coverage`                |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1561`.                                                                      |
| `Mixed evidence renders one spec`                                |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1561`.                                                                      |
| `CLI projects provider coverage without re-querying`             |    Satisfied    |         High         |    ✅ PASSED    | Tested in `graph-impact.spec.ts:1561`.                                                                      |

---

## 4. Discrepancies & Recommendations

### 4.1. Discrepancy: `changedSymbols` vs `symbols` in File Impact JSON

- **Location:** `specs/cli/graph-impact/verify.md` (Scenario: `JSON output includes changedSymbols for file impact`) vs `packages/cli/src/commands/graph/impact.ts:684`.
- **Description:**
  The verification scenario states:

  > **THEN** stdout is valid JSON containing `changedSymbols`, `affectedSymbols`, `affectedFiles`, `canonicalPath`, and `projectRelativePath`

  However, `impact.ts` serializes:

  ```ts
  output(
    {
      canonicalPath: result.canonicalPath,
      projectRelativePath: result.projectRelativePath,
      ...
      affectedSymbols: result.affectedSymbols,
      symbols: result.symbols,
      ...
    },
    fmt,
  )
  ```

  And `packages/cli/test/commands/graph-impact.spec.ts:1272` tests:

  ```ts
  expect(parsed).toHaveProperty('symbols')
  ```

- **Analysis:**
  1. _Spec Drift Possibility:_ The verify scenario author likely mirrored the text presentation heading (`Changed symbols:`) when naming the JSON field in the scenario description.
  2. _Implementation Bug Possibility:_ Alternatively, the domain interface `ImpactResult.symbols` was intended to be exposed to CLI consumers as `changedSymbols` to avoid ambiguity with `affectedSymbols`.
- **Recommendation:**
  Confirm the intended public contract. If `symbols` is the canonical SDK property, update `specs/cli/graph-impact/verify.md` to reference `symbols`. If machine consumers expect `changedSymbols`, update `impact.ts` to output `changedSymbols: result.symbols` (or provide both `symbols` and `changedSymbols` for backward compatibility).

---

## 5. Test Coverage & Missing Tests

### 5.1. Existing Test Coverage

- **`graph-search.spec.ts`**: 19 tests covering query options, category defaults, filter flags, omission notices, reference symbols, document search, and `projectRelativePath` projection.
- **`graph-hotspots.spec.ts`**: 21 tests covering default filters, kind set overrides, importer-only widening, risk thresholds, category filters, help documentation, omission notices, and `projectRelativePath` projection (with explicit verification of `displayPath` absence).
- **`graph-impact.spec.ts`**: 50 tests covering single-file, multi-file, symbol, spec, and public export route impact, direction aliases, depth configuration, covering specs, filter delegation, omission notices, and `projectRelativePath` projection (with explicit verification of `displayPath` and `displayTargets` absence).

### 5.2. Missing or Incomplete Test Scenarios

1. **`cli:graph-search`**:
   - **`--spec-content` rejection in text mode**:
     Add test:
     ```ts
     it('rejects --spec-content with text format', async () => {
       await makeSearchProgram().parseAsync([
         'node',
         'specd',
         'graph',
         'search',
         'hook',
         '--spec-content',
       ])
       expect(getStderr()).toContain('--spec-content requires --format json or --format toon')
       expect(process.exit).toHaveBeenCalledWith(1)
     })
     ```
   - **Spec results rendered in text mode**:
     Add test asserting that spec search results in text mode format as `[<workspace>] <specId>` and `match @ L...`.
2. **`cli:graph-hotspots`**:
   - **Empty result set in text mode**:
     Add test:
     ```ts
     it('renders "No hotspots found." in text mode when entries are empty', async () => {
       mockProvider.getHotspots.mockResolvedValue({ totalSymbols: 0, entries: [] })
       await makeHotspotsProgram().parseAsync([
         'node',
         'specd',
         'graph',
         'hotspots',
         '--format',
         'text',
       ])
       expect(getStdout()).toContain('No hotspots found.')
     })
     ```
3. **Cross-Command: Infrastructure Error & Provider Busy Exit Code 3**:
   - In `graph-search.spec.ts`, `graph-hotspots.spec.ts`, and `graph-impact.spec.ts`, `withProvider` is mocked as a passthrough. Consequently, no test verifies that throwing a `SpecdError` with code `GRAPH_BUSY` or `GRAPH_PROVIDER_STALE` results in stderr starting with `fatal:` and process exit code 3.
   - Recommended: Add integration or unit tests exercising the un-mocked `withProvider` error-handling wrapper.

---

## 6. Global Specs & Dependency Conformance

1. **`default:_global/architecture`**:
   - **Layer Boundaries:** Confirmed. `@specd/cli` contains no graph domain logic; all graph queries and path calculations are delegated to `@specd/sdk`.
   - **Package Dependencies:** `@specd/cli` depends on `@specd/sdk` and does not import `@specd/core` or `@specd/code-graph` directly.
2. **`default:_global/conventions`**:
   - Strict TypeScript conventions followed. ESM NodeNext, explicit return types on public functions, named exports, kebab-case file names. Typecheck and lint pass with 0 errors.
3. **`default:_global/testing`**:
   - Vitest test runner used. Given/When/Then scenario structures. Zero snapshot tests.
4. **`default:_global/error-handling-conventions`**:
   - Expected CLI user errors exit with code 1; infrastructure/busy errors exit with code 3.
5. **`default:_global/docs`**:
   - Help text on commands and `cli-reference.md` are aligned with implemented flags and default behaviors.
