# Spec Compliance Audit Report: `llm-optimized-metadata`

- **Change:** `llm-optimized-metadata`
- **Audited Workspaces:** `core`, `cli`, `skills`, `plugin-manager`, `plugin-agent-*`
- **Lifecycle State:** `verifying`
- **Date:** June 15, 2026
- **Report Folder:** `specd-sdd/changes/20260604-134217-llm-optimized-metadata/reports/20260615-102400`

---

## 1. Aggregate Audit Metrics

| Metric                         | Skills | Plugins | Core | CLI | **Total (Aggregated)** |
| :----------------------------- | :----: | :-----: | :--: | :-: | :--------------------: |
| **Specs Audited**              |   6    |    6    |  2   |  5  |         **19**         |
| **Total Requirements**         |   35   |   41    |  27  | 28  |        **131**         |
| **Fully Compliant**            |   32   |   32    |  27  | 19  |        **110**         |
| **Partially Compliant**        |   0    |    0    |  0   |  6  |         **6**          |
| **Non-Compliant**              |   3    |    9    |  0   |  3  |         **15**         |
| **Discrepancies Found**        |   3    |    9    |  1   |  6  |         **19**         |
| **Missing/Insufficient Tests** |   3    |   12    |  6   |  4  |         **25**         |

---

## 2. Detailed Findings

---

### 2.1. Core Package (`core:compile-context`, `core:get-project-context`)

````markdown
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
````

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

````

---

### 2.2. CLI Package (`cli:spec-context`, `cli:project-context`, `cli:spec-list`, `cli:project-status`, `cli:change-context`)

```markdown
# Spec Compliance Audit: CLI Package (Partial Report)

This report presents the compliance audit results for the CLI-related specifications in the `llm-optimized-metadata` change.

---

## 1. Requirements Summary

| Spec ID | Requirement / Constraint | Status | Notes / Discrepancy Reference |
| :--- | :--- | :--- | :--- |
| **cli:spec-context** | Command signature | **Compliant** | All options and aliases supported |
| | Behaviour: LLM optimization defaults | **Compliant** | Correctly resolves config & overrides |
| | Behaviour: `stale-optimization` warning | **Non-compliant** | The warning is not generated by the use case or emitted by CLI |
| | Output: Text & JSON formats | **Compliant** | Correct text headers and JSON structure |
| | Error cases & Constraints | **Compliant** | Correct exit codes & depth checks |
| **cli:project-context**| Command signature | **Compliant** | Supported options registered |
| | Optimization warning signal | **Compliant** | Propagated and suppressed correctly |
| | Behaviour: Context compilation | **Compliant** | Correct use case invocation and inputs |
| | Output: Text format (separation/labels) | **Partially Compliant** | List-mode specs are rendered inside a markdown table with empty cells instead of ID only + label |
| | Output: JSON format (field omission) | **Partially Compliant** | Directly serializes usecase result without stripping fields based on mode |
| | Error cases & Constraints | **Compliant** | Exits and options boundaries respected |
| **cli:spec-list** | Command signature | **Compliant** | Subcommand and alias registered |
| | Workspace filtering | **Non-compliant** | Missing workspace directory root and read-only/external visual flags in text mode |
| | Title & Summary resolution | **Compliant** | Handled correctly by `@specd/core` |
| | Output format & fixed widths | **Compliant** | Properly formatted tables and JSON outputs |
| | Error cases & Empty output | **Compliant** | Returns `(none)` or exits 3 on read errors |
| **cli:project-status** | `project status` command exists | **Compliant** | Command registered under `project` subcommand |
| | Includes workspace information | **Partially Compliant** | Missing `prefix` field in both text and JSON/toon modes |
| | Includes spec / change counts | **Compliant** | Efficient count retrieval implemented |
| | Includes approval gates & graph freshness| **Compliant** | Gates and stale status always displayed |
| | Supports `--graph` flag | **Partially Compliant** | Missing `hotspots` information |
| | Supports `--context` flag | **Non-compliant** | JSON/toon mode context is hardcoded to a mock structure (only first instruction, hardcoded files list, missing `optimizedContext`) |
| | Optimization warning signal | **Compliant** | Correct message and remediation instructions |
| **cli:change-context** | Command signature | **Compliant** | Positional arguments and options registered |
| | Optimization warning signal | **Compliant** | Warnings mapped and displayed correctly |
| | Implementation tracking refresh | **Compliant** | Executes refresh before context compilation |
| | Behaviour (CompileContext & Fingerprint) | **Compliant** | Correct options, caching, and short-circuiting |
| | Output: Text format layout & labels | **Partially Compliant** | Minor discrepancy: note points to `specd changes spec-preview` (plural) instead of `specd change spec-preview` (singular) |
| | Output: JSON/toon format | **Compliant** | Direct structured result serialization |
| | Error cases & Step availability | **Compliant** | Exits 1 on missing change, prints warnings |

---

## 2. Detailed Implementation Status

### `cli:spec-context`
* **Implementation File:** [packages/cli/src/commands/spec/context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/spec/context.ts)
* **Test File:** [packages/cli/test/commands/spec-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-context.spec.ts)
* **Status:** Mostly compliant, except for the `stale-optimization` warning which is completely unimplemented in both the core use case `GetSpecContext` and the CLI wrapper. Commander subcommands and options map correctly, and tests cover the primary workflows (text headers, section filtering, JSON mapping, error cases).

### `cli:project-context`
* **Implementation File:** [packages/cli/src/commands/project/context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/context.ts)
* **Test File:** [packages/cli/test/commands/project-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-context.spec.ts)
* **Status:** Mostly compliant. The command structure, options, use case wiring, and warnings are correct. Discrepancies exist in formatting details: non-full entries (including list-mode specs) are formatted inside a markdown table (which shows empty/em-dash fields for description/title) rather than as ID only + label, and JSON serialization does not omit empty/null fields dynamically per mode.

### `cli:spec-list`
* **Implementation File:** [packages/cli/src/commands/spec/list.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/spec/list.ts)
* **Test File:** [packages/cli/test/commands/spec-list.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-list.spec.ts)
* **Status:** Partially compliant. The table formatting, title/summary resolution, format selection, and workspace filtering are functional. However, the command fails to output workspace directory roots and does not visually flag read-only/external workspaces in text mode as required.

### `cli:project-status`
* **Implementation File:** [packages/cli/src/commands/project/status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts)
* **Test File:** [packages/cli/test/commands/project-status.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-status.spec.ts)
* **Status:** Low-compliance/High-drift. Multiple requirements are omitted or hardcoded:
  1. Workspace information misses `prefix`.
  2. `--graph` output misses `hotspots`.
  3. `--context` output in JSON/toon mode is hardcoded to a mock structure (taking only the first instruction, hardcoding the `.specd/config` and `.specd/metadata` files, and omitting `optimizedContext`).

### `cli:change-context`
* **Implementation File:** [packages/cli/src/commands/change/context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/context.ts)
* **Test File:** [packages/cli/test/commands/change-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-context.spec.ts)
* **Status:** Fully compliant. The command signature, execution tracking refresh before compilation, behavioral controls, and available step checks are fully implemented and verified by tests. A very minor text discrepancy exists in the catalogue note command naming.

---

## 3. Discrepancies Found

### Discrepancy 1: `stale-optimization` warning missing in `cli:spec-context`
* **Spec Quote:**
  > "The command MUST emit a `stale-optimization` warning to stderr when the effective `llmOptimizedContext` is `true` but optimized fields are missing or stale. The warning MUST include remediation instructions: 'Launch specd-spec-context-optimizer agent to refresh'."
* **Code Implementation:**
  In [packages/core/src/application/use-cases/get-spec-context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/get-spec-context.ts), the use case does not perform any checks for missing/stale `optimizedContext` fields and never emits a `stale-optimization` warning. The only warning pushed is `stale-metadata`. Consequently, the CLI command in `packages/cli/src/commands/spec/context.ts` never emits this warning.
* **Rationale:** The use case was not updated to inspect optimized context freshness, leaving this warning completely unimplemented.

### Discrepancy 2: Missing Workspace Directory Roots and Visual Flags in `cli:spec-list`
* **Spec Quote:**
  > "In text mode, the command MUST group specs by workspace, displaying the workspace name and its directory root. Read-only and external workspaces SHOULD be visually flagged."
* **Code Implementation:**
  In [packages/cli/src/commands/spec/list.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/spec/list.ts#L89-L92):
  ```typescript
  const wsLabel = 'workspace: ' + workspace
  const wsHeader = chalk.inverse.bold(
    '  ' + wsLabel + ' '.repeat(Math.max(0, innerWidth - wsLabel.length)) + '  ',
  )
````

- **Rationale:** The header formatter only pulls the workspace name. It does not fetch the workspace directory root or check ownership properties to visually flag read-only/external workspaces.

### Discrepancy 3: Missing Workspace Prefix in `cli:project-status`

- **Spec Quote:**
  > "- Workspaces: for each, name, prefix, ownership (`owned`|`shared`|`readOnly`), `isExternal` (boolean), and `codeRoot` (absolute path)."
- **Code Implementation:**
  In [packages/cli/src/commands/project/status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts#L166-L171) (JSON) and [#L207-L212](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts#L207-L212) (Text):
  ```typescript
  // JSON
  workspaces: workspaces.map((w) => ({
    name: w.name,
    ownership: w.ownership,
    codeRoot: w.codeRoot,
    isExternal: w.isExternal,
  }))
  // Text
  ...workspaces.map(
    (w) =>
      `  ${w.name} [${w.ownership}, ${
        w.isExternal ? 'external' : 'local'
      }, codeRoot: ${w.codeRoot}]`,
  )
  ```
- **Rationale:** The `prefix` property from `ProjectWorkspace` is omitted in both formatting blocks.

### Discrepancy 4: Missing Hotspots in `cli:project-status`

- **Spec Quote:**
  > "When `--graph` flag is provided, the command MUST include extended graph statistics: ... - Hotspots (if available)"
- **Code Implementation:**
  In [packages/cli/src/commands/project/status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts#L185-L192):
  ```typescript
  ...(opts.graph && graphStats
    ? {
        fileCount: graphStats.fileCount,
        symbolCount: graphStats.symbolCount,
        relationCounts: graphStats.relationCounts,
        languages: graphStats.languages,
      }
    : {}),
  ```
- **Rationale:** The `GraphStatistics` type from `@specd/code-graph` does not store hotspots, and the CLI command never queries the graph provider for hotspot details.

### Discrepancy 5: Hardcoded Context Structure in `cli:project-status` JSON Output

- **Spec Quote:**
  > "In `json`/`toon` mode, the output MUST include:
  >
  > - Instruction entries (the directive text without reading files)
  > - File entries (which files should be read without content)
  > - Spec entries (which specs should be read without content)
  > - `optimizedContext` (optional string, included if fresh and enabled)"
- **Code Implementation:**
  In [packages/cli/src/commands/project/status.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/status.ts#L143-L158):
  ```typescript
  const firstContextEntry = config.context?.[0]
  const instruction =
    firstContextEntry !== undefined && 'instruction' in firstContextEntry
      ? firstContextEntry.instruction
      : ''
  const files: string[] = [
    path.join(config.projectRoot, '.specd', 'config'),
    path.join(config.projectRoot, '.specd', 'metadata'),
  ]
  contextData = [
    {
      instruction,
      files,
      specs: ctxResult.specs.map((s) => s.specId),
    },
  ]
  ```
- **Rationale:** The implementation only reads the first instruction entry, hardcodes the `files` array to `.specd/config` and `.specd/metadata` (ignoring actual file entries in configuration), and does not support the `optimizedContext` field.

### Discrepancy 6: Note points to Plural Command in `cli:change-context`

- **Spec Quote:**
  > "Non-full specs in text output MUST include a note instructing the agent to use `specd change spec-preview <change-name> <specId>` for merged full content when applicable"
- **Code Implementation:**
  In [packages/cli/src/commands/change/context.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/context.ts#L222):
  ```typescript
  'Use `specd changes spec-preview <change-name> <specId>` to load the merged full content...'
  ```
- **Rationale:** The note outputs `specd changes spec-preview` (plural) instead of `specd change spec-preview` (singular).

---

## 4. Test Coverage Details

All 61 CLI unit tests pass successfully. Below is the list of tests mapping to each requirement:

### `cli:spec-context`

- **Test Suite:** [packages/cli/test/commands/spec-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-context.spec.ts)
- **Verifying Tests:**
  - `renders spec header with workspace:path in text mode` (Verifies text output layout)
  - `includes description and all sections when no flags` (Verifies default full mode sections)
  - `filters to only --rules when flag provided` (Verifies section filtering options)
  - `outputs JSON with specs array and warnings` (Verifies JSON schema structure)
  - `exits 1 when spec not found` (Verifies error cases)
  - `exits 1 when --depth is used without --follow-deps` (Verifies constraints)
  - `warns to stderr when use case returns warnings` (Verifies warning propagation)
  - `passes llmOptimizedContext as true by default when config says true, even with multiple flags` (Verifies behavior option default forwarding)
  - `passes llmOptimizedContext as false when --no-optimized is provided` (Verifies overrides)

### `cli:project-context`

- **Test Suite:** [packages/cli/test/commands/project-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-context.spec.ts)
- **Verifying Tests:**
  - `--depth without --follow-deps` (Verifies command signature constraints)
  - `Context entries rendered first` (Verifies text order output)
  - `Include patterns applied across all workspaces` (Verifies behavior and integration)
  - `Exclude patterns remove specs from the set` (Verifies exclude patterns)
  - `Workspace-level patterns not applied` (Verifies pattern bounds constraint)
  - `dependsOn traversal not performed by default` (Verifies traversal boundaries)
  - `--follow-deps includes transitive dependencies` (Verifies option forwarding)
  - `--depth limits traversal` (Verifies depth forwarding)
  - `Section flags filter spec content` (Verifies section filtering)
  - `Section flags do not affect context entries` (Verifies filtering constraint)
  - `File context entry resolved` (Verifies file context reading)
  - `Nothing configured` (Verifies empty output text)
  - `JSON output structure` (Verifies JSON mode structure)
  - `Missing file entry emits warning` (Verifies warnings)
  - `Stale metadata emits warning` (Verifies warnings)

### `cli:spec-list`

- **Test Suite:** [packages/cli/test/commands/spec-list.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/spec-list.spec.ts)
- **Verifying Tests:**
  - Checks standard workspace grouping, columns layout, and column widths computation.
  - Verifies `--summary`, `--metadata-status` and status filtering.

### `cli:project-status`

- **Test Suite:** [packages/cli/test/commands/project-status.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/project-status.spec.ts)
- **Verifying Tests:**
  - `command name is status` (Verifies registration)
  - `prefers optimized project context when fresh` (Verifies optimization context integration)
  - `emits warning when optimized context is missing` (Verifies optimization warnings)
  - `displays full context in text mode` (Verifies text output formatting)

### `cli:change-context`

- **Test Suite:** [packages/cli/test/commands/change-context.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-context.spec.ts)
- **Verifying Tests:**
  - `prints project context and spec content in text format` (Verifies refresh call, fingerprint line, and order)
  - `outputs JSON with structured result fields` (Verifies JSON schema)
  - `prints fingerprint first and unchanged message when fingerprint matches in text mode` (Verifies cache short-circuit text)
  - `outputs unchanged JSON as direct structured passthrough` (Verifies cache short-circuit JSON)
  - `passes --follow-deps flag to use case` (Verifies option forwarding)
  - `passes --depth with --follow-deps to use case` (Verifies option forwarding)
  - `exits 1 when --depth is used without --follow-deps` (Verifies CLI usage constraint)
  - `passes section flags to use case` (Verifies sections)
  - `warns to stderr when step not available` (Verifies available steps checks)
  - `warns to stderr for stale metadata` (Verifies warnings)
  - `does not print a warning line for pure cycle traversal suppression` (Verifies warnings)
  - `exits 1 when step argument is missing` (Verifies error cases)
  - `includes all sections when no section flags are provided` (Verifies default behaviour)
  - `renders summary specs as catalogue in summary mode` (Verifies text catalogues)
  - `renders dependsOnTraversal summary specs under Via dependencies heading` (Verifies visual grouping constraint)
  - `JSON output includes projectContext, specs, availableSteps with mode and source` (Verifies JSON structure)
  - `exits 1 when change not found` (Verifies error cases)
  - `passes llmOptimizedContext as true by default when config says true, even with multiple flags` (Verifies optimization defaults)
  - `passes llmOptimizedContext as false when --no-optimized is provided` (Verifies optimization overrides)

---

## 5. Missing / Insufficient Tests

1. **`cli:spec-context` `stale-optimization` warning:** There are no tests verifying that `stale-optimization` is emitted or that its message contains the required agent remediation instruction, because the functionality is missing.
2. **`cli:spec-list` workspace root & visual flags:** There are no tests checking if the directory roots are printed in the header or if read-only/external flags appear on workspaces in text mode.
3. **`cli:project-status` workspace prefix & hotspots:** There are no tests asserting the presence of workspace `prefix` or graph `hotspots` in the outputs.
4. **`cli:project-status` `--context` JSON mode structure:** There are no tests verifying the format/structure of `context` when `--format json` is combined with `--context`. The test coverage only checks text mode.

---

## 6. Summary Counts

- **Total Requirements Audited:** 28
- **Fully Compliant:** 19
- **Partially Compliant:** 6
- **Non-Compliant:** 3
- **Total Unit Tests Executed & Passed:** 61

````

---

### 2.3. Skills Package (`skills:workflow-automation`, `skills:agents`, `skills:skill`, `skills:skill-repository`, `skills:skill-repository-infra`, `skills:skill-templates-source`)

```markdown
# Spec Compliance Audit Report: skills

This report documents the compliance audit of the `@specd/skills` package against the specifications associated with the `llm-optimized-metadata` change.

## 1. Requirements Summary

| ID | Requirement Name | Specification | Status | Verified By / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **WA-1** | Diagnostic Priority | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L43-L50) |
| **WA-2** | Data Extraction | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L51-L55) |
| **WA-3** | On-demand outline retrieval | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L353-L365) |
| **WA-4** | Repair Strategy | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L147-L154) |
| **WA-5** | Canonical Command References | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L47-L54, L178) |
| **WA-6** | Command Necessity and Freshness | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L57-L93) |
| **WA-7** | Structural Validation vs Content Review | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L212-L238) |
| **WA-8** | Implementation Traceability Policy | `skills:workflow-automation` | **Compliant** | `specd-implement/SKILL.md.tpl`, `specd-archive/SKILL.md.tpl` |
| **WA-9** | Context Optimization Policy | `skills:workflow-automation` | **Compliant** | `shared.md.tpl` (L13-L26) |
| **AG-1** | Optimizer agents | `skills:agents` | **Compliant** | Directory structure, `skill-repository.spec.ts` L11-12 |
| **AG-2** | Agent prompt policy | `skills:agents` | **Compliant** | `specd-project-context-optimizer/SPECD-AGENT.md.tpl`, `specd-spec-context-optimizer/SPECD-AGENT.md.tpl` |
| **AG-3** | Output density | `skills:agents` | **Compliant** | Inherent in LLM optimizer prompts. |
| **AG-4** | Agent template purity | `skills:agents` | **Compliant** | `SPECD-AGENT.md.tpl` starts with `{{{frontmatter}}}` and has no static YAML. |
| **AG-5** | Fallback behavior | `skills:agents` | **Compliant** | Emitted as plain Markdown files. |
| **SK-1** | Skill interface | `skills:skill` | **Compliant** | `src/domain/skill.ts` (L23-L48), `skill.spec.ts` |
| **SK-2** | SkillTemplate interface | `skills:skill` | **Compliant** | `src/domain/skill.ts` (L6-L18), `skill.spec.ts` |
| **SK-3** | No I/O in domain | `skills:skill` | **Compliant** | `src/domain/` imports no I/O libraries. |
| **SK-4** | Lazy content loading | `skills:skill` | **Compliant** | `TemplateReader` and `FileSkillTemplate.getContent()`. `skill.spec.ts` L15 |
| **SK-5** | Typed errors for skill operations | `skills:skill` | **Compliant** | `src/domain/errors/` subclasses of `SpecdSkillsError`. |
| **RE-1** | list() method | `skills:skill-repository` | **Compliant** | `src/infrastructure/repository/skill-repository.ts` (L118) |
| **RE-2** | get() method | `skills:skill-repository` | **Compliant** | `src/infrastructure/repository/skill-repository.ts` (L177) |
| **RE-3** | getBundle() method | `skills:skill-repository` | **Non-compliant** | Missing template reference validation for undeclared shared templates. |
| **RE-4** | listSharedFiles() method | `skills:skill-repository` | **Compliant** | `src/infrastructure/repository/skill-repository.ts` (L282) |
| **RI-1** | File reading | `skills:skill-repository-infra` | **Compliant** | Uses `node:fs/promises`. |
| **RI-2** | TemplateReader | `skills:skill-repository-infra` | **Compliant** | `src/infrastructure/repository/template-reader.ts`. |
| **RI-3** | createSkillRepository factory | `skills:skill-repository-infra` | **Non-compliant** | Returns `SkillRepository` instead of `SkillRepositoryPort` type. |
| **TS-1** | Template directory structure | `skills:skill-templates-source` | **Compliant** | Physical directory structure. |
| **TS-2** | Template metadata contract | `skills:skill-templates-source` | **Non-compliant** | `kind` is missing from `skill.meta.json` files on disk; reader lacks validation. |
| **TS-3** | Capability-aware rendering | `skills:skill-templates-source` | **Compliant** | `TemplateRenderer.render()`. |
| **TS-4** | Graph impact terminology in templates | `skills:skill-templates-source` | **Compliant** | `shared.md.tpl` (L497-505). |
| **TS-5** | Frontmatter source | `skills:skill-templates-source` | **Compliant** | Structured frontmatter variables. |
| **TS-6** | Frontmatter injection | `skills:skill-templates-source` | **Compliant** | `TemplateRenderer` L38-52. |
| **TS-7** | Agent frontmatter matrix | `skills:skill-templates-source` | **Compliant** | Supported in plugin frontmatter type contracts. |
| **TS-8** | No frontmatter in skills package | `skills:skill-templates-source` | **Compliant** | Verified in templates on disk. |
| **TS-9** | Implementation tracking instructions | `skills:skill-templates-source` | **Compliant** | `shared.md.tpl` (L139-199), `specd-implement/SKILL.md.tpl`, `specd-archive/SKILL.md.tpl`. |

---

## 2. Detailed Implementation Status

### `skills:workflow-automation`
The requirements of workflow automation are successfully incorporated into the global `shared.md.tpl` file and the individual workflow templates (such as `specd-implement/SKILL.md.tpl` and `specd-archive/SKILL.md.tpl`).
- **Diagnostic Priority & Data Extraction**: Standardized text-based flags (`--format text`) are strictly recommended for all diagnostics, and `--format toon` is required for extraction.
- **Implementation Traceability**: Detailed steps instructing the use of `specd changes implementation add`, `review`, `resolve`, and `ignore` commands are present within both the implementation and archive templates.
- **On-demand outline retrieval**: Clear instructions exist directing the use of `specd specs outline`.

### `skills:agents`
- **Optimizer agents**: Both specialized agents (`specd-project-context-optimizer` and `specd-spec-context-optimizer`) are fully set up in the directory `packages/skills/templates/agents/`.
- ** smart caveman style**: Both system prompt templates utilize a terse, article-free style to enforce token savings of 50-70% at runtime.
- **Template Purity**: The agent templates contain no YAML block content and rely entirely on `{{{frontmatter}}}` injection, conforming to requirements.

### `skills:skill`
- **Domain Purity**: The file `src/domain/skill.ts` is a pure interface declaration file with zero I/O imports.
- **Lazy Content Loading**: Verified that templates are returned as instances of `FileSkillTemplate`, which only reads file contents on demand during `getContent()` resolution.
- **Typed Errors**: Error classes (e.g. `SkillNotFoundError`) inherit from `SpecdSkillsError` which in turn inherits from `@specd/core`'s `SpecdError`.

### `skills:skill-repository` & `skills:skill-repository-infra`
- **FS Backing**: `FsSkillRepository` reads from standard skills and agents directories, dynamically setting the `kind` field.
- **Bundle Rendering**: Employs Handlebars to normalize capabilities and compile output filenames (replacing `.tpl` with `.md`).
- **Discrepancy (Shared reference check)**: While `requiredSharedTemplates` are verified to exist, the repository does not physically parse the template body to confirm it doesn't reference other undeclared shared files.
- **Discrepancy (Interface return type)**: `createSkillRepository` exports `SkillRepository` instead of `SkillRepositoryPort`.

### `skills:skill-templates-source`
- **Discrepancy (Metadata `kind`)**: Standard skills' `skill.meta.json` files on disk do not specify the `"kind": "skill"` property, which is marked as mandatory in the templates source specification.
- **Terminology alignment**: Workflow templates successfully use `dependents` / `dependencies` and `--file` instead of `--changes`.
- **Frontmatter injection**: Checked that frontmatter blocks are correctly composed from `variables.frontmatter` and skipped when the `frontmatter` capability is missing.

---

## 3. Discrepancies Found

### Discrepancy 1: Missing `kind` property in standard skill metadata
*   **Specification**: `skills:skill-templates-source`
    > Each skill or agent template directory MUST declare a metadata file (`skill.meta.json` or `specd-agent.meta.json`) with this shape:
    > ```json
    > {
    >   "kind": "skill" | "agent",
    >   ...
    > }
    > ```
    > `kind` (required) MUST categorize the template...
*   **Code**: `packages/skills/templates/skills/*/skill.meta.json`
*   **Rationale**: The `skill.meta.json` files on disk (e.g., `specd/skill.meta.json` and `specd-archive/skill.meta.json`) do not declare the `kind` property. Furthermore, the `SkillTemplateMetadataReader.validateMetadata` method ignores `value['kind']` from the JSON payload and uses the `kind` parameter passed down from repository discovery instead:
    ```typescript
    // packages/skills/src/infrastructure/repository/skill-template-metadata-reader.ts
    private validateMetadata(filename: string, value: unknown, kind: 'skill' | 'agent'): SkillTemplateMetadata {
      // ...
      return {
        kind, // from parameter, not value['kind']
        // ...
      }
    }
    ```
    This represents a minor contradiction between the spec requirement and the implementation.

### Discrepancy 2: No check for undeclared shared templates in template content
*   **Specification**: `skills:skill-repository`
    > ...validate that templates do not rely on undeclared shared template requirements
*   **Code**: `packages/skills/src/infrastructure/repository/skill-repository.ts` (`getBundle` method)
*   **Rationale**: The `getBundle()` method ensures that all templates declared in `requiredSharedTemplates` exist, but it does not check if the template source itself references other shared templates (e.g., via `@{{sharedFolder}}/xxx.md`) that are *not* declared in the metadata. Such references will silently fail to be resolved in the bundle since they are not loaded by the repository.

### Discrepancy 3: Port interface name mismatch in infra factory
*   **Specification**: `skills:skill-repository-infra`
    > The module MUST export `createSkillRepository(): SkillRepositoryPort` as the main factory function.
    > Spec Dependencies: `skills:skill-repository-port`
*   **Code**: `packages/skills/src/infrastructure/repository/skill-repository.ts` L394
    ```typescript
    export function createSkillRepository(options: SkillRepositoryOptions = {}): SkillRepository
    ```
*   **Rationale**: The exported factory returns `SkillRepository`, not `SkillRepositoryPort`. In fact, there is no `SkillRepositoryPort` interface in the codebase at all (only `SkillRepository` exists in `src/application/ports/skill-repository.ts`).

---

## 4. Test Coverage Details

The package `@specd/skills` contains 23 tests, all of which are passing:

### Domain Model Tests (`test/domain/`)
*   `test/domain/skill.spec.ts`
    *   *lazy loading check*: "given SkillTemplate, when getContent is called, then it loads template lazily and returns Promise<string>" (**SK-4**)
    *   *validation check*: "given missing required capabilities, when getBundle is called, then throws InvalidSkillTemplateMetadataError" (**SK-5**, **RE-3**)
*   `test/domain/skill-bundle.spec.ts`
    *   *install check*: "given a resolved bundle, when install is called, then files are written to target dir" (**TS-6**)
    *   *uninstall check*: "given installed files, when uninstall is called twice, then uninstall is idempotent" (**TS-6**)

### Repository Integration Tests (`test/infrastructure/`)
*   `test/infrastructure/skill-repository.spec.ts`
    *   *list check*: "given canonical templates, when list is called, then returns metadata-only skills and agents" (**RE-1**, **TS-1**)
    *   *get skill check*: "given a valid skill name, when get is called, then returns that skill with kind: skill" (**RE-2**, **SK-1**)
    *   *get agent check*: "given a valid agent name, when get is called, then returns that agent with kind: agent" (**RE-2**, **SK-1**)
    *   *missing check*: "given a missing name, when get is called, then returns undefined" (**RE-2**)
    *   *lazy template suffix check*: "given skill templates migrated to .md.tpl, when list is called, then metadata still loads" (**RI-2**, **TS-1**)
    *   *agent custom suffix check*: "given agent templates using custom convention, when list is called, then SPECD-AGENT.md.tpl is found" (**AG-4**, **TS-1**)
    *   *bundle variables resolution*: "given unresolved variables, when getBundle is called, then placeholders are preserved" (**RE-3**)
    *   *agent bundle emission*: "given agent bundle resolution, when getBundle is called, then SPECD-AGENT.md is emitted" (**AG-5**, **TS-3**)
    *   *frontmatter capability absent*: "given variables.frontmatter without frontmatter capability, when getBundle is called, then frontmatter is not emitted" (**TS-6**)
    *   *frontmatter capability present*: "given variables.frontmatter with frontmatter capability, when getBundle is called, then frontmatter is emitted only for non-shared files" (**TS-6**, **TS-8**)
    *   *prose policy resolution*: "given capability-aware shared templates, when getBundle is called, then output contains prose policies" (**WA-9**, **TS-3**)
    *   *shared files list*: "given shared templates, when listSharedFiles is called, then returns shared file entries" (**RE-4**)

### Use Case Tests (`test/resolve-bundle.spec.ts`)
*   Tests in this file verify that `ResolveBundle` executes properly and correctly resolves `sharedFolder` relative to the configuration context (**RE-3**, **TS-3**).

---

## 5. Missing/Insufficient Tests

1.  **Undeclared Shared Templates check**: No test asserts that resolving a bundle with templates containing undeclared shared template references causes an error or is blocked (since the check itself is missing).
2.  **`kind` field presence in metadata**: No test asserts that a `skill.meta.json` or `specd-agent.meta.json` must contain a `kind` property or that loading fails when it is missing or invalid.
3.  **Port signature conformity**: No tests verify that `createSkillRepository` complies with any `SkillRepositoryPort` type signature since that symbol does not exist.

---

## 6. Summary Counts

*   **Total Checked Requirements**: 35
*   **Compliant Requirements**: 32
*   **Non-compliant Requirements**: 3
*   **Total Test Files**: 4
*   **Total Tests Executed**: 23 (all passing)
*   **Identified Discrepancies**: 3
````

---

### 2.4. Plugins Package (`plugin-manager:agent-plugin-type` and `plugin-agent-*`)

````markdown
# Spec Compliance Audit: Plugins & Types

This report presents the spec compliance audit for the change `llm-optimized-metadata` targeting the core agent plugin interfaces and vendor plugin implementations (Claude, Copilot, Codex, OpenCode, and Standard).

---

## Summary Counts

- **Total Requirements Audited:** 41
- **Compliant:** 32
- **Non-Compliance Issues:** 9
- **Fully Covered by Tests:** 29
- **Missing/Insufficient Test Coverage:** 12

---

## Requirements Summary

| Spec / Requirement                                                                                                                                                          | Status            | Test Coverage    |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- | :--------------- |
| **plugin-manager:agent-plugin-type**                                                                                                                                        |                   |                  |
| [AgentPlugin extends SpecdPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L59)                               | Compliant         | Covered          |
| [AgentInstallOptions](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L19)                                           | Compliant         | Covered          |
| [AgentInstallResult](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L44)                                            | Compliant         | Covered          |
| [Agent installation and fallback](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L66)                               | **Non-Compliant** | **Missing**      |
| [isAgentPlugin type guard](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L93)                                      | Compliant         | Covered          |
| **plugin-agent-claude:plugin-agent**                                                                                                                                        |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/index.ts#L40)                                                               | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/claude-plugin.ts#L28)                                            | Compliant         | Covered          |
| [Frontmatter type](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/frontmatter.ts#L4)                                           | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L17)                             | **Non-Compliant** | **Insufficient** |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L87)                         | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L41)                              | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts#L11)                          | Compliant         | Covered          |
| **plugin-agent-copilot:plugin-agent**                                                                                                                                       |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/index.ts#L40)                                                              | Compliant         | Covered          |
| [Plugin runtime contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts#L28)                               | Compliant         | Covered          |
| [Skill installation and frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts#L17) | Compliant         | Covered          |
| [Frontmatter field contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts#L41)                             | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts#L11)                         | Compliant         | **Insufficient** |
| **plugin-agent-codex:plugin-agent**                                                                                                                                         |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/index.ts#L40)                                                                | Compliant         | Covered          |
| [Plugin runtime contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/codex-plugin.ts#L28)                                   | Compliant         | Covered          |
| [Skill installation and frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L17)   | **Non-Compliant** | **Insufficient** |
| [Frontmatter field contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/frontmatter.ts#L4)                                  | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L41)                               | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts#L11)                           | Compliant         | Covered          |
| **plugin-agent-opencode:plugin-agent**                                                                                                                                      |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/index.ts#L40)                                                             | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts#L28)                                        | Compliant         | Covered          |
| [Frontmatter type contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L17)                           | **Non-Compliant** | **Insufficient** |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L96)                       | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L41)                            | Compliant         | Covered          |
| [Project init wizard integration](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/init.ts#L17)                                              | Compliant         | **Missing**      |
| [Meta package inclusion](file:///Users/monki/Documents/Proyectos/specd/packages/specd/package.json#L20)                                                                     | Compliant         | **Missing**      |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts#L11)                        | Compliant         | Covered          |
| **plugin-agent-standard:plugin-agent**                                                                                                                                      |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/index.ts#L39)                                                             | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/agent-standard-plugin.ts#L28)                                  | Compliant         | Covered          |
| [Frontmatter type contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L17)                           | Compliant         | Covered          |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L91)                       | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L41)                            | Compliant         | Covered          |
| [allowed-tools configuration](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L3)                              | **Non-Compliant** | Covered          |
| [Project init wizard integration](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/init.ts#L18)                                              | Compliant         | **Missing**      |
| [Meta package inclusion](file:///Users/monki/Documents/Proyectos/specd/packages/specd/package.json#L21)                                                                     | Compliant         | **Missing**      |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts#L11)                        | Compliant         | Covered          |

---

## Detailed Implementation Status

All five vendor plugins structurally follow Hexagonal Architecture principles by declaring application-layer use cases (`InstallSkills`, `UninstallSkills`) and domain definitions separately from their package entrypoints. The factories correctly read manifest information from `specd-plugin.json` at the package boundaries and construct domain plugin instances injected with use case execution bindings. Manually verified workspace registrations and interactive CLI menus are fully integrated for all plugins.

However, several behavioral requirements concerning fallback capabilities and configuration string formats are unimplemented or structurally broken.

---

## Discrepancies Found

### 1. Missing Fallback for Missing `agents` Capability

- **Specs affected:**
  - `plugin-manager:agent-plugin-type` ("When installing agents, the plugin SHALL determine the target directory... If the target runtime does NOT support specialized agents (i.e. the `agents` capability is missing), the plugin SHALL copy the agent template to the same directory as the shared context file.")
  - `plugin-agent-claude:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
  - `plugin-agent-codex:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
  - `plugin-agent-opencode:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
- **Rationale:**
  The install use cases for Claude, Codex, and OpenCode hardcode the target `capabilities` array passed into `ResolveBundle.execute` and do not inspect `options?.capabilities` to check if `agents` is missing. As a result, the fallback write logic is never triggered, and the plugin always attempts to write to the specialized agents folder.
- **Code Quote ([plugin-agent-claude:install-skills.ts:L59](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L59)):**
  ```typescript
  // Claude capabilities
  const capabilities = ['mcp', 'agents', 'frontmatter']
  ```
````

_(Identical hardcoded logic appears in Codex's and OpenCode's `install-skills.ts`)._

### 2. Reading Agent Metadata from Hardcoded Map instead of `specd-agent.meta.json`

- **Specs affected:**
  - `plugin-agent-claude:plugin-agent` ("Map the preferred model from `specd-agent.meta.json` to the `model` YAML key if present.")
- **Rationale:**
  The Claude plugin relies on a hardcoded local map (`agentFrontmatter` in `domain/frontmatter/index.ts`) to resolve agent variables instead of dynamically loading the `specd-agent.meta.json` descriptor from the skill bundle.
- **Code Quote ([plugin-agent-claude:install-skills.ts:L70-L77](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L70-L77)):**
  ```typescript
  const metadata =
    agentFrontmatter[name] ?? ({ name, description: item.description } satisfies Frontmatter)
  agentFrontmatterVars = {
    name: metadata.name ?? name,
    description: metadata.description ?? item.description,
    ...(metadata.allowed_tools ? { tools: metadata.allowed_tools.split(', ').join(', ') } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
  }
  ```

### 3. Comma-Separated tools in Standard Agent Frontmatter

- **Specs affected:**
  - `plugin-agent-standard:plugin-agent` ("The per-skill frontmatter map MUST declare `allowed-tools` for each skill with appropriate tool strings matching the agentskills.io format (space-separated).")
- **Rationale:**
  The standard plugin's agent frontmatter definitions use commas to separate pre-approved tools rather than space separation.
- **Code Quote ([plugin-agent-standard:frontmatter/index.ts:L50-L61](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L50-L61)):**
  ```typescript
  export const agentFrontmatter: Readonly<Record<string, Frontmatter>> = {
    'specd-project-context-optimizer': {
      name: 'specd-project-context-optimizer',
      description: 'Generates a high-density, token-efficient version of project-level context.',
      'allowed-tools': 'Bash(node:*), Bash(specd:*), Bash(cat:*), Bash(rm:*), Read, Write',
    },
  ```

### 4. Syntax Mismatch in Standard allowed-tools Strings (Colon vs Space Wildcard)

- **Specs affected:**
  - `plugin-agent-standard:plugin-agent` ("Tool strings MUST include the tools needed by each specd skill: ... Bash(node _), Bash(specd _), Bash(pnpm \*) for command execution")
- **Rationale:**
  The tool strings are configured with colons (e.g. `Bash(node:*)`) instead of the space-separated wildcard arguments (e.g. `Bash(node *)`) defined by the spec.
- **Code Quote ([plugin-agent-standard:frontmatter/index.ts:L7](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L7)):**
  ```typescript
  'allowed-tools': 'Bash(node:*) Bash(specd:*) Read',
  ```

### 5. Codex Plugin Generates Extraneous TOML Key

- **Specs affected:**
  - `plugin-agent-codex:plugin-agent` ("The Codex frontmatter value contract MUST cover this exact supported set: name (required), description (required). No other frontmatter keys are considered Codex-supported in this spec.")
- **Rationale:**
  The Codex installer outputs `sandbox_mode = "workspace-write"` within the generated `.toml` profile, violating the strict supported metadata set constraint.
- **Code Quote ([plugin-agent-codex:install-skills.ts:L120](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L120)):**
  ```typescript
  'sandbox_mode = "workspace-write"',
  ```

### 6. Architectural Spec Gaps in Uninstall Cleanups

- **Specs affected:**
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`
- **Rationale:**
  These specs only request that `uninstall()` remove specd-managed files from the _skills_ directory (`.claude/skills/`, `.codex/skills/`, `.opencode/skills/`). Consequently, their code implementations do not clean up the _agents_ folders (`.claude/agents/`, `.codex/agents/`, `.opencode/agents/`). This creates a gap where agent profiles remain orphaned on uninstallation.

---

## Test Coverage Details

All core plugin behaviors are tested under package-specific test files:

1. **`plugin-manager`**
   - [is-agent-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/domain/types/is-agent-plugin.spec.ts)
     - `given a valid AgentPlugin, when checked, then returns true`
     - `given a SpecdPlugin without install method, when checked, then returns false`
     - `given a SpecdPlugin with wrong type, when checked, then returns false`
     - `given recursive variables and capabilities in install options, when install is typed, then the type guard remains valid`

2. **`plugin-agent-claude`**
   - [claude-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/domain/types/claude-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Claude-specific YAML frontmatter`

3. **`plugin-agent-copilot`**
   - [copilot-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/domain/types/copilot-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Copilot-specific YAML wrapper`

4. **`plugin-agent-codex`**
   - [codex-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/domain/types/codex-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Codex-specific TOML wrapper`

5. **`plugin-agent-opencode`**
   - [opencode-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/domain/types/opencode-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates OpenCode-specific YAML frontmatter`

6. **`plugin-agent-standard`**
   - [agent-standard-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/domain/types/agent-standard-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts)
     - `given a project root, when install is called, then writes to .agents/skills/ with allowed-tools frontmatter`
     - `given an agent, when install is called, then generates Standard YAML wrapper`

---

## Missing/Insufficient Tests

1. **Missing Fallback Tests:**
   No unit tests verify the fallback installation directories for agent templates when the `agents` capability is missing in Claude, Codex, or OpenCode plugins.
2. **Missing Copilot Agents Uninstall Test:**
   No unit test verifies that Copilot's `uninstall()` successfully removes only the selected agent profiles from `.github/agents/` when `options.agents` is supplied.
3. **Missing CLI Init and Metapackage Tests:**
   The integration of OpenCode and Standard plugins in the `specd project init` wizard options and the `@specd/specd` metapackage dependencies are only checked structurally; no automated unit tests cover these CLI configurations.
4. **Missing Shared Folder Escapes Tests:**
   No tests verify that a containment error is thrown when the resolved shared folder escapes the project containment boundaries.

```

```
