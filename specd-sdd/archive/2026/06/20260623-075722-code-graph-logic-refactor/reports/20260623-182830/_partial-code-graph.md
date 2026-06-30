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

### B. Spec: [`code-graph:staleness-detection`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/staleness-detection/spec.md)

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

### C. Spec: [`code-graph:composition`](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/composition/spec.md)

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

## 3. Discrepancies and Gap Checklist

| Target Spec                      | Requirement / Location          | Type of Issue          | Description                                                                                                                                                                |
| :------------------------------- | :------------------------------ | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:traversal`           | `getUpstream` / `getDownstream` | **Implementation Gap** | `includeFiles` (defaults to `true`) is ignored; no file-level BFS traversal or import resolution is performed inside symbols traversal.                                    |
| `code-graph:traversal`           | `verify.md#L39`                 | **Missing Test**       | `Scenario: Downstream with includeFiles` is completely untested.                                                                                                           |
| `code-graph:traversal`           | `analyzeImpact`                 | **Implementation Gap** | `affectedProcesses` returns an empty array `[]` (with a TODO).                                                                                                             |
| `code-graph:traversal`           | `analyzeImpact`                 | **Missing Test**       | Scenarios for `LOW`, `MEDIUM`, and `CRITICAL` risk results on `analyzeImpact` are not unit tested at the service level.                                                    |
| `code-graph:traversal`           | `analyzeImpact`                 | **Missing Test**       | `Scenario: affectedFiles deduplication` is not explicitly verified.                                                                                                        |
| `code-graph:traversal`           | `analyzeFileImpact`             | **Missing Test**       | `Scenario: File impact aggregates USES_TYPE-derived dependents` is not tested.                                                                                             |
| `code-graph:traversal`           | `analyzeFileImpact`             | **Missing Test**       | Scenarios for maximum risk, symbol deduplication, hierarchy aggregation at the file level, and custom maxDepth pass-through are not tested.                                |
| `code-graph:traversal`           | `analyzeSpecImpact`             | **Missing Test**       | `Scenario: Downstream spec impact includes covered files and symbols` is completely untested (only upstream mode is tested).                                               |
| `code-graph:traversal`           | `detectChanges`                 | **Missing Test**       | `Scenario: Multiple changed files aggregated` is not tested.                                                                                                               |
| `code-graph:traversal`           | `Pure functions`                | **Missing Test**       | `Scenario: Traversal does not mutate store` is not tested.                                                                                                                 |
| `code-graph:staleness-detection` | `isGraphStale`                  | **Missing Test**       | There are no unit tests for the [`isGraphStale`](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts#L8) service.      |
| `code-graph:staleness-detection` | `stats.ts` output strings       | **Discrepancy**        | Minor mismatch in fingerprint warning text: Spec says `built with different code-graph version...` vs code outputs `version or workspace configuration changed...`.        |
| `code-graph:composition`         | `CodeGraphProvider`             | **Discrepancy**        | Selector normalization methods return `ResolvedFileSelector[]` / `ResolvedSymbolSelector[]` instead of `string \| string[]`.                                               |
| `code-graph:composition`         | `CodeGraphProvider`             | **Discrepancy**        | Naming discrepancies: `getCoveringSpecs(filePath)` vs `getCoveringSpecsForFile(filePath)` and `getSymbolCoveringSpecs(symbolId)` vs `getCoveringSpecsForSymbol(symbolId)`. |
| `code-graph:composition`         | `Package exports`               | **Discrepancy**        | `WorkspaceIndexTarget` and `DiscoveredSpec` types are missing from exports (uses `ProjectWorkspace` directly).                                                             |
| `code-graph:composition`         | `Package exports`               | **Discrepancy**        | Base error class is named `SpecdCodeGraphError` instead of `CodeGraphError`.                                                                                               |
