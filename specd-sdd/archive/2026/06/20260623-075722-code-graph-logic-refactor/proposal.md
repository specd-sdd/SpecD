# Proposal: code-graph-logic-refactor

## Motivation

The `@specd/cli` package (an adapter package) currently implements code-graph business logic such as multi-file impact aggregation, indexing concurrency locks, bootstrap config construction, and staleness detection. This violates the hexagonal architecture constraint (adapter packages should contain no business logic) and prevents reuse in other delivery mechanisms (like MCP servers, IDE integrations, or APIs) without duplicating code.

## Current behaviour

Currently, several key graph-related operations are executed inside the CLI layer:

- **Multi-file Impact Aggregation:** `packages/cli/src/commands/graph/impact.ts` manually executes individual file impact analyses and computes the aggregated risk level, transitive dependents count, and set of affected files.
- **Index Locking/Mutex:** `packages/cli/src/commands/graph/graph-index-lock.ts` controls index file lock creation and deletion under the hood.
- **Bootstrap Mode Config Fallback:** `packages/cli/src/commands/graph/bootstrap-graph-config.ts` builds a mock `SpecdConfig` when `specd.yaml` is absent.
- **Project Configuration Merging:** `packages/cli/src/commands/graph/build-project-graph-config.ts` merges user CLI inputs with project configurations.
- **Staleness Comparison:** `packages/cli/src/commands/graph/stats.ts` computes index staleness by comparing the VCS ref of the last index run against the current VCS HEAD.

## Proposed solution

Move all graph-related business logic from `@specd/cli` into `@specd/code-graph` (and `@specd/core` where appropriate). Define clean, reusable interfaces in `CodeGraphProvider` so the CLI only needs to parse options, invoke the provider, and output formatted text or JSON results.

- Create a multi-file impact aggregation service inside `@specd/code-graph`.
- Move the index lock mechanism and bootstrap configuration generator to `@specd/code-graph` or `@specd/core`.
- Relocate config-merging and staleness verification to `@specd/code-graph` or `@specd/core`.

## Specs affected

### New specs

_None._

### Modified specs

- `cli:graph-index`: Update index command requirements to state it delegates lock check, project config merging, and bootstrap configuration to `@specd/code-graph`. It will pass an `onProgress` callback to `@specd/code-graph` to receive progress updates, which it will print to stdout when running in text mode.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-stats`: Update stats command requirements to delegate VCS staleness calculation and fingerprint mismatch check directly to `@specd/code-graph`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: Update impact command requirements to delegate single and multi-file impact aggregation calculation to `@specd/code-graph`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: Update traversal/impact requirements to cover multi-file impact aggregation and combined risk scoring.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:staleness-detection`: Add requirements covering central index lock management, configuration bootstrap fallbacks, and project graph config assembly.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: Update the `CodeGraphProvider` facade and factory to expose index lock checks, configuration merging, bootstrap configuration fallbacks, and multi-file impact aggregation.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/code-graph` API surface (e.g. `CodeGraphProvider` and its use cases/services) will expand to include multi-file impact, lock management, configuration creation, and staleness/fingerprint calculations.
- `@specd/cli` commands (`graph/index`, `graph/stats`, `graph/impact`) will be significantly simplified, with their business logic stripped out and replaced by direct provider calls.
- Other delivery mechanisms (such as `@specd/mcp`) will gain access to indexing safety and advanced impact metrics natively.

## Technical context

- **Architectural boundaries:** Following Hexagonal Architecture, the CLI must only adapt inputs/outputs.
- **Configuration sharing:** The project configuration (`SpecdConfig`) is loaded exactly once by the CLI layer (using core kernel context loader) and passed down to `@specd/code-graph` at construction time. No duplicate configuration loading or parsing is performed in `@specd/code-graph`.
- **Progress Reporting:** The CLI will pass an `onProgress` callback to the provider's `index()` method. This keeps the CLI responsible for writing to `process.stdout` while keeping the indexer itself free from CLI-specific formatting or global `process.stdout` writes.
- **Multi-file impact:** The aggregation algorithm must handle merging sets of affected files/symbols, accumulating direct, indirect, and transitive counts, and resolving the overall risk level by identifying the maximum risk among files (`LOW` < `MEDIUM` < `HIGH` < `CRITICAL`).
- **Locks:** The lock implementation can remain filesystem-based (e.g., using `index.lock` under the graph workspace directory) but must be managed inside the `@specd/code-graph` infrastructure/ports.

## Open questions

_None._

## Post-audit remediation (2026-06-25)

Compliance audit `20260625-085826` identified seven follow-up items. This change absorbs them without altering the original refactor goal:

1. **Worker subprocess (`graph index`):** Keep the child-process isolation model; document it in `cli:graph-index`.
2. **Unused CLI flags:** Remove `--concurrency` and `--include-path` from `graph index` (dead options).
3. **Fingerprint mismatch warning (`graph stats`):** Keep stderr warning in text mode; document in `cli:graph-stats`.
4. **Symbol selectors (`graph impact`):** Keep `resolveSymbolSelector`; document advanced selector support in `cli:graph-impact`.
5. **File not-found errors:** Normalize the config-relative path in CLI error messages (implementation-only).
6. **Missing spec handling:** Introduce `SpecNotFoundError` in `@specd/code-graph`; `graph impact --spec` fails with exit code 1 via `handleError`.
7. **Test coverage:** Add unit tests for risk thresholds, bootstrap config, and `createCodeGraphProvider(SpecdConfig)`.

Additional spec/verify delta updates cover items 1, 3, 4, and 6. Items 2, 5, and 7 are captured in `design.md` and `tasks.md` section 11.
