# Tasks: 10-code-graph-host-use-cases

## 1. GetGraphHealth use case

- [x] 1.1 Add input and result interfaces
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: new file — `GetGraphHealthInput`, `GetGraphHealthResult`
      Approach: `GetGraphHealthResult extends GraphStatistics` plus `stale`, `currentRef`, `fingerprintMismatch`; `assertUnlocked` optional default true
      (Req: Returns enriched graph health, Accepts open provider and project inputs)

- [x] 1.2 Implement `GetGraphHealth.execute()`
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealth` class
      Approach: assert lock when `assertUnlocked !== false`; `getStatistics()`; VCS ref via `createVcsAdapter`; `isGraphStale`; conditional `detectFingerprintMismatch` with `buildProjectGraphConfig`
      (Req: Asserts indexing lock, Computes VCS staleness, Computes derivation fingerprint mismatch)

- [x] 1.3 Add `createGetGraphHealth` factory
      `packages/code-graph/src/composition/use-cases/get-graph-health.ts`: new file
      Approach: `return new GetGraphHealth()` — no config capture
      (Req: Factory wires dependencies)

## 2. IndexProjectGraph use case

- [x] 2.1 Add `IndexProjectGraphInput` and class
      `packages/code-graph/src/application/use-cases/index-project-graph.ts`: new file
      Approach: interface mirrors design; `execute` calls `recreate()` when `force` then `provider.index()` with passed options
      (Req: Executes project indexing, Supports force recreate)

- [x] 2.2 Add `createIndexProjectGraph` factory
      `packages/code-graph/src/composition/use-cases/index-project-graph.ts`: new file
      Approach: stateless factory returning `IndexProjectGraph`
      (Req: Factory wires dependencies)

## 3. GetSpecCoverage use case

- [x] 3.1 Add coverage result types and class
      `packages/code-graph/src/application/use-cases/get-spec-coverage.ts`: new file
      Approach: `getSpec` guard; load relations; compute unique file/symbol counts; `found: false` empty path
      (Req: Returns spec coverage snapshot)

- [x] 3.2 Add `createGetSpecCoverage` factory
      `packages/code-graph/src/composition/use-cases/get-spec-coverage.ts`: new file
      (Req: Factory wires dependencies)

## 4. GetChangeSpecCoverage use case

- [x] 4.1 Add change coverage types and class
      `packages/code-graph/src/application/use-cases/get-change-spec-coverage.ts`: new file
      Approach: inject `GetSpecCoverage`; `changes.get` → `ChangeNotFoundError`; map `specIds` in order
      (Req: Returns change-level coverage, Resolves change by name, Delegates per-spec coverage)

- [x] 4.2 Add `createGetChangeSpecCoverage` factory
      `packages/code-graph/src/composition/use-cases/get-change-spec-coverage.ts`: new file
      Approach: `createGetChangeSpecCoverage(getSpecCoverage: GetSpecCoverage)`
      (Req: Factory wires dependencies)

## 5. Package exports

- [x] 5.1 Export use cases from application barrel
      `packages/code-graph/src/application/index.ts`: export four use case classes and result/input types
      (Req: Host use cases — composition)

- [x] 5.2 Export factories from package entry
      `packages/code-graph/src/index.ts`: named exports for all host use case symbols
      Approach: match composition spec export list exactly
      (Req: Package exports)

## 6. CLI integration

- [x] 6.1 Wire `graph stats` to `GetGraphHealth`
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats` action inside `withProvider`
      Approach: remove direct `isGraphStale`/`detectFingerprintMismatch`; call `createGetGraphHealth().execute({ config, provider, codeGraphVersion, workspaces })`; preserve text/json/toon formatting
      (Req: Statistics retrieval — cli:graph-stats)

- [x] 6.2 Wire index worker to `IndexProjectGraph`
      `packages/cli/src/commands/graph/index-graph.ts`: worker `withProvider` callback
      Approach: replace `provider.index(indexOptions)` with `createIndexProjectGraph().execute({ ... })`; keep parent lock/spawn unchanged
      (Req: Indexing behaviour — cli:graph-index)

- [x] 6.3 Refactor `loadGraphData` to use `GetGraphHealth` (optional)
      `packages/cli/src/commands/project/status.ts`: `loadGraphData`
      Approach: when provider open, delegate health fields to `GetGraphHealth`; remove duplicated staleness logic
      (Req: Returns enriched graph health)

## 7. Tests

- [x] 7.1 Unit tests for `GetGraphHealth`
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`: new file
      Approach: mock provider + VCS adapter; cover all verify scenarios
      (Req: code-graph:get-graph-health verify)

- [x] 7.2 Unit tests for `IndexProjectGraph`
      `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`: new file
      Approach: spy `recreate` and `index`; assert force path and callback forwarding
      (Req: code-graph:index-project-graph verify)

- [x] 7.3 Unit tests for `GetSpecCoverage`
      `packages/code-graph/test/application/use-cases/get-spec-coverage.spec.ts`: new file
      (Req: code-graph:get-spec-coverage verify)

- [x] 7.4 Unit tests for `GetChangeSpecCoverage`
      `packages/code-graph/test/application/use-cases/get-change-spec-coverage.spec.ts`: new file
      Approach: mock `ChangeRepository` and injected `GetSpecCoverage`
      (Req: code-graph:get-change-spec-coverage verify)

- [x] 7.5 Update `graph-stats` CLI tests
      `packages/cli/test/commands/graph-stats.spec.ts`: stub or spy `createGetGraphHealth`
      Approach: assert output shape unchanged; health orchestration not inline in command
      (Req: cli:graph-stats verify)

- [x] 7.6 Update graph index CLI tests
      `packages/cli/test/commands/` (graph index spec file): assert worker uses `IndexProjectGraph`
      (Req: cli:graph-index verify)

## 8. Documentation

- [x] 8.1 Document host use cases
      `docs/` code-graph section (existing package doc or new short page)
      Approach: list four use cases, inputs, consumers (CLI stats/index, future SDK/Studio)
      (Req: documentation per design)
