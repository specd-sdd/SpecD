# Tasks: stabilize-isolated-index-worker

## 1. Native Dependency Upgrade

- [x] 1.1 Upgrade `@ast-grep/napi` in `@specd/code-graph`
      `packages/code-graph/package.json`: `dependencies` — upgrade `@ast-grep/napi` from `0.41.1` to `^0.42.1`
      Approach: Update package.json dependency range and run pnpm to resolve compatible 0.42.3 version with updated platform binaries in `pnpm-lock.yaml`
      (Req: Requirement: LanguageAdapter interface)
- [x] 1.2 Lockfile platform resolution
      `pnpm-lock.yaml`: dependencies — update platform-specific native binary locks for `@ast-grep/napi`
      Approach: Ensure all platform-specific bindings for ast-grep 0.42.3 are recorded in pnpm-lock.yaml
      (Req: Requirement: LanguageAdapter interface)

## 2. Regression Testing

- [x] 2.1 Add native parser teardown fixture module
      `packages/code-graph/test/fixtures/isolated-index-worker/built-napi-teardown-task.mjs`: `runGraphIndexTask` — simulate heavy AST parse workload
      Approach: Create an ESM task that parses and traverses 1,200 TypeScript source files using `@ast-grep/napi`, retains and releases `SgRoot` instances, and returns a valid result
      (Req: Requirement: Published ESM worker entrypoint, scenario: Subprocess native parser teardown exits cleanly after terminal result)
- [x] 2.2 Add publish-shaped subprocess teardown test
      `packages/code-graph/test/infrastructure/isolated-index-worker/dist.spec.ts`: `dist worker tests` — assert natural zero-exit after heavy parse run
      Approach: Execute `built-napi-teardown-task.mjs` through `runIsolatedGraphIndex`, configure `settlesWithin` with 10s budget, and assert the child completes and exits with code 0 without signal failure
      (Req: Requirement: Process isolation, scenario: Native child crash does not terminate supervisor)

## 3. Verification & Validation

- [x] 3.1 Verify forced full graph index
      `cli: graph index --force` — verify end-to-end full rebuild in isolated worker
      Approach: Execute `node packages/cli/dist/index.js graph index --force --format toon`, ensuring 1,391 files and 276 specs are indexed and the child process exits cleanly with code 0
      (Req: Requirement: Published ESM worker entrypoint, scenario: Forced built index exits cleanly after terminal result)
- [x] 3.2 Verify incremental graph index
      `cli: graph index` — verify incremental run succeeds without errors
      Approach: Execute `node packages/cli/dist/index.js graph index --format toon` immediately following full rebuild to ensure proper cache retention and zero-exit
      (Req: Requirement: High-level isolated execution API)
- [x] 3.3 Full package test suite and typecheck
      `packages/code-graph` & `packages/cli` — verify test suites pass
      Approach: Run `pnpm --filter @specd/code-graph test` (59 files, 713 tests), `pnpm --filter @specd/cli test` (82 files, 883 tests), and `pnpm typecheck`
      (Req: Requirement: Process isolation)
