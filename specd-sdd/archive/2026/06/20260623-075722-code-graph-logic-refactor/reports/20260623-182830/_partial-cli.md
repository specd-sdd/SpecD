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
