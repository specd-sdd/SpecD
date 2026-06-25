# Spec Compliance Audit: CLI Graph Commands

**Change:** `code-graph-logic-refactor`  
**Scope:** `cli:graph-index`, `cli:graph-stats`, `cli:graph-impact`  
**Date:** 2026-06-23

---

## 1. Requirements Summary

### Spec: `cli:graph-index`

- **Command signature:** `specd graph index [--force] [--exclude-path <pattern>] [--config <path> | --path <path>] [--format text|json|toon]`
- **Context Resolution & Validation:** Mutual exclusivity of `--config` and `--path`, precedence resolution, and bootstrap mode support.
- **Indexing Behavior:** Workspaces list lookup, lock acquisition, `--force` recreation, effective config build, progress reporting, signal-driven lock release, and provider cleanup.
- **Output Format:** Summary block for `text` mode (discovered, documents, skipped, removed, specs, errors), per-workspace breakdown, and JSON/TOON raw output.
- **Error Handling:** Code 3 for infrastructure/provider open failures, code 0 for per-file errors.
- **Documentation:** Fully documented in `docs/cli/cli-reference.md` under `## graph`.

### Spec: `cli:graph-stats`

- **Command signature:** `specd graph stats [--config <path> | --path <path>] [--format text|json|toon]`
- **Retrieval Logic:** Context resolution, ListWorkspaces, fingerprint comparison, VCS ref check, and provider cleanup.
- **Concurrent Indexing Guard:** Fail-fast lock check before opening provider (exits 3).
- **Output Format:** Count summaries (Files, Documents, Symbols, Specs, Languages, Relations) and staleness warnings. Additional fields in JSON/TOON (`stale`, `currentRef`, `fingerprintMismatch`).
- **Error Handling:** Code 3 for lock present or infrastructure failure.

### Spec: `cli:graph-impact`

- **Command signature:** `specd graph impact [--file <paths...>] [--symbol <name>] [--spec <id>] [--direction dependents|dependencies|upstream|downstream|both] [--depth <n>] [--config <path> | --path <path>] [--format text|json|toon]`
- **Selector Validation:** Exactly one target selector required. Mutual exclusivity of config/path options.
- **File Impact Analysis:** Path resolution (canonical/relative/absolute), single/multi-file impact computation, and aggregation.
- **Symbol Impact Analysis:** `findSymbols` search, matching logic, and multi-symbol resolution.
- **Spec Impact Analysis:** Spec-aware traversal (`COVERS_FILE`, `COVERS_SYMBOL`, `DEPENDS_ON`).
- **Concurrent Indexing Guard:** Fail-fast lock check before opening provider.
- **Output Format:** Paths project-relative, text formatting matches spec examples, JSON matches schemas with aggregate fields (`riskLevel`, `directDepsCount`, etc.).
- **Error Handling:** Proper exit codes for input/selector issues, spec not found, and lock failure.

---

## 2. Implementation Status

### Spec: `cli:graph-index`

- **Signature:** Implemented in `packages/cli/src/commands/graph/index-graph.ts` (lines 24-46).
- **Exclusivity & Context:** Checks `--config` and `--path` exclusivity (lines 57-59) and delegates context resolution to `resolveGraphCliContext`.
- **Locking:** Uses `acquireGraphIndexLock` (lines 84-92) and releases it in `finally` and signal handlers (lines 117, 185).
- **Provider Logic:** Invokes provider open, index, and close using `withProvider` (lines 130-182).
- **Output Formatting:** Text formatter implemented in `formatTextIndexResult` (lines 198-227); JSON/TOON outputs result directly (lines 173-175).

### Spec: `cli:graph-stats`

- **Signature:** Implemented in `packages/cli/src/commands/graph/stats.ts` (lines 20-45).
- **Lock Guard:** Calls `assertGraphIndexUnlocked` before opening the provider (line 62).
- **Statistics Logic:** Queries `provider.getStatistics()` and computes VCS ref staleness/fingerprint mismatch (lines 73-102).
- **Output Formatting:** Formats output in text mode (lines 104-137) or JSON/TOON (line 139).

### Spec: `cli:graph-impact`

- **Signature & Validation:** Implemented in `packages/cli/src/commands/graph/impact.ts`. Validates single selector and exclusivity (lines 209-215).
- **Direction Aliases:** Normalizes `dependents` -> `upstream` and `dependencies` -> `downstream` using `parseImpactDirection` (lines 119-136).
- **File Impact:** normalizes selectors (lines 266-280) and executes impact (lines 292, 343).
- **Symbol/Spec Impact:** Implemented in `handleSymbolImpact` and `handleSpecImpact` (lines 437-613).
- **Lock Guard:** Checks lock via `assertGraphIndexUnlocked` (line 228).
- **VCS Root Relative Paths:** Formats paths via `toDisplayPath` which returns `configRelativePath` (lines 282, 444, 586).

---

## 3. Discrepancies & Gaps

### Spec: `cli:graph-index`

1.  **Bootstrap Mode Crash (CRITICAL Bug):**
    In bootstrap mode, `kernel` is `null` (since no project config file exists). However, `index-graph.ts` (line 125) checks `if (kernel === null) { cliError('Kernel not available in worker', ..., 1); }` and aborts. Because worker spawning is enabled by default, **bootstrap mode indexing (`specd graph index --path ...`) is completely broken and crashes with exit code 1**.
2.  **Progress Reporting Destination (Minor Gap):**
    Progress is printed via `process.stdout.write` instead of `process.stderr.write`. Also, it does not check if the output stream is a TTY before printing `\rIndexing...`, which can corrupt redirected output files.
3.  **Infrastructure Error Exit Code (Minor Gap):**
    If the database/provider throws a standard `SpecdError` during indexing, `handleError` maps it to exit code 1. The spec requires infrastructure/database errors to exit with code 3.
4.  **Signature Drift (Minor Drift):**
    The CLI implementation accepts undocumented flags: `--concurrency <n>` and `--include-path <glob...>`. These are absent from the spec command signature.

### Spec: `cli:graph-stats`

1.  **Infrastructure Error Exit Code (Minor Gap):**
    Similar to `graph index`, unhandled provider open or statistics retrieval failures are handled by `handleError` and can exit with code 1 instead of 3 if wrapped in a `SpecdError`.
2.  **Documentation (Minor Gap):**
    The `graph stats` section in `docs/cli/cli-reference.md` is missing a usage example.

### Spec: `cli:graph-impact`

1.  **Single File JSON Fields (Medium Gap):**
    The spec requires the JSON/TOON output to include aggregate impact fields (`riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`). These are present for multi-file, symbol, and spec selectors, but **missing for single-file selectors** (which output raw `FileImpactResult` containing `directDependents` instead of `directDepsCount`).
2.  **Spec Impact Path Normalization (Medium Gap):**
    In `handleSpecImpact`, `affectedSymbols` file paths are not normalized relative to the project root via `toDisplayPath` (unlike file and symbol impact). This violates the path consistency constraint and leaks canonical paths (`workspace:src/...`).
3.  **Missing Spec/Symbol Exit Code (Minor Gap):**
    If `--spec` or `--symbol` does not match any indexed nodes, the text mode outputs a warning and exits with **code 0** instead of failing with a non-zero exit code as the spec suggests ("SHALL fail with a not-found error").
4.  **Symbol Search Method (Minor Drift):**
    The implementation resolves symbols using `resolveSymbolSelector` instead of `findSymbols({ name })` to allow qualified selector parsing. This is a reasonable design choice but drifts from the exact spec wording.
5.  **Documentation (Minor Gap):**
    The `graph search` and `graph hotspots` subcommands are missing usage examples in `cli-reference.md`.

---

## 4. Test Coverage Analysis

All 751 tests pass successfully across the project (`pnpm --filter @specd/cli test`).

### Spec: `cli:graph-index`

- **File:** [graph-index.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts) (8 tests)
- **Coverage:** Excellent coverage of workspace loading, bootstrap mode defaults, CLI argument mapping (`--exclude-path`), `--force` recreation, and lock acquisition.
- **Gaps:**
  - No tests verify the worker process spawning behavior itself or error handling when the worker exits non-zero.
  - No tests mock infrastructure/database errors to verify exit code 3.
  - No tests check progress reporting output.

### Spec: `cli:graph-stats`

- **File:** [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts) (15 tests)
- **Coverage:** Excellent coverage of context resolution, VCS staleness checks, fingerprint comparison, and JSON formatting.
- **Gaps:**
  - `assertGraphIndexUnlocked` is verified to have been called, but no test mocks it to throw and verifies the command exits with code 3.
  - No tests mock database failure to verify exit code 3.

### Spec: `cli:graph-impact`

- **File:** [graph-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts) (26 tests)
- **Coverage:** Comprehensive coverage of direction mapping, depth arguments, selector validation, spec/symbol lookup, and multi-file aggregation.
- **Gaps:**
  - Similar to `stats`, lock failure exits are not tested for exit code 3 behavior (only that the assertion is called).
  - No test mocks provider open errors to assert exit code 3.

---

## 5. Conformance & Dependencies

- **`cli:entrypoint` Conformance:** Mostly compliant. The discrepancy is that infrastructure error exit codes mapped in `handleError` do not consistently yield code 3 (often exit 1 for database-related `SpecdError` subtypes).
- **`core:config` Conformance:** Context resolution correctly follows config discovery precedence and fallback bootstrap logic in `resolveGraphCliContext`.
- **`code-graph:composition` Conformance:** Provider lifecycle, index options, statistics, and impact queries delegate fully to `@specd/code-graph` API boundary.

---

## 6. Summary Counts

- **Total Spec Requirements Checked:** 18
- **Compliant Requirements:** 11
- **Requirements with Gaps/Issues:** 7
- **Discrepancies Found:**
  - _Bug:_ `graph index` bootstrap worker crash due to null `kernel`.
  - _Drifts/Gaps:_ Missing aggregate JSON fields in single-file impact; un-normalized paths in spec impact; stdout instead of stderr progress; undocumented/missing flags; text-mode no-fail returns.
  - _Documentation:_ Missing usage examples for `search`, `stats`, and `hotspots`.
- **Test Coverage Status:** Strong baseline of happy-path and validation checks, but missing exit code verification for lock/db failures.
