# Tasks: 12-cli-mcp-sdk-migration

## 1. SDK barrel extensions

- [x] 1.1 Re-export CLI-needed code-graph symbols from SDK barrel
      `packages/sdk/src/index.ts`: barrel — add `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, `createGetGraphHealth`, and related types
      Approach: named re-exports from `@specd/code-graph`; no new logic
      (Req: SDK delegation boundary — interim host surface)

- [x] 1.2 Add SDK barrel test for new re-exports
      `packages/sdk/test/barrel.spec.ts`: extend — assert lock/health symbols exported
      Approach: import each new symbol from `@specd/sdk` in test file
      (Req: SDK Composition public barrel)

## 2. Package dependencies

- [x] 2.1 Swap CLI runtime dependencies to SDK only
      `packages/cli/package.json`: dependencies — add `@specd/sdk`; remove `@specd/core`, `@specd/code-graph`
      Approach: workspace protocol `"@specd/sdk": "workspace:*"`
      (Req: SDK host bootstrap)

- [x] 2.2 Swap MCP runtime dependency to SDK
      `packages/mcp/package.json`: dependencies — replace `@specd/core` with `@specd/sdk`
      Approach: workspace protocol; no source changes
      (Req: package dependency boundary)

- [x] 2.3 Refresh lockfile after dependency change
      repo root: `pnpm install`
      Approach: run from monorepo root; verify no peer resolution errors
      (Req: SDK host bootstrap)

## 3. CLI import sweep

- [x] 3.1 Replace `@specd/core` imports in CLI src with `@specd/sdk`
      `packages/cli/src/**`: all files — update import paths
      Approach: types and factories available from SDK re-exports (`Kernel`, `SpecdConfig`, `createConfigLoader`, etc.)
      (Req: SDK host bootstrap)

- [x] 3.2 Replace `@specd/code-graph` imports in CLI src with `@specd/sdk`
      `packages/cli/src/**`: graph commands and helpers — update import paths
      Approach: use SDK barrel re-exports added in 1.1; no direct code-graph imports remain
      (Req: SDK delegation boundary)

- [x] 3.3 Update CLI test imports to `@specd/sdk`
      `packages/cli/test/**`: test files — same import sweep as src
      Approach: mirror src import changes; keep mock shapes stable
      (Req: SDK host bootstrap)

## 4. Host context

- [x] 4.1 Extract CLI kernel options builder
      `packages/cli/src/helpers/cli-context.ts`: new `buildCliKernelOptions` — move verbosity + log destination logic from `resolveCliContext`
      Approach: pure function from existing argv parsing; returns `KernelOptions`
      (Req: SDK host bootstrap)

- [x] 4.2 Rewire resolveCliContext to openSpecdHost
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext` — call `openSpecdHost({ configPath, kernelOptions })`; return unchanged `CliContext`
      Approach: map `{ config, configFilePath, kernel }` from host result
      (Req: SDK host bootstrap)

- [x] 4.3 Remove or dead-code createCliKernel if unused
      `packages/cli/src/kernel.ts`: `createCliKernel` — delete or delegate to `createKernel` with same options
      Approach: grep for callers; remove if only resolveCliContext used it
      (Req: SDK host bootstrap)

- [x] 4.4 Add resolveCliContext regression test
      `packages/cli/test/helpers/cli-context.spec.ts`: new/updated tests — kernel logging options forwarded to `openSpecdHost`
      Approach: mock `@specd/sdk` `openSpecdHost`; assert `kernelOptions.additionalDestinations`
      (Req: SDK host bootstrap)

## 5. Project status

- [x] 5.1 Replace loadGraphData with buildProjectStatusSnapshot
      `packages/cli/src/commands/project/status.ts`: `registerProjectStatus` action — call SDK snapshot with `{ includeGraph: true, includeHotspots: opts.graph }`
      Approach: single `buildProjectStatusSnapshot(host, options)` after `openSpecdHost`; map `snapshot.summary`, `snapshot.graphHealth`, `snapshot.hotspots`
      (Req: includes graph freshness (always), supports --graph flag)

- [x] 5.2 Delete loadGraphData helper
      `packages/cli/src/commands/project/status.ts`: `loadGraphData` — remove function and code-graph imports
      Approach: all graph fields come from snapshot result
      (Req: SDK host bootstrap)

- [x] 5.3 Preserve presenter output shapes
      `packages/cli/src/commands/project/status.ts`: text/json/toon formatters — keep field names identical
      Approach: map snapshot fields to existing output object; no schema changes
      (Req: supports json and toon formats, defaults to text output)

- [x] 5.4 Update project-status tests for SDK delegation
      `packages/cli/test/commands/project-status.spec.ts`: mocks — stub `buildProjectStatusSnapshot` / `openSpecdHost`
      Approach: verify freshness without --graph; extended stats with --graph
      (Req: includes graph freshness (always), supports --graph flag)

## 6. Graph stats

- [x] 6.1 Rewire stats command to SDK host + withOpenGraphProvider
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats` — `openSpecdHost` + `withOpenGraphProvider` + `createGetGraphHealth().execute`
      Approach: replace `resolveGraphCliContext`/`withProvider`; keep bootstrap path via adapted graph context helper
      (Req: Statistics retrieval)

- [x] 6.2 Keep concurrent indexing guard
      `packages/cli/src/commands/graph/stats.ts`: action — call `assertGraphIndexUnlocked` before provider open
      Approach: import from `@specd/sdk`; exit code 3 on lock
      (Req: Concurrent indexing guard)

- [x] 6.3 Update graph-stats tests
      `packages/cli/test/commands/graph-stats.spec.ts`: mocks — SDK lifecycle path
      Approach: assert no direct code-graph factory imports in handler
      (Req: Statistics retrieval)

## 7. Graph index

- [x] 7.1 Delegate worker indexing to runIndexProjectGraph
      `packages/cli/src/commands/graph/index-graph.ts`: worker branch — call `runIndexProjectGraph(host, { force, excludePaths, onProgress })`
      Approach: obtain host via `openSpecdHost`; remove direct `createIndexProjectGraph` / `withProvider`
      (Req: Indexing behaviour)

- [x] 7.2 Preserve parent lock and worker spawn
      `packages/cli/src/commands/graph/index-graph.ts`: parent branch — keep `acquireGraphIndexLock`, spawn, signal forwarding unchanged
      Approach: lock before spawn only; worker env vars unchanged
      (Req: Indexing behaviour)

- [x] 7.3 Update graph-index tests
      `packages/cli/test/commands/graph-index.spec.ts`: worker scenario — assert `runIndexProjectGraph` called
      Approach: mock SDK orchestration; lock/spawn tests unchanged
      (Req: Indexing behaviour)

## 8. Remaining graph commands

- [x] 8.1 Rewire withProvider to SDK lifecycle
      `packages/cli/src/commands/graph/with-provider.ts`: `withProvider` — delegate to `withOpenGraphProvider` via SdkHostContext adapter
      Approach: build SdkHostContext from config; preserve signal handlers and exit behaviour
      (Req: SDK delegation boundary — search/hotspots/impact)

- [x] 8.2 Update resolveGraphCliContext imports
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: imports — use `@specd/sdk` for core/code-graph symbols
      Approach: bootstrap path unchanged; configured path uses `resolveCliContext`
      (Req: Statistics retrieval bootstrap path)

- [x] 8.3 Regression test graph search
      `packages/cli/test/commands/graph-search.spec.ts`: run existing tests — no behaviour change
      Approach: full test file pass after import sweep
      (Req: SDK delegation boundary)

## 9. Documentation

- [x] 9.1 Document CLI/MCP SDK migration in sdk.md
      `docs/core/sdk.md`: add section — CLI/MCP depend on SDK only; reparto table; interim re-exports
      Approach: list command → SDK function mapping from design
      (Req: documentation update)

## 11. Graph CLI context (new specs)

- [x] 11.1 Implement resolveGraphCliContext SDK imports
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: all symbols
      Approach: configured mode via `resolveCliContext`; bootstrap unchanged; imports from `@specd/sdk` only
      (Req: resolveGraphCliContext uses SDK imports)

- [x] 11.2 Rewire withProvider to withOpenGraphProvider
      `packages/cli/src/commands/graph/with-provider.ts`: `withProvider`
      Approach: build `SdkHostContext` from config/kernel; delegate open/close; retain signal handlers and process.exit
      (Req: withProvider delegates to withOpenGraphProvider)

- [x] 11.3 Add graph-cli-context unit tests
      `packages/cli/test/commands/graph-cli-context.spec.ts`: new file
      Approach: verify SDK lifecycle delegation and bootstrap path unchanged
      (Req: withProvider delegates to withOpenGraphProvider)

## 12. Graph search / hotspots / impact

- [x] 12.1 Migrate graph search imports
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch`
      Approach: use `resolveGraphCliContext` + `withProvider`; remove direct `@specd/code-graph` imports
      (Req: Search behaviour)

- [x] 12.2 Migrate graph hotspots imports
      `packages/cli/src/commands/graph/hotspots.ts`: `registerGraphHotspots`
      Approach: same graph-cli-context pattern
      (Req: Hotspot retrieval)

- [x] 12.3 Migrate graph impact imports
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpact`
      Approach: same graph-cli-context pattern
      (Req: File impact analysis)

- [x] 12.4 Update graph command regression tests
      `packages/cli/test/commands/graph-search.spec.ts`, `graph-hotspots.spec.ts`, `graph-impact.spec.ts`
      Approach: run full suite; update mocks for SDK context
      (Req: Graph command import boundary)

## 13. Core composition alignment

- [x] 13.1 Verify CLI/MCP package.json after migration
      `packages/cli/package.json`, `packages/mcp/package.json`
      Approach: no direct `@specd/core` or `@specd/code-graph` runtime deps
      (Req: @specd/sdk orchestrates cross-package host bootstrap)

## 10. Verification

- [x] 10.1 Run CLI test suite
      `packages/cli`: `pnpm test`
      Approach: all tests green; fix mocks broken by import sweep
      (Req: all verify scenarios)

- [x] 10.2 Run CLI lint
      `packages/cli`: `pnpm lint`
      Approach: no direct `@specd/core` or `@specd/code-graph` imports in src
      (Req: SDK delegation boundary)

- [x] 10.3 Manual E2E smoke test
      CLI dist: `project status`, `project status --graph`, `graph stats`, `graph index`
      Approach: compare output fields and exit codes to pre-migration baseline
      (Req: no output regression)

## 14. Post-migration verification hardening

- [x] 14.1 Banner and version constants
      `packages/cli/src/version.ts`, `banner.ts`, `packages/sdk/src/shared/code-graph-version.ts`, `packages/code-graph/src/application/use-cases/_shared/installed-code-graph-version.ts`
      Approach: `--help` shows cli/sdk/core/graph from installed packages; indexer defaults omitted `codeGraphVersion` to installed semver per `code-graph:indexer` / `staleness-detection`
      (Req: cli:entrypoint banner version labels; sdk:composition `codeGraphVersion`)

- [x] 14.2 Graph index `--force` store lifecycle
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`, `ladybug-graph-store.ts`
      Approach: `recreate()` on open store reopens before `index()`; integration test for `IndexProjectGraph` + CLI bootstrap path
      (Req: code-graph:index-project-graph force recreate; cli:graph-index)

- [x] 14.3 Spec-driven regression tests
      `packages/cli/test/version.spec.ts`, `entrypoint.spec.ts`, `graph-index-integration.spec.ts`, `packages/code-graph/test/application/use-cases/staleness-detection.verify.spec.ts`, `workspace-indexing.spec.ts`, `packages/sdk/test/composition/package-boundary.spec.ts`, `packages/mcp/test/package.spec.ts`
      Approach: tests named after verify scenarios; strict fingerprint map equality via `expected-fingerprint-map` helper
      (Req: specs compliance / verify scenarios)
