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

---

## Summary Table

| Spec ID              |     Compliance Status     | Requirements Count | Scenarios Audited | Discrepancies Count |   Missing Tests Count    |
| :------------------- | :-----------------------: | :----------------: | :---------------: | :-----------------: | :----------------------: |
| `cli:graph-search`   | **Compliant** (Test gaps) |         4          |        33         |          0          | 2 (document JSON & text) |
| `cli:graph-hotspots` |       **Compliant**       |         8          |        17         |          0          |            0             |
| `cli:graph-impact`   |     **Non-Compliant**     |         8          |        20         |  2 major, 1 minor   |   1 (symbol JSON path)   |
| **Total**            |  **Partial Compliance**   |       **20**       |      **70**       |        **3**        |          **3**           |

---

## Recommendations for Implementation Phase

1. **Extend `runGraphImpact` to Handle Public Export Routes (`sdk:run-graph-impact`)**:
   Add `export` and `from` (or `surface`) selectors to `RunGraphImpactInput`. Move public export route resolution and path projection into the SDK orchestrator so that all impact query types are host-agnostic and consistently project affected paths onto `projectRelativePath`.
2. **Project Public Export Paths in CLI (`packages/cli/src/commands/graph/impact.ts`)**:
   If public export impact remains in the CLI presenter temporarily, project `bindingImpact` and `canonicalImpact` affected file paths through `toProjectRelativePath` before rendering to text or JSON.
3. **Add Document Search Assertions (`packages/cli/test/commands/graph-search.spec.ts`)**:
   Add a test case with mock document results verifying that document entries emit `path` and `projectRelativePath` without `configRelativePath` in JSON mode, and render correctly under the `Documents (` section in text mode.
4. **Add Symbol Impact JSON Assertion (`packages/cli/test/commands/graph-impact.spec.ts`)**:
   Add a dedicated unit test executing `specd graph impact --symbol <name> --format json` verifying `projectRelativePath` presence and `displayPath` absence on the root result object.
