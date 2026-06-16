# Spec Compliance Audit Report: Core Use Cases

**Change:** `llm-optimized-metadata`  
**Audited Specs:** `core:compile-context`, `core:get-project-context`  
**Date:** June 15, 2026

---

## 1. Summary Counts

| Metric                                           | Count |
| :----------------------------------------------- | :---- |
| **Specs Audited**                                | 2     |
| **Total Requirements**                           | 27    |
| **Compliant Requirements**                       | 27    |
| **Non-Compliant Requirements**                   | 0     |
| **Discrepancies Found**                          | 1     |
| **Requirements with Missing/Insufficient Tests** | 6     |

---

## 2. Requirements Summary

| Spec                         | Requirement                                               | Status        | Notes                                                             |
| :--------------------------- | :-------------------------------------------------------- | :------------ | :---------------------------------------------------------------- |
| **core:compile-context**     | Ports and constructor                                     | **Compliant** | Constructor signature accepts all required ports.                 |
| **core:compile-context**     | Input                                                     | **Compliant** | All optional and required inputs parsed correctly.                |
| **core:compile-context**     | Caller-owned implementation tracking refresh              | **Compliant** | Syntactically conforms; no dependency on implementation detector. |
| **core:compile-context**     | Schema name guard                                         | **Compliant** | Throws `SchemaMismatchError` before context collection.           |
| **core:compile-context**     | Workspace resolution for spec IDs                         | **Compliant** | Resolves explicit/implicit workspaces cleanly.                    |
| **core:compile-context**     | Context spec collection                                   | **Compliant** | Follows the 5-step resolution rules correctly.                    |
| **core:compile-context**     | Context display modes                                     | **Compliant** | Supports list, summary, full, and hybrid modes.                   |
| **core:compile-context**     | dependsOn resolution order                                | **Compliant** | Manifest -> Metadata -> Extraction fallback priority.             |
| **core:compile-context**     | Cycle detection during dependsOn traversal                | **Compliant** | DFS path/ancestor tracking breaks cycles without warning.         |
| **core:compile-context**     | Staleness detection and content fallback                  | **Compliant** | Falls back to extraction on stale content hashes.                 |
| **core:compile-context**     | Step availability                                         | **Compliant** | delegates availability check to `LifecycleEngine`.                |
| **core:compile-context**     | Structured result assembly                                | **Compliant** | Generates separate projectContext, specs, availableSteps.         |
| **core:compile-context**     | Result shape                                              | **Compliant** | Fits typescript output type signature.                            |
| **core:compile-context**     | Missing spec IDs emit a warning                           | **Compliant** | Emits a warning and skips missing spec IDs.                       |
| **core:compile-context**     | Unknown workspace qualifiers emit a warning               | **Compliant** | Skips unknown workspaces and warns without throwing.              |
| **core:compile-context**     | Context fingerprint                                       | **Compliant** | Matches SHA-256 fingerprint logic.                                |
| **core:compile-context**     | Prefer LLM-optimized context                              | **Compliant** | Prefers optimized fields when enabled and fresh.                  |
| **core:compile-context**     | Optimization warning signal                               | **Compliant** | Warns on missing optimized spec metadata.                         |
| **core:get-project-context** | Accepts GetProjectContextInput as input                   | **Compliant** | Config, followDeps, depth, sections accepted.                     |
| **core:get-project-context** | Returns GetProjectContextResult on success                | **Compliant** | Structured output returned.                                       |
| **core:get-project-context** | Resolves schema before processing                         | **Compliant** | Provider throws unhandled resolution errors.                      |
| **core:get-project-context** | Renders project-level context entries                     | **Compliant** | Labelling matches instruction and file types.                     |
| **core:get-project-context** | Applies project-level include/exclude patterns            | **Compliant** | Includes/excludes across all workspaces.                          |
| **core:get-project-context** | Does not apply workspace-level patterns                   | **Compliant** | **Missing Test**. Logically compliant but untested.               |
| **core:get-project-context** | Supports dependsOn traversal when followDeps is true      | **Compliant** | Traverses dependencies using metadata or fallback.                |
| **core:get-project-context** | Renders spec content from metadata when fresh             | **Compliant** | **Missing Tests** on display modes and defaults.                  |
| **core:get-project-context** | Falls back to extraction when metadata is stale or absent | **Compliant** | Warning and live extraction fallback matches rules.               |
| **core:get-project-context** | Construction dependencies                                 | **Compliant** | Correct dependencies accepted in constructor.                     |
| **core:get-project-context** | Project context optimization and invalidation             | **Compliant** | Context cache checks match config / specs freshness.              |

---

## 3. Detailed Implementation Status

### `core:compile-context`

The implementation in [compile-context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/compile-context.ts) is fully compliant with the specification:

- **Ports and Constructor**: The constructor accepts all 8 required ports, and `LifecycleEngine` is appropriately instantiated if not passed.
- **Input and Result**: Handles all optional properties (such as `fingerprint`, `depth`, `sections`). surrenders unchanged status if fingerprint matches.
- **Seeding & Exclusion**: Seeds change-level specs first, then processes project and workspace include/exclude rules.
- **Optimization Warning**: If `llmOptimizedContext` is active, it correctly scans for missing `optimizedContext` and emits a warning with remediation instructions pointing to `specd-spec-context-optimizer`.

### `core:get-project-context`

The implementation in [get-project-context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-project-context.ts) matches the requirements:

- **Execution flow**: Resolves the schema first. Verifies project-level metadata freshness via `checkProjectMetadataFreshness`. Renders project context entries, then applies project include/exclude patterns.
- **Context Mode Handling**: The rendering structure respects `list`, `summary`, and `full` modes.

---

## 4. Discrepancies Found

### Discrepancy 1: Unconditional `true` passed as `llmOptimizedContext` in `GetProjectContext._extractionFallback`

- **File Reference**: [get-project-context.ts:L375](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-project-context.ts#L375)
- **Code Quote**:
  ```typescript
  return this._renderFromMetadata(extracted.metadata, sectionsFilter, true)
  ```
- **Rationale**: The third parameter of `_renderFromMetadata` represents `llmOptimizedContext`. Here, the hardcoded value `true` is passed. However, if the project is configured with `llmOptimizedContext: false`, this call will bypass that preference during fallback extraction. In contrast, `CompileContext` handles this correctly in [compile-context.ts:L996](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/compile-context.ts#L996) by forwarding the configuration value:
  ```typescript
  return this._renderFromMetadata(extracted.metadata, sectionsFilter, llmOptimizedContext)
  ```
- **Impact**: Minimal in practice because extracted spec content doesn't usually contain LLM-optimized fields, but this remains a code inconsistency that violates the project configuration.

---

## 5. Test Coverage Details

### `core:compile-context`

Tested in [compile-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/compile-context.spec.ts).

- **Ports and constructor**:
  - `constructs without error` (L341)
- **Input**:
  - `throws ChangeNotFoundError when change is not found` (L358)
  - `throws SchemaNotFoundError when schema cannot be resolved` (L378)
  - `throws SchemaMismatchError when active schema name differs from change schema name` (L399)
- **Context spec collection**:
  - `applies project-level include patterns regardless of active workspace` (L664)
  - `does not apply workspace-level include for inactive workspaces` (L688)
  - `applies project-level exclude before workspace-level patterns` (L724)
  - `applies workspace-level exclude after workspace-level include` (L746)
  - `change specId survives matching exclude rules` (L774)
  - `includeChangeSpecs false skips direct change spec seed` (L801)
  - `includeChangeSpecs false allows reinjection through include patterns` (L823)
  - `includeChangeSpecs false allows reinjection through dependsOn traversal` (L848)
- **dependsOn traversal**:
  - `specDependsOn value is seeded even without pattern matches` (L879)
  - `dependsOn traversal adds specs not matched by include patterns` (L910)
  - `dependsOn specs are NOT removed by exclude rules` (L947)
  - `breaks cycle quietly and includes both specs` (L1023)
- **Staleness and Fallback**:
  - `emits staleness warning when contentHash does not match current file` (L1065)
  - `emits no staleness warning when all contentHashes match` (L1105)
  - `falls back to metadataExtraction when metadata is absent` (L1411)
- **Step availability**:
  - `returns stepAvailable: false and blockingArtifacts when required artifact not complete` (L1141)
  - `returns stepAvailable: true when all required artifacts are complete` (L1167)
  - `does not throw when step is unavailable` (L1204)
- **Context Display Modes**:
  - `summary mode is default when contextMode is omitted` (L2183)
  - `list mode emits list-only entries` (L2212)
  - `full mode renders all collected entries as full` (L2242)
  - `hybrid mode renders direct change specs in full and others as summary` (L2274)
- **LLM Optimization**:
  - `prefers optimizedContext when llmOptimizedContext is true` (L3246)
  - `emits stale-optimization warning when optimizedContext is missing and llmOptimizedContext is true` (L3279)

### `core:get-project-context`

Tested in [get-project-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-project-context.spec.ts).

- **Accepts Input**:
  - `returns context entries from config` (L25)
- **Resolves Schema**:
  - `throws SchemaNotFoundError when schema not resolved` (L54)
- **Renders project entries**:
  - `returns context entries from config` (L25)
- **Patterns**:
  - `includes specs matching include patterns` (L72)
  - `excludes specs matching exclude patterns` (L149)
- **dependsOn Traversal**:
  - `uses resolveSpecPath during followDeps fallback extraction` (L187)
  - `normalizes ../../_global/architecture/spec.md during followDeps fallback extraction` (L268)
- **Optimization Cache & Warnings**:
  - `returns optimized context when cache is fresh` (L455)
  - `falls back and warns when config hash mismatches` (L498)
  - `falls back and warns when spec metadata hash mismatches` (L542)
  - `warns when individual spec is missing optimizedContext field` (L603)

---

## 6. Missing/Insufficient Tests

1. **`CompileContext` — Caller-owned implementation tracking refresh guard**:
   - _Requirement_: "CompileContext MUST NOT accept ImplementationDetector or invoke implementation autodetection."
   - _Status_: Missing test. Although the class does not import or implement it, there is no unit test checking that it remains independent of `ImplementationDetector` to prevent regression.
2. **`GetProjectContext` — Workspace-level patterns ignored**:
   - _Requirement_: "The use case MUST NOT apply workspace-level `contextIncludeSpecs` or `contextExcludeSpecs` patterns."
   - _Status_: Missing test. No scenario in [get-project-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-project-context.spec.ts) registers workspace-level configurations to verify they are ignored.
3. **`GetProjectContext` — Display mode behaviors (`list`, `summary`, `full`, `hybrid`)**:
   - _Requirement_: "The mode field is determined by `config.contextMode`..."
   - _Status_: Missing tests. There are no tests in `get-project-context.spec.ts` asserting that `contextMode: 'list'` omits titles/descriptions, or that `hybrid` acts as `full`.
4. **`GetProjectContext` — Default sections in `full` mode**:
   - _Requirement_: "If no `sections` filter is active (input is absent or empty), it MUST default to rendering **Description + Rules + Constraints**."
   - _Status_: Missing test. There is no test verifying that the default sections are used when no section filter is provided.
