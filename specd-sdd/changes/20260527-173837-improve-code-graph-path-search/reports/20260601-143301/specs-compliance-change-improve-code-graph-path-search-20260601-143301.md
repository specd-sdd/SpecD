# Spec Compliance Audit

- Mode: `--change improve-code-graph-path-search`
- Change: `improve-code-graph-path-search`
- Timestamp: `20260601-143301`
- Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260527-173837-improve-code-graph-path-search`
- Graph status: indexed at `2026-06-01T12:29:58.859Z`, `stale: false`

## Scope

Change specs audited:

- `cli:graph-search`
- `cli:graph-impact`
- `code-graph:composition`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
- `cli:graph-index`
- `code-graph:indexer`
- `code-graph:symbol-model`
- `code-graph:graph-store`
- `core:config`
- `code-graph:document-model`
- `core:spec-repository-port`
- `core:list-workspaces`
- `core:list-specs`
- `core:search-specs`
- `core:get-spec-context`
- `core:spec-metadata`
- `cli:project-status`
- `cli:spec-list`
- `cli:spec-search`
- `cli:graph-stats`
- `core:workspace`

Project-wide specs considered for compliance:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/error-handling-conventions`
- `default:_global/eslint`
- `default:_global/logging`
- `default:_global/spec-layout`
- `default:_global/testing`

## Findings Summary

- Spec/code discrepancies found: `0`
- Test coverage gaps found: `0` for the primary changed behaviors
- Residual risks: `1`

## Detailed Findings

### 1. No material spec/code discrepancy found for exact-match ranking

Evidence:

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` applies explicit score boosts ahead of BM25 ordering for exact identity matches in `searchSymbols`, `searchSpecs`, and `searchDocuments`.
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts` applies equivalent explicit boosts for exact symbol id/name matches and exact spec id matches, with ordered score output.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts` includes `ranks exact symbol, spec, and document matches first`, which asserts exact hits sort before fuzzy hits across all store implementations.
- Live verification: `node packages/cli/dist/index.js graph search "registerGraphSearch" --symbols --format text` returned `registerGraphSearch` as the top hit with a very large score boost (`100008.9`), consistent with the changed ranking contract.

Assessment:

- The implementation aligns with the `cli:graph-search`, `code-graph:sqlite-graph-store`, and `code-graph:ladybug-graph-store` requirements that exact identity matches outrank generic relevance results.

### 2. No material spec/code discrepancy found for file-path normalization across graph search and impact

Evidence:

- `packages/code-graph/src/application/services/resolve-graph-selector.ts` normalizes absolute and config-relative selectors, resolves canonical graph paths, and supports file/document lookup through config-relative paths.
- `packages/cli/src/commands/graph/impact.ts` routes `--file` selectors through `provider.resolveFileSelector(...)` and displays resolved `configRelativePath` values in output.
- `packages/cli/src/commands/graph/search.ts` converts canonical graph paths back to display paths through provider-backed file/document lookups before rendering text output.
- `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts` verifies project-relative selectors across both files and documents and verifies qualified symbol selectors resolve ahead of bare-name fallbacks.
- `packages/cli/test/commands/graph-impact.spec.ts` verifies provider-backed selector normalization for project-relative symbol selectors and multi-file aggregation behavior.
- Live verification:
  - `node packages/cli/dist/index.js graph impact --file packages/cli/src/commands/graph/search.ts --direction dependencies --format text`
  - `node packages/cli/dist/index.js graph impact --file /Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/graph/search.ts --format text`

Assessment:

- The implementation aligns with the `cli:graph-impact`, `code-graph:workspace-integration`, and `code-graph:composition` requirements that file selectors accept canonical, project-relative, and absolute forms while presenting stable project-relative display paths.

### 3. No material spec/code discrepancy found for lock-guarded graph commands and direction/kind validation

Evidence:

- `packages/cli/src/commands/graph/search.ts` and `packages/cli/src/commands/graph/impact.ts` both resolve graph CLI context, enforce `--config`/`--path` exclusivity, and call `assertGraphIndexUnlocked(config)` before opening providers.
- `packages/cli/src/commands/graph/impact.ts` normalizes `dependents` to `upstream` and `dependencies` to `downstream` before calling provider analysis.
- `packages/cli/src/commands/graph/search.ts` validates multi-kind input through `parseGraphKinds`.
- `packages/cli/test/commands/graph-search.spec.ts` and `packages/cli/test/commands/graph-impact.spec.ts` cover index-lock checks, invalid-option rejection, multi-kind pass-through, and direction normalization.

Assessment:

- The implementation remains compliant with CLI command-signature and fail-fast requirements in the changed specs.

### 4. Primary verification tests passed; one environment-level residual risk remains

Passing targeted evidence:

- `packages/cli/test/commands/graph-search.spec.ts`
- `packages/cli/test/commands/graph-impact.spec.ts`
- `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts`
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
- `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store-multi-kind.spec.ts`

Full verification hook evidence:

- `specd changes run-hooks improve-code-graph-path-search verifying --phase pre`
- Result: `ok: verifying-run-tests`, `ok: verifying-run-lint`, `ok: verifying-run-typecheck`

Residual risk:

- Isolated re-runs of `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts` in this session terminated with an unhandled Vitest worker IPC error (`ERR_IPC_CHANNEL_CLOSED`) before any assertion failure surfaced.
- This did not reproduce as a spec assertion failure, and the change-level verifying hook already reported the project test suite as passing, so this is treated as an environment/tooling instability rather than a confirmed compliance defect.

Assessment:

- No missing primary test coverage was found for the behavior directly introduced by this change.
- There is a residual verification risk around isolated Ladybug test process stability in this shell session.

## Global Spec Compliance Check

- `default:_global/architecture`: compliant from observed code paths. CLI wiring remains in adapter code; graph-store and selector logic remain in code-graph/core layers without introducing I/O into domain entities.
- `default:_global/conventions`: compliant in inspected files. ESM imports, named exports, and explicit validation/error paths are preserved.
- `default:_global/error-handling-conventions`: compliant in inspected CLI commands. User-facing validation and not-found paths return controlled CLI errors/messages instead of raw backend failures.
- `default:_global/testing`: compliant for the changed behavior. Unit/integration-style tests cover selector normalization, CLI option handling, and backend ranking behavior.
- `default:_global/docs`, `default:_global/eslint`, `default:_global/logging`, `default:_global/spec-layout`: no contradiction introduced by the inspected implementation changes.

## Conclusion

The compliance audit found no actionable spec drift or implementation mismatch for the behavior changed by `improve-code-graph-path-search`. The change is consistent with its updated graph search, graph impact, selector normalization, and ranking specs, and the primary verification evidence passed. The only remaining concern is a session-local Vitest worker IPC failure when isolating one Ladybug test file, which is a tooling stability risk rather than a demonstrated requirement violation.
