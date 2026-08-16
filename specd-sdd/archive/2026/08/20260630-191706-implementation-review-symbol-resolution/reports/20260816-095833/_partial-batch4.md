# Batch 4 Compliance Audit Report

## Requirements & Verification Summary

| Spec ID                            | Total Requirements | Satisfied | Discrepancies | Missing Tests |
| ---------------------------------- | -----------------: | --------: | ------------: | ------------: |
| `cli:change-implementation`        |                  9 |         9 |             0 |             0 |
| `cli:change-status`                |                 13 |        13 |             0 |             0 |
| `sdk:build-implementation-review`  |                  5 |         5 |             0 |             0 |
| `sdk:composition`                  |                  7 |         7 |             0 |             0 |
| `sdk:run-index-project-graph`      |                  5 |         5 |             0 |             0 |
| `core:vcs-adapter-port`            |                 12 |        12 |             0 |             0 |
| `core:vcs-implementation-detector` |                  5 |         5 |             0 |             0 |
| **Total**                          |             **56** |    **56** |         **0** |         **0** |

## Detailed Findings per Spec

### 1. `cli:change-implementation` — IMPLEMENTED (9/9)

- **Requirements Compliance**:
  - `Command signature`: Exposed under `specd changes implementation` command group (`list`, `review`, `add`, `remove`, `ignore`, `resolve`, `unresolve`).
  - `List subcommand`: `specd changes implementation list <name>` returns current implementation-tracking state, tracked files grouped by review state (`open`, `resolved`, `ignored`, `removed`), confirmed links grouped by `specId` and file, symbol-level refinements, and SDK projection from `sdk:build-implementation-review` including status (`resolved`, `ambiguous`, `unresolved`, `missing`), reason code, target, candidates, graph health, and binding/hierarchy provenance.
  - `Add subcommand`: Validates physical disk existence via Core (`ImplementationFileNotFoundError` if missing), normalizes paths, updates tracked files state to `open`, and preserves explicit file link distinction.
  - `Resolve subcommand`: Validates existence and tracked state, updates tracked files to `resolved`, rejects `removed` files unless resurrected.
  - `Unresolve subcommand`: Validates existence, updates `resolved`/`ignored` tracked files back to `open`, rejects `removed` files.
  - `Ignore subcommand`: Allows ignoring already tracked missing files; validates disk existence for untracked files. Preserves confirmed links.
  - `Remove subcommand`: Removes specific symbols or full `spec + file` link set.
  - `Review subcommand`: Uses the exact same SDK projection as `list` and change status, rendering structured outcomes without selecting ambiguous candidates.
  - `Shared path semantics`: Uses raw project-relative file paths without requiring `workspace:path` normalization at authoring time.
- **Code Locations**: `packages/cli/src/commands/change/implementation.ts`, `packages/cli/src/commands/change/_implementation-tracking.ts`
- **Test Coverage**: Fully covered in `packages/cli/test/commands/change-implementation.spec.ts`, `packages/cli/test/commands/change-implementation-tracking.spec.ts`, `packages/cli/test/commands/change-implementation-review-integration.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 2. `cli:change-status` — IMPLEMENTED (13/13)

- **Requirements Compliance**:
  - `Command signature`: `specd change status <name> [--format text|json|toon]` supported.
  - `Drafted change status is read-only`: Renders status in read-only mode for `draftView`.
  - `Output format`: `hasTasks` emitted for all entries; top-level DAG state uses drift-aware projection (`complete-with-drift`).
  - `Task completion display in DAG`: Displays `[hasTasks - N/M done]` when completion data available.
  - `Display-state rendering`: Prioritizes display state in human output.
  - `Schema version warning`: Warns to stderr on schema version mismatch, exits 0.
  - `Change not found`: Exits code 1 on missing change.
  - `Schema-derived fields`: Emits nested schema object with topological DAG, derived `requires` and `children`.
  - `Delegates refresh policy to GetStatus`: Invokes `GetStatus` directly without independently executing detectors or refresh.
  - `Implementation section`: When `--implementation` flag is provided, renders structured review projection from `sdk:build-implementation-review`. Does not execute independent graph queries or ad hoc same-file/rightmost-segment fallbacks.
  - `Task completion in details section`: Appends `tasks: N/M` in text details.
  - `Basic info section`: Basic info block with change name and state.
  - `Specs and dependencies section`: Bulleted list of specs and declared dependencies.
- **Code Locations**: `packages/cli/src/commands/change/status.ts`, `packages/cli/src/commands/change/_implementation-tracking.ts`
- **Test Coverage**: Fully covered in `packages/cli/test/commands/change-status.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 3. `sdk:build-implementation-review` — IMPLEMENTED (5/5)

- **Requirements Compliance**:
  - `Delivery-neutral orchestration`: `buildImplementationReview(ctx, input)` obtains raw review from `ctx.kernel.changes.getImplementationReview`, opens provider via `withOpenGraphProvider`, reads health, and batch resolves symbol references.
  - `Stable review projection`: Retains stored spec, file, symbol values unchanged while attaching structured resolution projection (status, reason code, health, target, candidates, provenance). File-level links remain unforced and valid.
  - `One health snapshot and batch resolution`: Evaluates health once and batch-resolves all symbol references under a single provider lifecycle.
  - `Graph availability behavior`: Non-current/incomplete graph state is reported via per-link `unresolved` outcomes. Infrastructure failures propagate standard errors without being misclassified as missing links.
  - `Shared host behavior`: Serves as the single shared projection for all delivery hosts (CLI list, review, change status).
- **Code Locations**: `packages/sdk/src/orchestration/build-implementation-review.ts`
- **Test Coverage**: Fully covered in `packages/sdk/test/orchestration/build-implementation-review.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 4. `sdk:composition` — IMPLEMENTED (7/7)

- **Requirements Compliance**:
  - `Package identity and dependencies`: `@specd/sdk` lives at `packages/sdk/` with workspace name `sdk`. Runtime dependencies restricted to `@specd/core` and `@specd/code-graph`.
  - `Layer structure`: Enforces `composition/`, `orchestration/`, `presentation/`, `shared/`, `index.ts`. No domain entities or infrastructure adapters.
  - `Public barrel exports`: Curated exports for host bootstrap, orchestration, presentation, core re-exports, and code-graph re-exports.
  - `Public barrel exports for host adapters`: Exports host-adapter symbols (`createGetGraphHealth`, `IndexResult`, `HotspotResult`, `ImpactResult`, `FileImpactResult`, `codeGraphVersion`, etc.).
  - `Import policy for integrators`: Delivery hosts import `@specd/sdk` instead of parallel dependencies.
  - `Version constant`: Exports `SDK_VERSION` matching `package.json`.
  - `Implementation review public orchestration`: Exports `buildImplementationReview` and associated input/result and Code Graph reference/resolution types from `src/index.ts`.
- **Code Locations**: `packages/sdk/src/index.ts`, `packages/sdk/src/core-reexports.ts`, `packages/sdk/src/composition/`, `packages/sdk/src/orchestration/`
- **Test Coverage**: Fully covered in `packages/sdk/test/barrel.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 5. `sdk:run-index-project-graph` — IMPLEMENTED (5/5)

- **Requirements Compliance**:
  - `runIndexProjectGraph orchestration`: Validates input combinations (throws `InvalidProviderLifecycleError` if provider and hooks are both passed), lists workspaces, resolves VCS ref, executes indexing on supplied or transient provider.
  - `Lock acquisition out of scope`: Subprocess locking is kept separate from `runIndexProjectGraph`.
  - `Progress callback passthrough`: Forwards `onProgress` events unchanged.
  - `Result passthrough`: Preserves all `IndexResult` fields.
  - `Repair lifecycle passthrough`: Preserves provider-owned schema repair diagnostics (`fullRebuild`, `fullRebuildReason`) and handles transient open for indexing.
- **Code Locations**: `packages/sdk/src/orchestration/run-index-project-graph.ts`
- **Test Coverage**: Fully covered in `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 6. `core:vcs-adapter-port` — IMPLEMENTED (12/12)

- **Requirements Compliance**:
  - `rootDir returns the repository root`: Returns absolute path to repository root. Throws when outside repository.
  - `branch returns the current branch name`: Returns branch name or `"HEAD"` in detached state.
  - `isClean reports working-tree cleanliness`: Resolves boolean.
  - `ref returns the current short revision`: Returns stable short revision identifier without dirty suffix or transient status.
  - `refAt resolves the revision active at a timestamp`: Resolves revision identifier active at timestamp or `null`.
  - `show retrieves file content at a revision`: Resolves string file content or `null`.
  - `modifiedFiles lists changed repository files`: Returns normalized, forward-slash, repository-root-relative file paths for modified/staged/unstaged/untracked/deleted/moved files. Rejects on backend execution failures.
  - `Abstract class base`: Abstract class `VcsAdapter` with protected `cwd`.
  - `Public port export`: Exported from `@specd/core` public API.
  - `Null fallback implementation`: `NullVcsAdapter` satisfies non-VCS fallback contract.
  - `identity resolves version control identity`: Resolves `VcsIdentity` (`name`, `email`, `provider`).
  - `static detect detects active VCS`: Static `detect(cwd)` method defined.
- **Code Locations**: `packages/core/src/application/ports/vcs-adapter.ts`, `packages/core/src/infrastructure/null/vcs-adapter.ts`, `packages/core/src/infrastructure/git/vcs-adapter.ts`
- **Test Coverage**: Fully covered in `packages/core/test/infrastructure/git/vcs-adapter.spec.ts`, `packages/core/test/infrastructure/null/vcs-adapter.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.

### 7. `core:vcs-implementation-detector` — IMPLEMENTED (5/5)

- **Requirements Compliance**:
  - `Implements the detector port`: Implements `ImplementationDetector`.
  - `Uses the VCS adapter port`: Obtains modified files through `VcsAdapter`.
  - `Resolves the historical implementation baseline`: Resolves historical revision from `implementing` timestamp using `refAt`, with fallback to `ref`.
  - `Modified-file candidate mapping`: Rebases repository-root-relative paths to project root, normalizes to forward slashes, deduplicates, sorts, filters outside paths, preserves renames/deletions, applies generic caller `excludePaths`. Does NOT load graph config or graph visibility rules.
  - `No workspace normalization`: Remains workspace-agnostic without graph dependency.
- **Code Locations**: `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`
- **Test Coverage**: Fully covered in `packages/core/test/infrastructure/vcs/vcs-implementation-detector.spec.ts`.
- **Discrepancies & Drift**: None.
- **Missing Tests**: None.
