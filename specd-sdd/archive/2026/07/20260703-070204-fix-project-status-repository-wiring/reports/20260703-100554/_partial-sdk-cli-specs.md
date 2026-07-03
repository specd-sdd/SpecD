# Spec Compliance Audit Report

**Audited Specs:**

- `sdk:build-project-status-snapshot`
- `cli:project-status`

**Audited Files:**

- **Implementation:**
  - `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
  - `packages/cli/src/commands/project/status.ts`
- **Tests:**
  - `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
  - `packages/cli/test/commands/project-status.spec.ts`

---

## 1. Spec: `sdk:build-project-status-snapshot`

### Requirements Summary

The `buildProjectStatusSnapshot` function acts as a cross-package orchestration layer. Its requirements include:

1. Fetching project summary data via `ctx.kernel.project.getProjectSummary.execute()`.
2. Conditionally loading graph health diagnostics using `@specd/code-graph` (via `withOpenGraphProvider` and `getGraphHealth.execute()`) when `options.includeGraph` is `true`.
3. Returning a structured result object matching `BuildProjectStatusSnapshotResult` (exposing `summary`, `graphHealth`, `approvals`, `llmOptimizedContext`, and optionally `hotspots`).
4. Catching any graph provider or query failures to return `graphHealth: null` instead of throwing.
5. Not opening the graph provider when `includeGraph` is `false`.
6. Refraining from doing any presenter or text/JSON formatting.

### Implementation Status

- **Status:** **Fully Compliant**
- **Details:** The implementation in `packages/sdk/src/orchestration/build-project-status-snapshot.ts` aligns precisely with the orchestration logic.
  - Project summary is retrieved from `ctx.kernel.project.getProjectSummary.execute()`.
  - Config parameters (`approvals`, `llmOptimizedContext`) are read from `ctx.kernel.project.getConfig.execute()`.
  - Graph health is requested and checked only when `includeGraph` is `true`.
  - Errors are caught cleanly, returning `graphHealth: null` (and `hotspots: null` if hotspots were requested) without propagating exceptions.
  - Return shape conforms to `BuildProjectStatusSnapshotResult` structure.

### Discrepancies

- **None.** The implementation correctly matches all stated behaviors.

### Test Coverage

The test file `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts` covers the following:

- Graph provider skipping when `includeGraph` is `false`.
- Correct mock orchestration parameters (such as `codeGraphVersion` mapping to `package.json` version) when `includeGraph` is `true`.
- Correct loading and returning of hotspot data when `includeHotspots` is `true`.
- Graceful return of `graphHealth: null` when provider open fails.

### Test Coverage Gaps (Missing Tests)

1. **Explicit Project Summary Execution:** The tests verify that `result.summary` is populated, but do not explicitly assert that `getProjectSummary.execute` was called.
2. **Failure Handling with Hotspots:** There is no test verifying that when `includeHotspots` is `true` and the graph loading throws, `result.hotspots` is correctly returned as `null` rather than `undefined` or omitted.
3. **Hotspots Omission:** There is no assertion verifying that `result.hotspots` is completely omitted when `includeHotspots` is `false` or not provided.
4. **Partial Graph Failure (Hotspots Only):** There is no test for when `getGraphHealth.execute` succeeds but `provider.getHotspots()` throws (the implementation handles this via an inner `try/catch` on lines 80-84, setting `hotspots = null` while leaving `graphHealth` intact).

### Spec Dependency Chain

- `sdk:host-context` -> verified (satisfied via `SdkHostContext` type usage)
- `core:get-project-summary` -> verified (uses `ctx.kernel.project.getProjectSummary.execute()`)
- `code-graph:get-graph-health` -> verified (creates and executes `getGraphHealth`)

### JSDoc and Coding Conventions

- Full, well-formed JSDoc comments are present for `BuildProjectStatusSnapshotOptions`, `BuildProjectStatusSnapshotResult`, and `buildProjectStatusSnapshot` (documenting parameters and return types).
- Resolves workspace dependencies via pure manual injection pattern.

---

## 2. Spec: `cli:project-status`

### Requirements Summary

The `project status` command must:

1. Be registered under the `project` subcommand.
2. Output rich workspace information (projectRoot, schema, details of each workspace) via `ListWorkspaces`.
3. Include total spec count and workspace spec counts via `getProjectSummary.execute()` (no direct repository or orchestration counts).
4. Include change status totals (active, drafts, discarded, archived) via `getProjectSummary.execute()`.
5. Include approval gates and config flags (`specEnabled`, `signoffEnabled`, `llmOptimizedContext`).
6. Include graph freshness diagnostics (obtained via `buildProjectStatusSnapshot`).
7. Support `--graph` to fetch and display extended graph statistics (files, symbols, languages, hotspots).
8. Support `--context` to fetch and show context entries (relying on `GetProjectContext` with runtime overrides only, calling `llmOptimizedContext: false` when needed).
9. Output a `stale-optimization` warning to stderr if optimized context is missing/stale.
10. Default to plain text format, but support `json` and `toon` formats.
11. Bootstrap using `openSpecdHost`.

### Implementation Status

- **Status:** **Fully Compliant**
- **Details:** The command registered in `packages/cli/src/commands/project/status.ts` implements the required options, formats, and orchestration.
  - Utilizes `openSpecdHost` for bootstrapping.
  - Calls `buildProjectStatusSnapshot` with `includeGraph: true` to get summary, approvals, and graph health status.
  - Correctly maps workspace parameters and count summaries.
  - Implements `--graph` and `--context` options correctly, including double-calls to `GetProjectContext` to get raw spec lists when optimized context is fresh.
  - Handles the formatting (plain text, JSON, and TOON) as expected.

### Discrepancies

- **Warning Remediation Verification:** The spec dictates: _"The warning MUST include remediation instructions: "Launch specd-project-context-optimizer agent to generate it"."_
  The CLI implementation forwards warning messages from the core use case:
  `process.stderr.write("warning: " + w.message + "\n")`
  While the core use case does indeed generate a message containing those exact remediation instructions, the CLI does not enforce or check for this message format directly. This creates a coupling where the CLI's correctness depends on the specific warning message text defined in the core package.

### Test Coverage

The tests in `packages/cli/test/commands/project-status.spec.ts` verify:

- Subcommand registration (`status`).
- Count mapping to output for active, drafts, discarded, archived changes, and total spec count.
- JSON/TOON format output.
- `--context` flags (fresh context output, warning emission on stale optimized context, avoiding inline configuration, and passing correct overrides to `GetProjectContext.execute`).
- Graph freshness mapping (including null checks when graph is unavailable).
- Extended graph statistics representation with the `--graph` flag.

### Test Coverage Gaps (Missing Tests)

1. **Workspace Data Verification:** None of the tests configure or assert output values for non-empty workspaces. There is no check verifying that prefix, ownership, isExternal, or codeRoot are formatted correctly in text, JSON, or TOON outputs.
2. **Approval Gates and Config Flags Verification:** No test asserts that `approvals.spec`, `approvals.signoff`, or `llmOptimizedContext` are printed in the console output or included in formatted outputs.
3. **Hotspots Formatting:** No test asserts the output format of hotspots under the `--graph` option.
4. **JSON/TOON `--context` Output Format:** No test exercises `--context` combined with `--format json` or `--format toon` to verify that the output JSON/TOON contains the correct instruction, file, and spec entries.
5. **Config Path Forwarding:** There is no test asserting that passing `--config` to the command correctly forwards it to `openSpecdHost`.

### Spec Dependency Chain

- `core:list-workspaces` -> verified
- `core:get-project-summary` -> verified
- `core:get-project-context` -> verified
- `sdk:build-project-status-snapshot` -> verified
- `sdk:host-context` -> verified

### JSDoc and Coding Conventions

- Interface `ProjectStatusOptions` and function `registerProjectStatus` have JSDoc comments.
- Command options match Commander syntax guidelines.

---

## 3. Summary Counts

| Metric                       | `sdk:build-project-status-snapshot` | `cli:project-status`                |
| :--------------------------- | :---------------------------------- | :---------------------------------- |
| **Requirements Identified**  | 6                                   | 13                                  |
| **Requirements Implemented** | 6                                   | 13                                  |
| **Compliance Status**        | 100% Compliant                      | 100% Compliant (with coupling note) |
| **Test Coverage Gaps**       | 4                                   | 5                                   |
