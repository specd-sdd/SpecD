# Tasks: code-graph-logic-refactor

## 1. Relocate Configuration and Locking Utilities

- [x] 1.1 Move and update createBootstrapGraphConfig
      `packages/code-graph/src/application/services/bootstrap-graph-config.ts`: `createBootstrapGraphConfig` — Move the config file from CLI command folder and update imports.
      Approach: Create fallback SpecdConfig using repository project/vcs roots, export in code-graph.
      (Req: code-graph:composition)
- [x] 1.2 Move and update buildProjectGraphConfig
      `packages/code-graph/src/application/services/build-project-graph-config.ts`: `buildProjectGraphConfig` — Move the config build file from CLI command folder.
      Approach: Merge SpecdConfig's AllowedPaths/ExcludePaths with RuntimeOverrides.
      (Req: code-graph:composition)
- [x] 1.3 Move and update index lock management
      `packages/code-graph/src/infrastructure/index-lock.ts`: `acquireGraphIndexLock`, `assertGraphIndexUnlocked` — Move locking utilities from CLI commands.
      Approach: Check and write `.specd/config/graph/index.lock` with process PID and delete it on release.
      (Req: code-graph:composition)
- [x] 1.4 Update resolve-graph-cli-context imports
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: `resolveGraphCliContext` — Change import of `createBootstrapGraphConfig` to point to `@specd/code-graph`.
      Approach: Import from `@specd/code-graph` instead of local relative cli file path.
      (Req: cli:graph-index)
- [x] 1.5 Update project status command imports
      `packages/cli/src/commands/project/status.ts`: `loadGraphData` — Change import of `buildProjectGraphConfig` to point to `@specd/code-graph`.
      Approach: Import from `@specd/code-graph` instead of local relative cli file path.
      (Req: cli:graph-stats)

## 2. Implement New Core Domain Services

- [x] 2.1 Implement multi-file impact aggregation
      `packages/code-graph/src/domain/services/analyze-files-impact.ts`: `analyzeFilesImpact` — Implement core service to aggregate impact results for multiple files.
      Approach: Call `analyzeFileImpact` for each file, accumulate unique affected files and symbols, and calculate the maximum risk level (LOW < MEDIUM < HIGH < CRITICAL).
      (Req: code-graph:traversal)
- [x] 2.2 Implement graph staleness detection
      `packages/code-graph/src/domain/services/is-graph-stale.ts`: `isGraphStale` — Extract staleness calculation logic from CLI stats command.
      Approach: Compare `lastIndexedRef` and `currentRef` to detect staleness, returning boolean or null.
      (Req: code-graph:staleness-detection)

## 3. Extend CodeGraphProvider and Package Exports

- [x] 3.1 Extend CodeGraphProvider interface and class
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider` — Expose the new impact, locking, and staleness methods on the main facade.
      Approach: Add `analyzeFilesImpact(filePaths, direction, maxDepth)`, `assertGraphIndexUnlocked()`, and `acquireGraphIndexLock(config)` delegating to the new services.
      (Req: code-graph:composition)
- [x] 3.2 Expose helpers in code-graph index exports
      `packages/code-graph/src/index.ts`: `exports` — Add named exports for locking, configuration merging, and bootstrap configuration.
      Approach: Export the moved and newly added application/infrastructure/domain helper functions.
      (Req: code-graph:composition)

## 4. Simplify CLI Command Implementations

- [x] 4.1 Simplify graph impact command
      `packages/cli/src/commands/graph/impact.ts`: `handleFilesImpact` — Strip out inline impact aggregation and lock checks.
      Approach: Delegate lock assertions and multi-file impact analysis to `CodeGraphProvider`.
      (Req: cli:graph-impact)
- [x] 4.2 Simplify graph index command
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex` — Strip out inline lock checks and configuration loading.
      Approach: Delegate lock acquisition and config merging to the provider/helper, pass `onProgress` callback to `provider.index()`.
      (Req: cli:graph-index)
- [x] 4.3 Simplify graph stats command
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats` — Strip out inline staleness calculations and lock check.
      Approach: Use `isGraphStale` and provider locking checks.
      (Req: cli:graph-stats)
- [x] 4.4 Clean up other CLI commands using index lock
      `packages/cli/src/commands/graph/hotspots.ts`, `packages/cli/src/commands/graph/search.ts`: `registerGraphHotspots`, `registerGraphSearch` — Replace relative imports of lock functions with `@specd/code-graph` imports.
      Approach: Import from `@specd/code-graph` instead of local relative cli file paths.
      (Req: cli:graph-stats)
- [x] 4.5 Remove deprecated CLI graph helpers
      `packages/cli/src/commands/graph/`: `files removal` — Delete deprecated helper files.
      Approach: Delete `bootstrap-graph-config.ts`, `build-project-graph-config.ts`, and `graph-index-lock.ts` from the filesystem.
      (Req: cli:graph-index)

## 5. Update CLI Command Tests

- [x] 5.1 Update CLI graph stats tests
      `packages/cli/test/commands/graph-stats.spec.ts`: `describe` block — Update mocks of locking and configuration helper imports.
      Approach: Mock/stub `@specd/code-graph` exported lock functions and provider methods.
      (Req: cli:graph-stats)
- [x] 5.2 Update CLI graph index tests
      `packages/cli/test/commands/graph-index.spec.ts`: `describe` block — Update mocks and assert progress callbacks.
      Approach: Assert that progress feedback outputs to stdout.
      (Req: cli:graph-index)
- [x] 5.3 Update other CLI graph tests
      `packages/cli/test/commands/`: `graph-hotspots.spec.ts`, `graph-impact.spec.ts`, `graph-search.spec.ts`, `project-status.spec.ts` — Update locking mock imports.
      Approach: Point lock assertions and mocks to the `@specd/code-graph` package.
      (Req: cli:graph-impact)

## 6. Add Code-Graph Package Unit Tests

- [x] 6.1 Add analyzeFilesImpact service tests
      `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts`: `describe` block — Write tests verifying multi-file impact calculations.
      Approach: Assert aggregation correctness (combined lists, max risk levels resolution).
      (Req: code-graph:traversal)
- [x] 6.2 Add index lock infrastructure tests
      `packages/code-graph/test/infrastructure/index-lock.spec.ts`: `describe` block — Write tests verifying locking files.
      Approach: Verify lock creation, error throwing when locked, and release deletion.
      (Req: code-graph:composition)
- [x] 6.3 Migrate buildProjectGraphConfig tests
      `packages/code-graph/test/application/services/build-project-graph-config.spec.ts`: `describe` block — Move and run `build-project-graph-config.spec.ts` from CLI tests.
      Approach: Verify config merging is correct and export works.
      (Req: code-graph:composition)

## 7. Documentation

- [x] 7.1 Create code-graph use-cases documentation
      `docs/code-graph/use-cases.md`: `IndexCodeGraph`, `DiscoverFiles` — Document the use cases exported by the `@specd/code-graph` package.
      Approach: Describe parameters, return types, thrown errors, and examples of usage, matching the format in `@specd/core` use cases.
      (Req: code-graph:composition)
- [x] 7.2 Create code-graph services documentation
      `docs/code-graph/services.md`: `services` — Document core domain services and lock/configuration helpers of `@specd/code-graph`.
      Approach: Describe parameters and returns for `analyzeFilesImpact`, `isGraphStale`, configuration builders, and lock managers.
      (Req: code-graph:composition)

## 8. Manual and E2E Verification

- [x] 8.1 Verify graph stats CLI command
      `manual`: `E2E` — Run stats command and check display.
      Approach: Run `node packages/cli/dist/index.js graph stats --format text` and verify staleness warnings.
      (Req: cli:graph-stats)
- [x] 8.2 Verify graph index CLI command with progress
      `manual`: `E2E` — Run index command and verify progress prints.
      Approach: Run `node packages/cli/dist/index.js graph index` and verify real-time percentage feedback.
      (Req: cli:graph-index)
- [x] 8.3 Verify graph impact CLI command
      `manual`: `E2E` — Run impact command for multiple files.
      Approach: Run `node packages/cli/dist/index.js graph impact --file packages/core/src/index.ts packages/cli/src/index.ts` and check risk level aggregation.
      (Req: cli:graph-impact)
- [x] 8.4 Verify index locking contention
      `manual`: `E2E` — Assert lock warnings block stats.
      Approach: Run `graph stats` while `graph index` is running in another process and verify exit code 3.
      (Req: cli:graph-stats)

## 9. Compliance Audit Refinements & Bug Fixes

- [x] 9.1 Rename CodeGraphProvider query methods
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider` — Rename `getCoveringSpecs` to `getCoveringSpecsForFile` and `getSymbolCoveringSpecs` to `getCoveringSpecsForSymbol` to align with the spec naming. Update CLI command calls and test mocks.
      (Req: code-graph:composition)
- [x] 9.2 Export WorkspaceIndexTarget and DiscoveredSpec
      `packages/code-graph/src/index.ts`: `exports` — Define and/or export `WorkspaceIndexTarget` and `DiscoveredSpec` types from `@specd/code-graph`.
      (Req: code-graph:composition)
- [x] 9.3 Catch lock exceptions in CLI commands
      `packages/cli/src/commands/graph/`: `stats.ts`, `impact.ts` — Catch lock contention errors (from `assertGraphIndexUnlocked`) inside command-level try-catch blocks to print a graceful retry message and exit with code 3.
      (Req: cli:graph-stats, cli:graph-impact)
- [x] 9.4 Implement includeFiles option in Traversals
      `packages/code-graph/src/domain/services/`: `get-upstream.ts`, `get-downstream.ts` — Implement `includeFiles` option in traversals to support file-to-file import relationships.
      (Req: code-graph:traversal)
- [x] 9.5 Restore skipped index tests and add missing coverage
      `packages/cli/test/commands/graph-index.spec.ts`, `packages/code-graph/test/domain/services/`: `tests` — Un-skip the 4 skipped index tests, and add unit test coverage for `isGraphStale`.
      (Req: cli:graph-index, code-graph:staleness-detection)

## 10. Spec Compliance Audit Remediations

- [x] 10.1 Fix index worker bootstrap mode crash
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex` — Fix worker crash under bootstrap mode by avoiding null `kernel` reference checks when listing synthetic workspaces (list workspace targets directly from `config.workspaces` if `kernel` is null).
      (Req: cli:graph-index)
- [x] 10.2 Add staleness and fingerprint mismatch warning checks to read commands
      `packages/cli/src/commands/graph/`: `search.ts`, `impact.ts`, `hotspots.ts` — Check staleness and fingerprint mismatch dynamically for graph-reading CLI commands, emitting warning messages to `process.stderr` in text/toon format when stale/mismatched.
      (Req: cli:graph-stats, cli:graph-impact)
- [x] 10.3 Expose aggregate impact fields in single-file JSON/TOON output
      `packages/cli/src/commands/graph/impact.ts`: `handleFilesImpact` — Include `riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, and `affectedFilesCount` in the single-file output format payload in JSON/TOON modes.
      (Req: cli:graph-impact)
- [x] 10.4 Normalize spec impact symbol paths
      `packages/cli/src/commands/graph/impact.ts`: `handleSpecImpact` — Normalize `affectedSymbols` paths in spec impact using `toDisplayPath`.
      (Req: cli:graph-impact)
- [x] 10.5 Add lock failure and database failure exit code 3 test coverage
      `packages/cli/test/commands/`: `graph-index.spec.ts`, `graph-stats.spec.ts`, `graph-impact.spec.ts` — Mock and verify exit code 3 when lock assertion throws or provider fails to open/query.
      (Req: cli:graph-index, cli:graph-stats, cli:graph-impact)
- [x] 10.6 Add fingerprint calculation and traversal store immutability unit tests
      `packages/code-graph/test/`: `domain/services/traversal.spec.ts`, `application/use-cases/compute-graph-fingerprint.spec.ts` — Write unit tests targeting `detectFingerprintMismatch` and verify traversal operations (`getUpstream`, `getDownstream`, `analyzeImpact`) do not mutate the store state.
      (Req: code-graph:traversal, code-graph:staleness-detection)
- [x] 10.7 Add provider close() idempotency unit test
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: `describe` block — Add unit test verifying that `provider.close()` is idempotent (safe to close twice).
      (Req: code-graph:composition)
- [x] 10.8 Update CLI reference documentation usage examples
      `docs/cli/cli-reference.md`: `## graph` — Add usage examples for `graph search`, `graph stats`, and `graph hotspots` commands.
      (Req: cli:graph-index)

## 11. Post-audit remediation

- [x] 11.1 Remove unused graph index CLI flags
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex` — Remove `--concurrency` and `--include-path` Commander options and any worker arg propagation for them.
      Approach: Delete dead options; keep worker subprocess model intact.
      (Req: cli:graph-index)
- [x] 11.2 Normalize file-not-found error path in graph impact
      `packages/cli/src/commands/graph/impact.ts`: `handleFilesImpact` — Normalize the user selector to config-relative form before printing the not-found error.
      Approach: Reuse provider normalization helpers so stderr shows the searched config-relative path.
      (Req: cli:graph-impact)
- [x] 11.3 Add SpecNotFoundError and wire graph impact failure
      `packages/code-graph/src/domain/errors/spec-not-found-error.ts`, `packages/code-graph/src/index.ts`, `packages/cli/src/commands/graph/impact.ts` — Define `SpecNotFoundError` (code `SPEC_NOT_FOUND`), export it, throw from missing `--spec` handling, and let `handleError` exit with code 1.
      Approach: Mirror `StoreNotOpenError` pattern; update `graph-impact.spec.ts` and verify scenarios.
      (Req: code-graph:composition, cli:graph-impact)
- [x] 11.4 Add analyzeImpact risk threshold unit tests
      `packages/code-graph/test/domain/services/traversal.spec.ts` — Assert LOW/MEDIUM/HIGH/CRITICAL boundaries in `analyzeImpact`.
      (Req: code-graph:traversal)
- [x] 11.5 Add createBootstrapGraphConfig unit tests
      `packages/code-graph/test/application/services/bootstrap-graph-config.spec.ts` — Cover synthetic `default` workspace creation.
      (Req: code-graph:staleness-detection)
- [x] 11.6 Add createCodeGraphProvider(SpecdConfig) factory test
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — Instantiate provider from full `SpecdConfig` and verify open/query/close lifecycle.
      (Req: code-graph:composition)
- [x] 11.7 Update graph impact missing-spec tests
      `packages/cli/test/commands/graph-impact.spec.ts` — Expect exit code 1 and `SPEC_NOT_FOUND` for unknown `--spec` selectors.
      (Req: cli:graph-impact)
