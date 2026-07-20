# Spec compliance audit — graph composition scope

**Change:** `sdk-graph-provider-factory`  
**Scope:** `code-graph:composition`, `code-graph:index-project-graph`, `code-graph:get-graph-health`, `core:vcs-adapter-port`  
**Method:** merged change previews, direct dependency/global review, code-graph symbol/impact navigation, source and test inspection, and read-only package test execution. Graph was fresh (`stale: false`).

## Result

Implementation conforms to the functional requirements reviewed. Two medium-severity contract/spec issues and several verification-coverage gaps remain. No source or spec files were modified.

| Measure                                  |         Count |
| ---------------------------------------- | ------------: |
| Requirements reviewed                    |            28 |
| Verify scenarios reviewed                |            52 |
| Scenarios supported by implementation    |            52 |
| Scenarios with direct automated evidence |            37 |
| Test-coverage gaps                       |            15 |
| Implementation defects                   |             1 |
| Spec inconsistency                       |             1 |
| Critical / high / medium / low findings  | 0 / 0 / 2 / 0 |

## Evidence

- Factory/provider: `packages/code-graph/src/composition/create-code-graph-provider.ts`, `packages/code-graph/src/composition/code-graph-provider.ts`, `packages/code-graph/src/public.ts`, and `packages/code-graph/package.json`.
- Host use cases: `packages/code-graph/src/application/use-cases/index-project-graph.ts`, `packages/code-graph/src/application/use-cases/get-graph-health.ts`, and their composition factories.
- VCS: `packages/core/src/application/ports/vcs-adapter.ts`, `packages/core/src/infrastructure/{git,null}/vcs-adapter.ts`, `packages/core/src/composition/vcs-adapter.ts`, and `packages/core/src/public.ts`.
- Graph navigation: `CodeGraphProvider` impact identifies only its factory as direct composition dependent; `VcsAdapter` impact identifies 112 affected files / critical blast radius, so the port was checked together with its public export, factory, and concrete fallbacks.
- Tests inspected: `code-graph-provider.spec.ts`, `index-project-graph.spec.ts`, `get-graph-health.spec.ts`, `host-use-case-factories.spec.ts`, `barrel.spec.ts`, and core VCS adapter tests. `pnpm --filter @specd/core test -- --run ...` exited 0 (157 files / 2,153 tests). The analogous code-graph package test command exited 0. Package scripts executed their package suites rather than only the requested files.

## Findings

### M1 — `CodeGraphProvider` remains directly constructible from the public barrel

`code-graph:composition` says `createCodeGraphProvider` is the only construction path and that callers must not construct `CodeGraphProvider` directly. However, `public.ts` exports the class and `code-graph-provider.ts` exposes a public constructor accepting `GraphStore` and `IndexCodeGraph`. Any public TypeScript consumer can instantiate it.

- **Implementation-bug interpretation:** make construction inaccessible outside composition (for example through a non-public constructor/factory arrangement) while retaining the desired public type surface.
- **Spec-drift interpretation:** exporting a facade class necessarily makes its public constructor reachable in TypeScript; revise the requirement to permit direct construction, or export only a provider interface/type.
- **Evidence:** `packages/code-graph/src/public.ts`; `packages/code-graph/src/composition/code-graph-provider.ts` constructor; no negative compile-time test asserts construction is impossible.

### M2 — VCS `static detect` requirement conflicts with its own default behavior

The port requirement requires `VcsAdapter.detect(cwd)` to return `null` by default and concrete subclasses to override it. The merged verify scenario instead says calling `VcsAdapter.detect(cwd)` inside a Git repository returns `GitVcsAdapter`. The implementation correctly follows the stated default: the base static method returns `null`; `GitVcsAdapter.detect` performs Git detection; `createVcsAdapter` dispatches through registered providers.

- **Implementation-bug interpretation:** add base-class dispatch to concrete VCS implementations, which would conflict with the stated default/future extensibility model.
- **Spec-drift interpretation (recommended):** change the verification scenario to `GitVcsAdapter.detect(cwd)` or `createVcsAdapter(cwd)`.
- **Evidence:** `packages/core/src/application/ports/vcs-adapter.ts`, `packages/core/src/infrastructure/git/vcs-adapter.ts`, `packages/core/src/composition/vcs-adapter.ts`.

## Requirements and scenario assessment

### `code-graph:composition` — 7 requirements, 19 scenarios

| Requirement / merged verify scenarios                                                    | Status | Evidence and coverage                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider facade: delegate `findSymbols`; index; clear/re-index; normalize file selector  | PASS   | Provider delegates each listed store/service method; `index()` invokes `IndexCodeGraph`; `clear()` clears under provider lock. Automated coverage exists for indexing and clear-ready state. No focused delegate, re-index-after-clear, or selector-normalization test.                                                 |
| Factory: primary `SpecdConfig`; derives storage from `configPath`                        | PASS   | Factory overload guard selects `configPath`; registry creates `sqlite` default / selectable `ladybug`, registers four built-ins and additive adapters. `code-graph-provider.spec.ts` opens and queries the `SpecdConfig` factory path.                                                                                  |
| Package exports: internals absent; adapter/factory/model/workspace/error exports present | PASS   | Curated `public.ts` and `package.json` map `.` to `public`; concrete stores/registry/indexer are absent. `barrel.spec.ts` provides public-surface coverage. The merged scenario names `CodeGraphFactoryOptions`; actual required/exported name is `CodeGraphCompositionOptions` (test/spec naming drift, non-blocking). |
| Public/internal entry points                                                             | PASS   | `.` maps to `dist/public.js`; `./internal` maps to `dist/index.js`. `InMemoryIndexSession` is not exported by public barrel and remains available internally. Barrel tests cover the intended boundary.                                                                                                                 |
| Explicit lifecycle and idempotent close                                                  | PASS   | `open()` is explicit; all operations guard availability; `close()` returns when already closed. Tests cover pre-open/after-close error and repeated close.                                                                                                                                                              |
| Runtime dependency on core                                                               | PASS   | `@specd/core` is a runtime dependency; factory accepts `SpecdConfig` but retains only derived composition inputs.                                                                                                                                                                                                       |
| Host use cases exported                                                                  | PASS   | Public barrel exports all four use cases/factories; host-use-case factory tests cover constructed instances.                                                                                                                                                                                                            |

**Composition discrepancy:** M1 above.  
**Additional coverage gaps:** 3 provider delegation/re-index/selector scenarios; public export tests should explicitly assert the exact selected factory option type and the public constructor policy.

### `code-graph:index-project-graph` — 4 requirements, 6 scenarios

| Requirement / merged verify scenarios                                        | Status | Evidence and coverage                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build options, call `provider.index` once, preserve result; forward progress | PASS   | `execute()` creates options from prepared inputs and returns `provider.index()` directly. Unit tests cover incremental result identity and `onProgress`.        |
| Force handling; never call `recreate` directly                               | PASS   | Only `{ force: true }` is forwarded; `CodeGraphHostPort` has no `recreate` member. Tests cover true and false force paths.                                      |
| Open provider/prepared inputs; no config/lock/subprocess/destructive work    | PASS   | Use case imports only host port/value types and performs no I/O. Static inspection supports the no-lock/no-config scenario; no explicit spy/static test exists. |
| Stateless factory                                                            | PASS   | Factory returns `new IndexProjectGraph()`; `host-use-case-factories.spec.ts` checks distinct instances.                                                         |

**Coverage gap:** the no-workspace-resolution/no-lock scenario has source-level evidence only. Add a test double with forbidden properties/spies or a static boundary test. Note that `vcsRoot` is required by the implementation input even though omitted from the merged requirement's input list; it is necessary for current `IndexOptions` and is not demonstrably harmful, but the spec should document it if required API surface is intended.

### `code-graph:get-graph-health` — 6 requirements, 9 scenarios

| Requirement / merged verify scenarios                     | Status | Evidence and coverage                                                                                                                                                       |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enriched statistics, fresh and unknown staleness          | PASS   | Use case spreads statistics and uses `isGraphStale`; tests cover matching ref (`false`) and `lastIndexedRef: null` (`null`).                                                |
| Provider-owned availability; busy/stale error propagation | PASS   | `await provider.getStatistics()` occurs before the VCS/fingerprint catches, so provider errors propagate unchanged. No direct `GRAPH_BUSY` or `GRAPH_PROVIDER_STALE` tests. |
| VCS staleness/current ref                                 | PASS   | Composition injects `createVcsAdapter`; use case calls `ref()` and computes drift. Test covers changed ref and unavailable VCS.                                             |
| Fingerprint mismatch and skip path                        | PASS   | Parses stored map, builds effective config, then calls `detectFingerprintMismatch`; tests cover matching, mismatch, and omitted workspaces.                                 |
| Open provider; no mutation/index/context loading          | PASS   | Input uses host port; only `getStatistics` is called; tests spy that `open` and `close` are not called. Source has no mutation/index/context imports.                       |
| Stateless factory                                         | PASS   | Factory injects `createVcsAdapter`; host factory test verifies new instances.                                                                                               |

**Coverage gaps:** missing direct assertions that `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` instances propagate unchanged. The code is correct, but these are explicit merged verify scenarios.

### `core:vcs-adapter-port` — 11 requirements, 18 scenarios

| Requirement / merged verify scenarios                       | Status                  | Evidence and coverage                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstract base/protected `cwd`; public export                | PASS                    | `VcsAdapter` is an abstract class with protected readonly constructor parameter; `core/public.ts` exports it. Barrel coverage exists.                                                                                                                                                                |
| Root, branch, cleanliness, ref, refAt, show, modified files | PASS                    | Git implementation follows specified commands/fallbacks: cached/absolute root, `HEAD` sentinel, porcelain clean check, null-safe ref/refAt/show, and normalized relative changed/untracked paths. Only root and identity have direct focused Git tests; most required behavior lacks scenario tests. |
| Null fallback including identity                            | PASS                    | `NullVcsAdapter` returns every specified sentinel and throws `no VCS detected` for root. Tests cover root/branch/clean/ref/show/identity; `refAt` and `modifiedFiles` scenarios are untested.                                                                                                        |
| Identity                                                    | PASS                    | Port type and Git/Null behavior conform; Git identity has a focused test.                                                                                                                                                                                                                            |
| Static detect                                               | SPEC INCONSISTENCY (M2) | Base default returns null; concrete Git detection and `createVcsAdapter` factory work, but the literal `VcsAdapter.detect` verify scenario fails.                                                                                                                                                    |

**Coverage gaps:** clean/dirty working tree, detached HEAD, no-commit ref, both `refAt` cases, missing revision/file (the latter is covered by code but not an isolated fixture), modified-files semantics, Null `refAt`, Null `modifiedFiles`, and direct detection dispatch.

## Global and direct-dependency conformance

- **Architecture:** code-graph application use cases depend on `CodeGraphHostPort`, not concrete infrastructure; composition is the only inspected code-graph layer importing store/lock infrastructure. `GetGraphHealth` receives VCS through constructor injection. This conforms to the application-port and manual-DI requirements.
- **Graph store/indexer:** force recreation is owned by `CodeGraphProvider.index()` and reaches abstract `GraphStore.recreate()` under the provider lock; `IndexProjectGraph` only forwards `force`. This conforms to the graph-store recreation boundary and indexer delegation.
- **Staleness detection:** health delegates staleness to `isGraphStale`, safely treats unknown indexed ref as `null`, and uses the established fingerprint helpers.
- **Core VCS factory:** `createVcsAdapter` detects concrete Git/Hg/SVN providers and falls back to `NullVcsAdapter`, consistent with the port's adapter separation. M2 is a wording/scenario conflict, not a factory failure.
- **No dependency cycle found in reviewed package manifests:** code-graph has runtime `@specd/core`; this follows the configured package direction.

## Recommended verification follow-up

1. Resolve M1's public-constructor contract before approval.
2. Correct M2's verification scenario to target `GitVcsAdapter.detect` or `createVcsAdapter`.
3. Add focused tests for every listed coverage gap, especially provider busy/stale propagation and Git VCS behavior under real temporary repositories.
