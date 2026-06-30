# Spec-Compliance Audit Report: Core Use Cases and Types

This partial report details the spec-compliance audit for the core context-compilation use cases and agent plugin types associated with the `llm-optimized-metadata` change.

---

## 1. Summary Counts

| Metric                         | Value |
| :----------------------------- | :---- |
| **Specs Audited**              | 3     |
| **Requirements Verified**      | 35    |
| **Discrepancies Found**        | 3     |
| **Missing Tests**              | 2     |
| **Implementation Readiness %** | 93%   |

---

## 2. Audited Specs Detail

### 1. `core:compile-context`

- **Implementation File:** [`compile-context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/compile-context.ts)
- **Test File:** [`compile-context.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/compile-context.spec.ts)
- **Spec Dependency Chain:**
  - [`core:change`](file:///Users/monki/Documents/Proyectos/specd/specs/core/change/spec.md)
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
  - [`core:spec-metadata`](file:///Users/monki/Documents/Proyectos/specd/specs/core/spec-metadata/spec.md)
  - [`core:schema-format`](file:///Users/monki/Documents/Proyectos/specd/specs/core/schema-format/spec.md)
  - [`core:delta-format`](file:///Users/monki/Documents/Proyectos/specd/specs/core/delta-format/spec.md)
  - [`core:selector-model`](file:///Users/monki/Documents/Proyectos/specd/specs/core/selector-model/spec.md)
  - [`core:spec-id-format`](file:///Users/monki/Documents/Proyectos/specd/specs/core/spec-id-format/spec.md)
  - [`core:workspace`](file:///Users/monki/Documents/Proyectos/specd/specs/core/workspace/spec.md)
  - [`core:get-artifact-instruction`](file:///Users/monki/Documents/Proyectos/specd/specs/core/get-artifact-instruction/spec.md)
  - [`core:get-hook-instructions`](file:///Users/monki/Documents/Proyectos/specd/specs/core/get-hook-instructions/spec.md)
  - [`core:preview-spec`](file:///Users/monki/Documents/Proyectos/specd/specs/core/preview-spec/spec.md)
  - [`core:lifecycle-engine`](file:///Users/monki/Documents/Proyectos/specd/specs/core/lifecycle-engine/spec.md)
  - [`core:refresh-implementation-tracking`](file:///Users/monki/Documents/Proyectos/specd/specs/core/refresh-implementation-tracking/spec.md)
  - [`core:core/project-metadata`](file:///Users/monki/Documents/Proyectos/specd/specs/core/project-metadata/spec.md)
- **Requirements Summary:**
  - **Ports and constructor:** Verified. `CompileContext` constructor does not accept `ImplementationDetector` or autodetect files.
  - **Input:** Verified. Accepts change name, step, config, sections, and optional fingerprint.
  - **Caller-owned implementation tracking refresh:** Verified. Uses tracked implementation files already persisted on the change instead of invoking detection.
  - **Schema name guard:** Verified. Throws `SchemaMismatchError` if `schema.name()` mismatches `change.schemaName`.
  - **Workspace resolution for spec IDs:** Verified. Uses `parseSpecId` and workspace mapping registry. Skips unknown workspaces with a warning.
  - **Context spec collection:** Verified. Accumulates specs through 5-step resolution (seeding, project include/excludes, active workspace include/excludes, dependsOn traversal).
  - **Context display modes:** Verified. Emits entries classified under `list`, `summary`, `full`, or `hybrid` mode.
  - **dependsOn resolution order:** Verified. Respects priority hierarchy (manifest `specDependsOn` -> metadata `dependsOn` -> schema extraction fallback).
  - **Cycle detection during dependsOn traversal:** Verified. Correctly cuts infinite loops without throwing/warning.
  - **Staleness detection and content fallback:** Verified. Prefers fresh metadata. Falls back to extraction on stale/absent metadata and emits warning. Integrates `PreviewSpec` materialized view for change specIds.
  - **Step availability:** Verified. Resolves step availability through `LifecycleEngine`. Surfaces blockers without throwing.
  - **Structured result assembly & shape:** Verified. Assembles fingerprint, availability flags, warnings, projectContext, specs, and availableSteps in conformant structures.
  - **Context fingerprint:** Verified. Computes SHA-256 fingerprint from logical fields, enabling unchanged status short-circuits. CLI formats do not affect fingerprint.
  - **Prefer LLM-optimized context:** Verified. Prefers `optimizedContext` (or `optimizedDescription` for summaries) when `llmOptimizedContext: true` is configured.
  - **Optimization warning signal:** Verified. Emits `stale-optimization` warnings for specs missing optimized context.
- **Implementation Status:** Substantially Compliant.
- **Discrepancies:**
  - **Port Injection Signature Mismatch:** The spec requires that the constructor accepts a `specs: ReadonlyMap<string, SpecRepository>` port. However, the [implementation constructor](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/compile-context.ts#L235) receives a `listWorkspaces: ListWorkspaces` instance instead, which contains the repository map.
- **Test Coverage:** High. Tests verify inclusion/exclusion resolution, hybrid mode mapping, traversal, cycle breaking, staleness checks, preview-spec fallback, availability diagnostics, and fingerprinting logic.
- **Missing Tests:**
  - **LLM-optimized context tests:** The test suite in [compile-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/compile-context.spec.ts) lacks test cases to verify the `llmOptimizedContext` configuration option, optimized content selection, and `stale-optimization` warning emitting.

---

### 2. `core:get-project-context`

- **Implementation File:** [`get-project-context.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-project-context.ts)
- **Test File:** [`get-project-context.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/get-project-context.spec.ts)
- **Spec Dependency Chain:**
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
  - [`core:compile-context`](file:///Users/monki/Documents/Proyectos/specd/specs/core/compile-context/spec.md)
  - [`core:spec-metadata`](file:///Users/monki/Documents/Proyectos/specd/specs/core/spec-metadata/spec.md)
  - [`core:schema-format`](file:///Users/monki/Documents/Proyectos/specd/specs/core/schema-format/spec.md)
  - `default:_global/architecture`
  - [`core:core/project-metadata`](file:///Users/monki/Documents/Proyectos/specd/specs/core/project-metadata/spec.md)
- **Requirements Summary:**
  - **Accepts GetProjectContextInput as input:** Verified.
  - **Returns GetProjectContextResult on success:** Verified.
  - **Resolves schema before processing:** Verified. Loads schema via `SchemaProvider`.
  - **Renders project-level context entries:** Verified. Instructions are formatted with `**Source: instruction**` labels, files with `**Source: <file>**` labels and down-shifted headings.
  - **Applies project-level include/exclude patterns:** Verified. Processes all workspaces as active.
  - **Does not apply workspace-level patterns:** Verified. Ignores workspace-specific configurations.
  - **Supports dependsOn traversal when followDeps is true:** Verified. Traverses dependency graph with metadata/extraction fallback.
  - **Renders spec content from metadata when fresh:** Verified. Formats section rules, constraints, scenarios. Default sections in full mode (rules + constraints) are rendered when sections is absent.
  - **Falls back to extraction when metadata is stale or absent:** Verified. Emits `stale-metadata` warning, uses metadataExtraction engine, and fails explicitly if transform normalization fails.
  - **Project context optimization and invalidation:** Verified. Verifies cache freshness using config, contextFiles, and spec metadata hashes. Returns cached optimized context if fresh.
  - **Optimization warning signal:** Partial Compliance. Emits warning for missing/stale project metadata cache.
- **Implementation Status:** Substantially Compliant.
- **Discrepancies:**
  - **Port Injection Signature Mismatch:** Similar to `CompileContext`, the constructor receives `listWorkspaces` instead of a direct `specs` map.
  - **Missing Individual Spec Optimization Warning:** The spec states: _"When `llmOptimizedContext: true` is active, the compiler SHALL emit a warning if... Any spec included in the context is missing its `optimizedContext` field."_ Unlike `CompileContext`, the [GetProjectContext implementation](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-project-context.ts#L116) does **not** check for missing `optimizedContext` fields on individual specs. It only checks for project-level freshness.
- **Test Coverage:** Good. Tests verify instruction and file rendering, include/exclude pattern application, workspace exclusion, dependsOn traversal, fallback extraction, and cache verification.
- **Missing Tests:**
  - **Individual Spec Optimization Warning Tests:** There are no tests verifying `stale-optimization` warnings for individual specs missing optimized fields (since the feature itself is missing in the implementation).

---

### 3. `plugin-manager:agent-plugin-type`

- **Implementation File:** [`agent-plugin.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts)
- **Test File:** [`is-agent-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/domain/types/is-agent-plugin.spec.ts)
- **Spec Dependency Chain:**
  - [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/config/spec.md)
  - [`plugin-manager:specd-plugin-type`](file:///Users/monki/Documents/Proyectos/specd/specs/plugin-manager/specd-plugin-type/spec.md)
- **Requirements Summary:**
  - **AgentPlugin extends SpecdPlugin:** Verified. Defines the type `'agent'`, `install`, and `uninstall` contracts.
  - **AgentInstallOptions:** Verified. Standardizes capability collection (`mcp`, `agents`, `frontmatter`), skills/agents filters, and recursive template variables (`variables.frontmatter`, `variables.sharedFolder`).
  - **AgentInstallResult:** Verified. Tracks installed and skipped skills.
  - **Agent installation and fallback:** Verified. The fallback logic is a requirement for individual plugin implementations (e.g., `@specd/plugin-agent-claude`), not the plugin-manager package which only handles domain type declarations.
  - **isAgentPlugin type guard:** Verified. Exports a pure function `isAgentPlugin` validating `'agent'` type, `install` function, and `uninstall` function.
- **Implementation Status:** Fully Compliant.
- **Discrepancies:** None.
- **Test Coverage:** Good. Tests verify the type guard behaves correctly under valid plugin configurations, rejects wrong types, rejects missing methods, and validates options typing.
- **Missing Tests:** None.

---

## 3. General Consistency & Compliance

The core use case and type implementations conform to the project-wide (global) specs:

1. **Architecture (`specs/_global/architecture`)**: Follows clean architecture boundaries. Use cases act as pure command executors, utilizing standard interfaces/ports. Wiring/composition handles manual dependency injection.
2. **Conventions (`specs/_global/conventions`)**: Respects clean ESM configuration (`"type": "module"`) and TypeScript typing conventions.
3. **Testing (`specs/_global/testing`)**: Mock testing is implemented correctly using `vitest`.
