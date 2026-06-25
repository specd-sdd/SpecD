# Spec Compliance Audit Report: `code-graph-logic-refactor`

## Executive Summary

This report presents the spec-compliance audit for the active change `code-graph-logic-refactor` in the **specd** workspace. The audit compares implementation (code and tests) against six target specifications: three graph CLI subcommands (`cli:graph-index`, `cli:graph-stats`, `cli:graph-impact`) and three core code graph services (`code-graph:traversal`, `code-graph:staleness-detection`, `code-graph:composition`).

### Overall Audit Metrics

- **Total Requirements Checked**: 65
- **Fully Implemented**: 62
- **Partially Implemented**: 3
- **Gaps / Discrepancies Found**: 7
- **Total Unit Test Cases**: 97
- **Test Status**: All 97 tests are passing, and lint/typechecks pass successfully.

---

## Detailed Findings

### Part 1: CLI Graph Commands

This section evaluates compliance for the active change `code-graph-logic-refactor` across three graph CLI command specifications.

---

## Spec: cli:graph-index

### Requirements Summary

The `graph index` command indexes the project workspace(s) into the code graph. It accepts options to force rebuilding, exclude specific paths, target a specific configuration/path, and select output format (text, json, toon). It delegates all indexing, locking, and configuration to `@specd/code-graph` and prints indexing progress callbacks in text mode.

### Implementation Status

Fully implemented. The command registers correctly in [index-graph.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/index-graph.ts), enforces mutual exclusion of configuration flags, and prints progress updates and formatted text outputs matching the spec specifications.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Worker Process Spawning**: The implementation spouts a separate worker process to perform the actual indexing, using environment variables (`SPECD_GRAPH_INDEX_WORKER`, `SPECD_GRAPH_INDEX_LOCK_HELD`, etc.). This process isolation is absent from the spec's description and constraints.
- **Additional Command Options**: The implementation registers options `--concurrency` and `--include-path`, which are undocumented in the spec's signature.
- **Lock Failure Exit Code**: The lock acquisition error case is not explicitly listed in the spec error cases (although lock behavior is described under the stats and impact specs).

### Test Coverage

- Verified in [graph-index.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-index.spec.ts).
- 9 test cases cover basic invocation, workspace list retrieval, bootstrap mode, exclude-path handling, `--force` recreation, text rendering, and lock checks.

### Missing/Insufficient Tests

- **Spawning Lifecycle**: Spawning a worker process is completely mocked out (bypassed with `SPECD_GRAPH_INDEX_NO_WORKER = 'true'`), leaving worker startup, signal forwarding, and exit code propagation untested.
- **Context Flag Exclusivity**: The `--config` and `--path` exclusivity checks are not unit-tested.
- **Error Exits**: Per-file indexing errors and infrastructure failure exits (exit code 3) are not unit-tested.
- **Progress Output**: The text-mode `onProgress` output logic is not validated.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:graph-store](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/graph-store/spec.md)
- [core:list-workspaces](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/list-workspaces/spec.md)

### Summary Counts

- **Requirements checked**: 14
- **Implemented**: 13
- **Partially implemented**: 1
- **Gaps found**: 3
- **Test cases found**: 9

---

## Spec: cli:graph-stats

### Requirements Summary

The `graph stats` command retrieves and outputs summary statistics from the code graph (files, documents, symbols, specs, languages, relations, last indexed timestamp). In text mode, it shows a staleness warning if the current ref differs from the indexed ref. In JSON/TOON mode, it appends `stale`, `currentRef`, and `fingerprintMismatch` indicators. It checks the indexing lock before opening the provider.

### Implementation Status

Fully implemented. Code in [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts) checks locks via `assertGraphIndexUnlocked`, resolves VCS info, compares fingerprints, and outputs formatted statistics.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Fingerprint Warning in Text Mode**: In text mode, the CLI prints `'⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index'` if mismatch is detected. The spec only describes `fingerprintMismatch` as a field inside JSON/TOON output and makes no mention of this text warning.

### Test Coverage

- Verified in [graph-stats.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-stats.spec.ts).
- 16 test cases cover config paths, lock checks, exclusivity, staleness calculations (stale, fresh, null refs, missing VCS), text warnings, and JSON output structures.

### Missing/Insufficient Tests

- **Document Counts in Text**: The exact formatting of the documents count line in text mode (e.g. `Documents: 18`) is not directly asserted in a dedicated test scenario.
- **Infrastructure Errors**: Database opening errors or retrieval infrastructure failures exiting with code 3 are not unit-tested.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:staleness-detection](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/staleness-detection/spec.md)
- [core:list-workspaces](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/list-workspaces/spec.md)

### Summary Counts

- **Requirements checked**: 11
- **Implemented**: 11
- **Partially implemented**: 0
- **Gaps found**: 1
- **Test cases found**: 16

---

## Spec: cli:graph-impact

### Requirements Summary

The `graph impact` command analyzes the blast radius of a spec, a symbol, or set of files, traversing upstream (dependents) or downstream (dependencies) up to a specified depth. It resolves selectors (workspace-prefixed, relative, or absolute paths) and formats output files relative to the project root. It includes detailed symbol breakdowns and depth markers in text mode, and aggregate counts in JSON/TOON mode.

### Implementation Status

Fully implemented. Code in [impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/impact.ts) resolves selector inputs, normalized directions, checks lock status, performs the traversal, and prints formatted text or structured outputs.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Symbol Lookup Method**: The spec details that symbol lookup is performed using `findSymbols({ name })`. The code instead calls `resolveSymbolSelector(symbolSelector)` to support advanced selectors (bare, qualified, full-id), followed by `getSymbol(id)`.
- **Selector Error Formatting**: The spec requires that not-found errors show the normalized config-relative path searched. The implementation prints the raw un-normalized user selector string instead.
- **Spec Not Found Exit Code**: Under "Error cases", the spec states the command "SHALL fail with a not-found error" if a spec does not exist. However, both the verification scenarios ("Missing spec reports cleanly: exits with code 0") and the implementation return cleanly and exit with code 0 instead of exiting with code 1.

### Test Coverage

- Verified in [graph-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/graph-impact.spec.ts).
- 27 test cases cover lock checks, direction mappings, depth options, context resolutions, selector exclusivity, spec impact results, symbol match/not-found results, multi-file aggregations, and JSON formatting.

### Missing/Insufficient Tests

- **Text Output Formatting details**: Spec impact and multi-file text formatting structures (such as `Changed symbols` or `Per-file breakdown` formatting) are not verified.
- **Path Normalization**: Normalizing absolute and project-relative paths (e.g. `packages/core/src/auth.ts` vs `/repo/packages/core/src/auth.ts`) is not unit-tested (mocked at the resolver level).
- **Infrastructure Errors**: Exit code 3 for database or provider connection failures is not unit-tested.

### Spec Dependency Chain

- [cli:entrypoint](file:///Users/monki/Documents/Proyectos/specd/packages/cli/specs/entrypoint/spec.md)
- [core:config](file:///Users/monki/Documents/Proyectos/specd/packages/core/specs/config/spec.md)
- [code-graph:composition](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/composition/spec.md)
- [code-graph:traversal](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/traversal/spec.md)
- [code-graph:workspace-integration](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/specs/workspace-integration/spec.md)

### Summary Counts

- **Requirements checked**: 18
- **Implemented**: 16
- **Partially implemented**: 2
- **Gaps found**: 3
- **Test cases found**: 27

---

### Part 2: Code Graph Logic

This section contains compliance audit findings for the `code-graph` specs targeted by the active change `code-graph-logic-refactor`.

---

## Spec: code-graph:traversal

### Requirements Summary

Defines the traversal and impact analysis logic for the codebase graph. This includes upstream/downstream traversal, symbol-level and file-level impact analysis (blast radius), spec impact, static type dependency impact (`USES_TYPE` and `CONSTRUCTS` relations), file-level aggregation, and change detection.

### Implementation Status

**Fully Implemented.**
The implementation resides in the stateless domain services of the `@specd/code-graph` package:

- [get-upstream.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/get-upstream.ts) — Collects upstream symbol-level and file-level dependents up to `maxDepth` (defaults to 3).
- [get-downstream.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/get-downstream.ts) — Collects downstream symbol-level and file-level dependencies up to `maxDepth`.
- [analyze-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-impact.ts) — Orchestrates overall impact analysis, calculating risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and collecting affected files/symbols.
- [analyze-file-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-file-impact.ts) — Aggregates impact across all symbols in a given file. Uses a memoized store wrapper to optimize database access.
- [analyze-files-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-files-impact.ts) — Aggregates impact across multiple target files.
- [analyze-spec-impact.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/analyze-spec-impact.ts) — Requirement-aware spec impact traversing `DependsOn`, `CoversFile`, and `CoversSymbol` relations.
- [detect-changes.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/detect-changes.ts) — Detects impact scope from a set of changed files, producing a human-readable summary.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **Store-level abstraction mapping:** The traversal services (`getUpstream` / `getDownstream`) do not query `USES_TYPE` and `CONSTRUCTS` relation types directly. Instead, both store implementations (`SQLiteGraphStore` and `LadybugGraphStore`) transparently include them in the arrays returned by `getCallers` and `getCallees` under a unified `SYMBOL_DEPENDENCY_RELATION_TYPES` group. This satisfies the spec requirements implicitly but is an implementation detail not specified in the traversal domain service signature.
- **Hierarchy dependents:** Base methods and types correctly query overriding/inheriting classes or methods via `getExtenders`, `getImplementors`, and `getOverriders` inside `getIncomingRelations` and propagate them properly in `analyzeImpact` and depth/risk counts.

### Test Coverage

Highly covered by Vitest unit tests:

- [traversal.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/traversal.spec.ts) (24 passing tests):
  - Traversal depth, cycling, and maxDepth limits.
  - Upstream/downstream relations including `USES_TYPE` and `CONSTRUCTS` edges.
  - Extenders, implementors, and overriders traversal.
  - Multi-depth symbol and file importer traversal.
  - Spec impact and changed files impact.
  - Traversal immutability (lack of mutation on store statistics).
- [analyze-files-impact.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/analyze-files-impact.spec.ts) (1 passing test):
  - Aggregating risk level, direct/indirect dependents, and files across multiple inputs.

### Missing/Insufficient Tests

- **No explicit test for risk thresholds:** The transition from `LOW` to `MEDIUM` to `HIGH` to `CRITICAL` risk is covered in `risk-level.spec.ts`, but there are no direct test scenarios inside `traversal.spec.ts` confirming how `analyzeImpact` maps these boundaries dynamically.
- **Deduplication tests:** No direct test assertions exist for deduplicating file/symbol coverage in `analyzeSpecImpact` when the same file or symbol is covered multiple times.
- **File-level USES_TYPE aggregation:** `analyzeFileImpact` is not explicitly tested with a `USES_TYPE` or `CONSTRUCTS` setup to verify type aggregation, although it works via delegation.
- **Max risk across symbols:** Risk aggregation at file-level for symbols (Max risk across symbols) is not directly verified in `traversal.spec.ts`.

### Spec Dependency Chain

- [code-graph:symbol-model](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/symbol-model/spec.md)
- [code-graph:graph-store](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/graph-store/spec.md)

### Summary Counts

- **Requirements Checked:** 7
- **Implemented:** 7
- **Partially Implemented:** 0
- **Gaps Found:** 0
- **Test Cases Found:** 25

---

## Spec: code-graph:staleness-detection

### Requirements Summary

Defines how graph staleness is computed based on VCS ref differences, derivation fingerprint mismatches, fallback configurations, config building, and centralized index lock control.

### Implementation Status

**Fully Implemented.**
The implementation is spread across domain and infrastructure services:

- [is-graph-stale.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/domain/services/is-graph-stale.ts) — VCS-agnostic staleness comparator returning `true` (stale), `false` (fresh), or `null` (unknown).
- [index-lock.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/infrastructure/index-lock.ts) — CENTRALIZED mutex lock using an `index.lock` file containing the PID. Handles Sigint/Sigterm hooks.
- [build-project-graph-config.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/services/build-project-graph-config.ts) — Merges global project settings with workspace configurations and custom CLI options.
- [bootstrap-graph-config.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/services/bootstrap-graph-config.ts) — Assembles a synthetic fallback config resolving the vcs root as a single `default` workspace when `specd.yaml` is absent.
- CLI level: [stats.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/stats.ts) and [warn-graph-staleness.ts](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/warn-graph-staleness.ts) implement the warn-not-block policies, outputting staleness warnings to `stderr` but continuing execution.

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **No discrepancies found.** VCS ref staleness and derivation mismatch checks are correctly separated and handled independently. Fingerprint mismatch repair is implemented correctly in `index-code-graph.ts` (it triggers full rebuild by clearing files in mismatched workspaces, surfacing the rebuild reason to the CLI output).

### Test Coverage

- [is-graph-stale.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/domain/services/is-graph-stale.spec.ts) (5 passing tests)
- [index-lock.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/infrastructure/index-lock.spec.ts) (1 passing test)
- [build-project-graph-config.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/application/services/build-project-graph-config.spec.ts) (2 passing tests)
- [compute-graph-fingerprint.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts) (4 passing tests)

### Missing/Insufficient Tests

- **No tests for bootstrap fallback config:** There are no unit or integration tests checking the behavior of `createBootstrapGraphConfig` (in [bootstrap-graph-config.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/application/services/bootstrap-graph-config.ts)).
- **CLI Warn-Not-Block verification:** The warning policy behavior in the CLI is not covered by automated unit/integration tests within the workspace (no CLI tests for commanders exist in `packages/cli`).

### Spec Dependency Chain

- [code-graph:graph-store](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/graph-store/spec.md)
- [code-graph:indexer](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/indexer/spec.md)
- [cli:graph-stats](file:///Users/monki/Documents/Proyectos/specd/specs/cli/graph-stats/spec.md)

### Summary Counts

- **Requirements Checked:** 10
- **Implemented:** 10
- **Partially Implemented:** 0
- **Gaps Found:** 0
- **Test Cases Found:** 12

---

## Spec: code-graph:composition

### Requirements Summary

Specifies the orchestration and composition layer including the `CodeGraphProvider` facade, factory provider instantiation from `SpecdConfig` or standalone parameters, explicit lifecycle control, and clean encapsulation of internals.

### Implementation Status

**Fully Implemented.**

- [code-graph-provider.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/composition/code-graph-provider.ts) — Facade delegating all queries, traversals, locking, and hotspot operations.
- [create-code-graph-provider.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/composition/create-code-graph-provider.ts) — Factory method registering tree-sitter adapters (TS, Python, Go, PHP) and resolving the store backend (SQLite vs Ladybug).
- Encapsulation is fully respected; only public API surfaces are exported in [index.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/src/index.ts).

### Discrepancies (Spec vs Code / Code vs Spec / Drift / Bugs)

- **No design drift found.** Encapsulation boundaries and runtime dependencies are correctly implemented. `@specd/core` is declared as a workspace dependency in `@specd/code-graph`'s `package.json` to enable type-sharing of `SpecdConfig`.

### Test Coverage

- [code-graph-provider.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/code-graph/test/composition/code-graph-provider.spec.ts) (8 passing tests):
  - Backend instantiation (SQLite vs Ladybug).
  - Registry-driven custom backend selection.
  - Idle state errors (`StoreNotOpenError`) before open or after close.
  - Basic delegation of `index()` to the indexer.
  - Idempotent behavior of `close()`.

### Missing/Insufficient Tests

- **No SpecdConfig factory overload tests:** Tests in `code-graph-provider.spec.ts` only cover the standalone instantiation path (`CodeGraphOptions`). There are no tests supplying a full `SpecdConfig` to the factory and verifying resolution logic.
- **Facade delegation tests:** There are no delegation-verifying unit tests for `findSymbols()`, `resolveFileSelector()`, `analyzeFilesImpact()`, `assertGraphIndexUnlocked()`, or `clear()` inside `code-graph-provider.spec.ts`.

### Spec Dependency Chain

- [code-graph:symbol-model](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/symbol-model/spec.md)
- [code-graph:graph-store](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/graph-store/spec.md)
- [code-graph:ladybug-graph-store](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/ladybug-graph-store/spec.md)
- [code-graph:sqlite-graph-store](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/sqlite-graph-store/spec.md)
- [code-graph:language-adapter](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/language-adapter/spec.md)
- [code-graph:indexer](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/indexer/spec.md)
- [code-graph:traversal](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/traversal/spec.md)
- [default:\_global/architecture](file:///Users/monki/Documents/Proyectos/specd/specs/_global/architecture/spec.md)
- [code-graph:document-model](file:///Users/monki/Documents/Proyectos/specd/specs/code-graph/document-model/spec.md)

### Summary Counts

- **Requirements Checked:** 5
- **Implemented:** 5
- **Partially Implemented:** 0
- **Gaps Found:** 0
- **Test Cases Found:** 8
