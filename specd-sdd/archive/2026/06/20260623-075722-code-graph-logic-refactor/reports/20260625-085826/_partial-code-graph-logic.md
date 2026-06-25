# Spec Compliance Partial Report: Code Graph Logic

This report contains compliance audit findings for the `code-graph` specs targeted by the active change `code-graph-logic-refactor`.

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
