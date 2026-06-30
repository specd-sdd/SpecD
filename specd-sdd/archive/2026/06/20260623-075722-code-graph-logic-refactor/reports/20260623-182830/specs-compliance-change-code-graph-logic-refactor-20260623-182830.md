# Spec Compliance Audit: code-graph-logic-refactor

**Date:** 2026-06-23
**Change:** code-graph-logic-refactor
**Scope:** 6 specs (CLI, Code-Graph) + Global Constraints

---

## 1. Requirements Summary

The `code-graph-logic-refactor` change refactors code-graph business logic from the `cli` package to the `code-graph` package to enable reuse across different adapters and tools.

Key goals:

- Migrate core code-graph indexing, traversal, staleness-detection, and composition facades into the `@specd/code-graph` workspace package.
- Simplify CLI commands (`graph index`, `graph stats`, `graph impact`) to act as thin adapters that delegate entirely to the `@specd/code-graph` provider.
- Implement robust concurrency locking, VCS ref staleness checks, and project fingerprinting in the shared library.
- Verify that CLI outputs and command-line signatures continue to match the existing specification requirements.

---

## 2. Implementation Status: PARTIAL CONFORMANCE (Gaps Identified)

- **CLI Package**: The command adapters in `@specd/cli` have been refactored to delegate to `@specd/code-graph` provider. The command signatures and flag mappings are mostly conformant. However, error handling during lock contention causes unhandled crashes instead of returning clean exit code `3`.
- **Code Graph Package**: The provider facade and databases are successfully modularized. Basic query and traversal capabilities function properly.
- **Critical Gaps**:
  - `TraversalOptions.includeFiles` is completely unimplemented, skipping file-level import BFS resolution.
  - The `affectedProcesses` impact analysis tracking is stubbed as `[]` with a `TODO`.
  - Concurrent lock-held guards on stats and impact commands trigger unhandled asynchronous exceptions (causing exit code `1` crashes instead of exit code `3`).

---

## 3. Discrepancies

### 🔴 Critical: Unhandled Lock-Held Exception (CLI Command Crashes)

- **Spec Requirement**: When a graph index lock is present, stats/impact commands must exit gracefully with code `3` and show a retry-later message.
- **Actual Code**: Both `stats.ts` and `impact.ts` invoke `assertGraphIndexUnlocked(config)` outside of command-level try-catch blocks. Under Commander, this bubbles up as an uncaught exception, resulting in process crash/exit code `1` instead of exit code `3`.

### 🔴 Critical: Unimplemented includeFiles Traversal

- **Spec Requirement**: Upstream and downstream traversals must support `includeFiles: boolean` option to resolve file-to-file import relationships.
- **Actual Code**: Traversals in `getUpstream` and `getDownstream` only traverse symbol edges and ignore file-level import relationships.

### 🟡 Risk: CodeGraphProvider API Discrepancies

- **Spec Requirement**: `CodeGraphProvider` normalization methods should return `Promise<string | string[]>`. Method naming should be `getCoveringSpecsForFile` and `getCoveringSpecsForSymbol`.
- **Actual Code**: Normalization methods return `Promise<ResolvedFileSelector[]>` / `Promise<ResolvedSymbolSelector[]>`. Method names are mapped as `getCoveringSpecs` and `getSymbolCoveringSpecs`.

---

## 4. Test Coverage Assessment

- **Unit and Contract Tests**: The SQLite and Ladybug graph database backends have solid coverage for symbol indexing, cycles, and basic symbol-to-symbol traversal.
- **Skipped CLI Tests**: Four critical unit tests are marked as `.skip` in `graph-index.spec.ts` (bootstrap workspace creation, fallback config resolution, CLI `--exclude-path` override mapping, and lock verification).
- **Missing Coverage**:
  - No unit tests exist for the `isGraphStale` service.
  - No tests cover stats/impact lock-contention error paths.
  - No tests verify `LOW`/`MEDIUM`/`CRITICAL` risk results in `analyzeImpact`.
  - The `includeFiles` verify scenario is completely untested due to being unimplemented.

---

## 5. Missing Tests

1. **`isGraphStale` service unit tests**: Zero unit tests in `code-graph` for staleness evaluations (e.g. stale, fresh, unknown ref).
2. **`includeFiles` Downstream Traversal**: Missing coverage for file-level BFS traversal and imports.
3. **Downstream Spec Impact coverage**: Only upstream mode is tested.
4. **Mutate Check**: No test ensures that traversal functions do not mutate the store state.

---

## 6. Spec Dependency Chain

- `cli:graph-index` depends on `cli:entrypoint`, `core:config`, `code-graph:composition`, `code-graph:graph-store`, and `core:list-workspaces`.
- `code-graph:composition` depends on `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:indexer`, and `code-graph:traversal`.
- All change-scoped specs maintain correct dependency declarations in their `## Spec Dependencies` sections.

---

## 7. Summary Counts

- **Specs Audited:** 6
- **Requirements Verified:** 32
- **Discrepancies / Gaps Found:** 10+ (combining CLI command logic and core library gaps)
- **Test Gaps Identified:** 4 skipped tests, 10 missing test scenarios
- **Implementation Readiness:** **FAIL** (Requires resolving lock exceptions, fixing `includeFiles` traversal, and restoring skipped unit tests before Archive)

---

## Detailed Findings

The complete contents of the partial reports generated during the audit are concatenated below.

---

### Verbatim Partial Report: CLI Graph Commands (`_partial-cli.md`)

````markdown
# Spec-Compliance Audit: CLI Graph Commands

This report presents a spec-compliance audit for the following CLI specs in the active change `code-graph-logic-refactor`:

1. `cli:graph-index`
2. `cli:graph-stats`
3. `cli:graph-impact`

---

## 1. Conformance Overview

| Spec ID            | Spec Description                    | Implementation File                                                                                            | Test File                                                                                                             | Conformance Status                                                        |
| :----------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| `cli:graph-index`  | Rebuilds or updates the code graph  | [index-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts) | [graph-index.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts)   | **Partial Conformance** (skipped tests, output discrepancies)             |
| `cli:graph-stats`  | Displays graph freshness and counts | [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts)             | [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts)   | **Partial Conformance** (lock error handling gaps, missing coverage)      |
| `cli:graph-impact` | Analyzes blast radius of changes    | [impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts)           | [graph-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts) | **Partial Conformance** (lock handling, output details, missing coverage) |

---

## 2. Detailed Spec-by-Spec Analysis

### A. Graph Index (`cli:graph-index`)

- **Command Signature**: Implementation in [index-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts#L24-L55) matches the signature exactly, including optional repeatable `--exclude-path` and mutually exclusive `--config` and `--path` options.
- **Indexing Behaviour**: Delegates configuration building, project structure listing, locking, progress reporting, and provider indexing correctly.
- **Discrepancy (Progress Destination)**: The spec states that progress should be displayed on `stderr` using `\r\x1b[K` for in-place updates when format is text and output is a TTY. However, [index-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts#L151-L156) writes directly to `process.stdout`, lacks a TTY check (`process.stdout.isTTY`), and uses space padding (`' '.repeat(20)`) instead of `\x1b[K` to clear the line.
- **Discrepancy (Lock Error Code)**: Lock-acquisition failure exits with code `1` in the main process try-catch block:
  ```typescript
  } catch (err) {
    if (lockRelease) lockRelease()
    cliError(err instanceof Error ? err.message : 'indexing failed', opts.format, 1)
  }
  ```
````

This diverges from the standard exit code `3` for lock/system issues.

### B. Graph Stats (`cli:graph-stats`)

- **Command Signature & Logic**: Command matches options and context resolution rules.
- **Statistics Retrieval & Staleness**: VCS ref detection, fingerprint mismatch detection, and staleness calculation are implemented in [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts#L66-L93) and mapped correctly to the CLI output.
- **Critical Gap (Lock-Held Crash)**: The spec requires that if the graph is currently being indexed, the command fails fast with a short user-facing retry-later message and exits with code `3`.
  In [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts#L61), `assertGraphIndexUnlocked(config)` is called outside of any try-catch block. Because the error is thrown inside Commander's asynchronous action callback without being handled, it bubbles up as an uncaught exception, leading to a process crash or exit code `1` rather than returning a clean exit code `3`.

### C. Graph Impact (`cli:graph-impact`)

- **Command Signature & Selectors**: Correctly enforces that exactly one of `--file`, `--symbol`, or `--spec` is specified. Normalizes aliases `dependents`/`dependencies` to `upstream`/`downstream` as required.
- **Analysis Execution**: Handles single-file, multi-file (aggregating impact results), symbol-matching, and spec-matching appropriately.
- **Critical Gap (Lock-Held Crash)**: Like stats, [impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts#L227) calls `assertGraphIndexUnlocked(config)` outside of any try-catch block, leading to uncaught errors instead of exit code `3`.
- **Discrepancy (Search Error Details)**: The spec states that if `--file` input does not resolve, the not-found error must include the normalized config-relative path searched. The implementation in [impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts#L261) only prints `no indexed file matches "${rawSelector}"`.
- **Inconsistency (Spec Not Found Exit Code)**: When `--spec` matches no indexed spec node, the text output reports `No spec found matching "${specId}".` but returns successfully, exiting with code `0`. While this matches the verification scenario in `verify.md`, it conflicts with the requirement statement that it "SHALL fail with a not-found error" (implying exit code `1`).

---

## 3. Project-Wide Consistency & Dependencies

- **CLI Context Model**: Graph context resolution in [resolve-graph-cli-context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/resolve-graph-cli-context.ts) is consistent with the standard project-global CLI context discovery.
- **Global Schema/Exit Codes**: The project-wide error handler [handle-error.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/handle-error.ts) implements the correct exit code strategy (1 for validation/user, 2 for hook, 3 for system/unexpected). However, as noted above, lock exception paths bypass `cliError` or `handleError` and bubble up.
- **Documentation Conformance**: The command group and its flags are fully and accurately described in the `## graph` section of [cli-reference.md](file:///Users/monki/Documents/Proyectos/specd/docs/cli/cli-reference.md#L1047-L1275).

---

## 4. Test Coverage Assessment

### A. Active Skipped Tests

In [graph-index.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts), four critical tests are skipped (`it.skip`):

1. [Line 140](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts#L140): `'builds a synthetic default workspace in bootstrap mode'`
2. [Line 154](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts#L154): `'uses no-config fallback path by passing no overrides'`
3. [Line 168](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts#L168): `'populates graphConfig with exclude-path from CLI'`
   > [!NOTE]
   > This test is logically broken: it asserts that CLI `--exclude-path` inputs are mapped to workspace-level `wsConfig.excludePaths` on the `default` workspace instead of the global `graphConfig.excludePaths` where they are actually merged.
4. [Line 218](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts#L218): `'acquires the shared graph index lock before indexing'`

### B. Missing Test Scenarios

- **Lock Graceful Exits**: Neither [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts) nor [graph-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts) test the behaviour when `assertGraphIndexUnlocked` throws an error. There is no assertion checking that a lock error exits with code `3` and prints the user-facing message.
- **Ambiguity / Path Normalization Errors**: There are no tests verifying the behavior of `graph impact` when raw file selectors resolve to ambiguous canonical files, nor verifying the format of the path not-found error.

````

---

### Verbatim Partial Report: Code Graph Package (`_partial-code-graph.md`)

```markdown
# Spec Compliance Audit Report

- **Subsystem**: `code-graph`
- **Active Change**: `code-graph-logic-refactor`
- **Audit Date**: 2026-06-23
- **Audit Status**: **FAIL / COMPLIANCE GAPS IDENTIFIED**

---

## 1. Executive Summary

This report performs a spec-compliance audit for the following specifications under the active change `code-graph-logic-refactor`:
1. [`code-graph:traversal`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/spec.md)
2. [`code-graph:staleness-detection`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/staleness-detection/spec.md)
3. [`code-graph:composition`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/composition/spec.md)

While the code-graph indexing, querying, and basic traversals function correctly and are covered by passing unit and contract tests, several significant conformance gaps and naming discrepancies exist between the specs and the current codebase. Most notably, the `includeFiles` option in upstream/downstream traversal is entirely unimplemented, and unit tests are missing for several critical scenarios (including the `isGraphStale` service).

---

## 2. Detailed Spec Compliance

### A. Spec: [`code-graph:traversal`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/spec.md)

#### 1. Requirement: Upstream traversal & Downstream traversal
- **Conformance Status**: **PARTIAL COMPLIANCE**
- **Details**:
  - `getUpstream` (in [get-upstream.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/get-upstream.ts#L48)) and `getDownstream` (in [get-downstream.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/get-downstream.ts#L48)) group results by depth, detect cycles using a visited set to avoid double traversal, and enforce the default `maxDepth = 3`.
  - **Critical Gap**: `TraversalOptions.includeFiles` (which defaults to `true`) is completely unimplemented. The traversal functions only query symbol-to-symbol relationships (via callers/callees and hierarchy extenders/implementors/overriders) and completely ignore `IMPORTS` file relations when traversing.
- **Test Coverage**: **PARTIAL**
  - All standard symbol call, cycle breaking, and hierarchy traversal cases are covered in [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts).
  - **Missing Test**: The scenario `Downstream with includeFiles` in [verify.md](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/verify.md#L39) is completely missing from the test suite because it is not implemented.

#### 2. Requirement: Impact analysis
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - `analyzeImpact` (in [analyze-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-impact.ts#L17)) computes the risk level using `computeRiskLevel` and populates the `AffectedSymbol` with depth.
  - **Implementation Gap**: `affectedProcesses` is stubbed as `[]` because execution flow tracking has not yet been implemented in the core (documented with a `TODO` on line 132).
- **Test Coverage**: **PARTIAL**
  - Basic risk level computation, depth mapping, custom `maxDepth`, and hierarchy dependents are tested.
  - **Missing Test**: There are no tests verifying `LOW`, `MEDIUM`, or `CRITICAL` risk results specifically on `analyzeImpact` (only `HIGH` is verified, although `computeRiskLevel` itself is fully unit tested in [risk-level.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/value-objects/risk-level.spec.ts)).
  - **Missing Test**: `Scenario: affectedFiles deduplication` in [verify.md](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/verify.md#L71) is not explicitly tested.

#### 3. Requirement: Static type dependency impact
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - Relational queries treat `Calls`, `Constructs`, and `UsesType` as dependency edges under `SYMBOL_DEPENDENCY_RELATION_TYPES` in SQLite and Ladybug backends.
- **Test Coverage**: **PARTIAL**
  - Coverage for incoming/outgoing Constructs and UsesType is verified on traversals.
  - **Missing Test**: `Scenario: File impact aggregates USES_TYPE-derived dependents` is not tested in [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts).

#### 4. Requirement: File impact
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - `analyzeFileImpact` (in [analyze-file-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-file-impact.ts#L19)) aggregates symbols, unions files, and takes the maximum risk.
  - `analyzeFilesImpact` (in [analyze-files-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-files-impact.ts#L22)) aggregates multi-file impacts.
- **Test Coverage**: **PARTIAL**
  - Multi-file aggregate risk level, files union, and basic file merging are tested.
  - **Missing Tests**: Scenarios like `Aggregate risk is maximum across symbols`, `Affected symbols deduplicated across file symbols`, `maxDepth passed through to per-symbol analysis`, and `Hierarchy-derived impact is aggregated at file level` are not explicitly tested in [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts).

#### 5. Requirement: Spec impact
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - `analyzeSpecImpact` (in [analyze-spec-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-spec-impact.ts#L14)) combines spec dependencies and file/symbol coverage.
- **Test Coverage**: **PARTIAL**
  - Upstream spec dependencies and covered file/symbol retrieval are tested.
  - **Missing Test**: `Scenario: Downstream spec impact includes covered files and symbols` is completely untested (only upstream mode is tested in [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts)).
  - **Missing Test**: `Scenario: Spec impact deduplicates file and symbol coverage` is not explicitly tested.

#### 6. Requirement: Change detection
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - `detectChanges` (in [detect-changes.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/detect-changes.ts#L14)) implements upstream traversal from changed files.
- **Test Coverage**: **PARTIAL**
  - Single file change is tested.
  - **Missing Test**: `Scenario: Multiple changed files aggregated` is not verified in [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts).

#### 7. Requirement: Pure functions
- **Conformance Status**: **COMPLIANT**
- **Details**: All functions are stateless and read-only.
- **Test Coverage**: **MISSING**
  - There is no test checking `Scenario: Traversal does not mutate store` by verifying statistics remain constant.

---

## 3. Spec: [`code-graph:staleness-detection`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/staleness-detection/spec.md)

#### 1. Requirement: VCS ref storage at index time
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - Optional `vcsRef` is correctly written to metadata table/key `lastIndexedRef` in both SQLite and Ladybug backends during indexing runs.
- **Test Coverage**: **COMPLIANT**
  - Covered in [graph-store.contract.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/ports/graph-store.contract.ts).

#### 2. Requirement: Staleness comparison
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - [`isGraphStale`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts#L8) evaluates null checks and comparison correctly.
- **Test Coverage**: **MISSING**
  - **Critical Gap**: There are zero unit tests for [`isGraphStale`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts#L8) in [is-graph-stale.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts). The scenarios `Stale graph`, `Fresh graph`, and `Unknown staleness` are only verified through CLI integration tests.

#### 3. Requirement: Graph derivation freshness & policies
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - Stored maps are parsed and checked for mismatch using `detectFingerprintMismatch`.
  - The derivation mismatch policy is implemented: instead of recreating the store, the indexer optimizes by re-processing files of mismatched workspaces, printing `full rebuild: Graph derivation fingerprint mismatch...` under text mode.
- **Test Coverage**: **COMPLIANT**
  - Fingerprint mismatch detection and warnings are verified in integration test [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts).

#### 4. Requirement: Staleness in graph stats output
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - The [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts) command correctly formats stale warning strings and JSON/TOON output fields.
  - **Discrepancy**: Minor text discrepancy in warning string. Spec says: `⚠ Derivation fingerprint mismatch — graph built with different code-graph version or workspace configuration` whereas the code outputs: `⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index`.
- **Test Coverage**: **COMPLIANT**
  - Stat formatting and ref output are verified in [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts).

---

## 4. Spec: [`code-graph:composition`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/composition/spec.md)

#### 1. Requirement: CodeGraphProvider facade
- **Conformance Status**: **PARTIAL COMPLIANCE**
- **Details**:
  - **Discrepancy in Method Signatures**:
    - The selector normalization methods on `CodeGraphProvider` return `Promise<ResolvedFileSelector[]>` and `Promise<ResolvedSymbolSelector[]>` in the codebase, but the spec defines them as returning `Promise<string | string[]>`.
  - **Discrepancy in Method Naming**:
    - Spec defines: `getCoveringSpecsForFile(filePath)`
      Codebase implements: `getCoveringSpecs(filePath)` (in [code-graph-provider.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/composition/code-graph-provider.ts#L199))
    - Spec defines: `getCoveringSpecsForSymbol(symbolId)`
      Codebase implements: `getSymbolCoveringSpecs(symbolId)` (in [code-graph-provider.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/composition/code-graph-provider.ts#L217))
- **Test Coverage**: **COMPLIANT**
  - Covered in [code-graph-provider.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/composition/code-graph-provider.spec.ts).

#### 2. Requirement: Factory function
- **Conformance Status**: **COMPLIANT**
- **Details**:
  - `createCodeGraphProvider` parses both legacy `CodeGraphOptions` and primary `SpecdConfig` correctly.
  - **Discrepancy**: The parameter names in [create-code-graph-provider.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/composition/create-code-graph-provider.ts#L50) are named `options` instead of `config`. The type guard checks for `configPath` and `workspaces` instead of checking for `projectRoot`.

#### 3. Requirement: Package exports
- **Conformance Status**: **PARTIAL COMPLIANCE**
- **Details**:
  - **Discrepancy**: The spec states the package SHALL export `WorkspaceIndexTarget` and `DiscoveredSpec` types. However, these are not defined or exported in the codebase (the indexer uses `@specd/core`'s `ProjectWorkspace` directly).
  - **Discrepancy**: The base error is named `SpecdCodeGraphError` instead of `CodeGraphError`.

#### 4. Requirement: Lifecycle management
- **Conformance Status**: **COMPLIANT**
- **Details**: Connections throw `StoreNotOpenError` if methods are called before open or after close.
- **Test Coverage**: **COMPLIANT**
  - Covered in [code-graph-provider.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/composition/code-graph-provider.spec.ts).

---

## 5. Discrepancies and Gap Checklist

| Target Spec | Requirement / Location | Type of Issue | Description |
| :--- | :--- | :--- | :--- |
| `code-graph:traversal` | `getUpstream` / `getDownstream` | **Implementation Gap** | `includeFiles` (defaults to `true`) is ignored; no file-level BFS traversal or import resolution is performed inside symbols traversal. |
| `code-graph:traversal` | `verify.md#L39` | **Missing Test** | `Scenario: Downstream with includeFiles` is completely untested. |
| `code-graph:traversal` | `analyzeImpact` | **Implementation Gap** | `affectedProcesses` returns an empty array `[]` (with a TODO). |
| `code-graph:traversal` | `analyzeImpact` | **Missing Test** | Scenarios for `LOW`, `MEDIUM`, and `CRITICAL` risk results on `analyzeImpact` are not unit tested at the service level. |
| `code-graph:traversal` | `analyzeImpact` | **Missing Test** | `Scenario: affectedFiles deduplication` is not explicitly verified. |
| `code-graph:traversal` | `analyzeFileImpact` | **Missing Test** | `Scenario: File impact aggregates USES_TYPE-derived dependents` is not tested. |
| `code-graph:traversal` | `analyzeFileImpact` | **Missing Test** | Scenarios for maximum risk, symbol deduplication, hierarchy aggregation at the file level, and custom maxDepth pass-through are not tested. |
| `code-graph:traversal` | `analyzeSpecImpact` | **Missing Test** | `Scenario: Downstream spec impact includes covered files and symbols` is completely untested (only upstream mode is tested). |
| `code-graph:traversal` | `detectChanges` | **Missing Test** | `Scenario: Multiple changed files aggregated` is not tested. |
| `code-graph:traversal` | `Pure functions` | **Missing Test** | `Scenario: Traversal does not mutate store` is not tested. |
| `code-graph:staleness-detection` | `isGraphStale` | **Missing Test** | There are no unit tests for the [`isGraphStale`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts#L8) service. |
| `code-graph:staleness-detection` | `stats.ts` output strings | **Discrepancy** | Minor mismatch in fingerprint warning text: Spec says `built with different code-graph version...` vs code outputs `version or workspace configuration changed...`. |
| `code-graph:composition` | `CodeGraphProvider` | **Discrepancy** | Selector normalization methods return `ResolvedFileSelector[]` / `ResolvedSymbolSelector[]` instead of `string \| string[]`. |
| `code-graph:composition` | `CodeGraphProvider` | **Discrepancy** | Naming discrepancies: `getCoveringSpecs(filePath)` vs `getCoveringSpecsForFile(filePath)` and `getSymbolCoveringSpecs(symbolId)` vs `getCoveringSpecsForSymbol(symbolId)`. |
| `code-graph:composition` | `Package exports` | **Discrepancy** | `WorkspaceIndexTarget` and `DiscoveredSpec` types are missing from exports (uses `ProjectWorkspace` directly). |
| `code-graph:composition` | `Package exports` | **Discrepancy** | Base error class is named `SpecdCodeGraphError` instead of `CodeGraphError`. |
````
