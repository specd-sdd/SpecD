# Tasks: 11-sdk-host-facade

## 1. Package scaffold

- [x] 1.1 Add eslint config for sdk package
      `packages/sdk/eslint.config.js` — mirror `packages/code-graph` eslint setup
      Approach: copy pattern from sibling package; include src/ JSDoc rules
      (Req: Package identity and dependencies)

- [x] 1.2 Add vitest config for sdk package
      `packages/sdk/vitest.config.ts` — test runner for unit tests
      Approach: extend root vitest config; include `test/**/*.spec.ts`
      (Req: Layer structure)

## 2. Host context

- [x] 2.1 Define SdkHostContext and OpenSpecdHost types
      `packages/sdk/src/composition/host-context.ts`: `SdkHostContext`, `OpenSpecdHostInput`, `OpenSpecdHostResult`
      Approach: readonly interfaces per design signatures; export from composition barrel
      (Req: SdkHostContext shape)

- [x] 2.2 Implement createSdkContext
      `packages/sdk/src/composition/host-context.ts`: `createSdkContext`
      Approach: `createKernel(config, options)` + `createGraphProvider: () => createCodeGraphProvider(config)`; new provider each call
      (Req: createSdkContext)

- [x] 2.3 Implement openSpecdHost config loading
      `packages/sdk/src/composition/host-context.ts`: `openSpecdHost`
      Approach: `createConfigLoader()` with `{ configPath }` forced mode or discovery; `loader.load()`; resolve absolute config path
      (Req: openSpecdHost)

- [x] 2.4 Wire host-context exports
      `packages/sdk/src/composition/index.ts`: re-export host-context symbols
      Approach: named exports only; no default export
      (Req: Public barrel exports for A2a)

## 3. Graph lifecycle

- [x] 3.1 Implement withOpenGraphProvider
      `packages/sdk/src/composition/with-open-graph-provider.ts`: `withOpenGraphProvider`
      Approach: create provider → optional beforeOpen → open → fn → close in finally; rethrow fn error if close fails
      (Req: withOpenGraphProvider signature, Error propagation)

- [x] 3.2 Export withOpenGraphProvider options type
      `packages/sdk/src/composition/with-open-graph-provider.ts`: `WithOpenGraphProviderOptions`
      Approach: optional `beforeOpen` callback before `open()`
      (Req: Optional beforeOpen hook)

## 4. Orchestration

- [x] 4.1 Implement buildProjectStatusSnapshot
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: `buildProjectStatusSnapshot`
      Approach: always call `getProjectSummary` + `getConfig`; if `includeGraph`, wrap `createGetGraphHealth` in `withOpenGraphProvider`
      (Req: buildProjectStatusSnapshot orchestration)

- [x] 4.2 Add hotspots support to snapshot
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`: `buildProjectStatusSnapshot`
      Approach: when `includeHotspots` and graph loaded, call `provider.getHotspots()` in same session
      (Req: Result shape stability)

- [x] 4.3 Implement runIndexProjectGraph
      `packages/sdk/src/orchestration/run-index-project-graph.ts`: `runIndexProjectGraph`
      Approach: `getConfig` + `listWorkspaces`; `withOpenGraphProvider` with forwarded `beforeOpen`; `createIndexProjectGraph({ provider, config }).execute(input)`
      (Req: runIndexProjectGraph orchestration)

- [x] 4.4 Wire orchestration barrel
      `packages/sdk/src/orchestration/index.ts`: export orchestration modules
      Approach: named re-exports from snapshot and index-graph files
      (Req: Layer structure)

## 5. Public barrel

- [x] 5.1 Complete src/index.ts exports
      `packages/sdk/src/index.ts`: public barrel
      Approach: export host-context, with-open-graph-provider, orchestration, re-export `createConfigLoader`, `createConfigWriter`, `createKernel`, `Kernel`, `KernelOptions`, `SpecdConfig`, `CodeGraphProvider`, `createCodeGraphProvider`; keep `SDK_VERSION`
      (Req: Public barrel exports for A2a)

## 6. Tests

- [x] 6.1 Test createSdkContext provider binding
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: mock `createKernel`/`createCodeGraphProvider`; assert same config passed to both; two provider calls return distinct instances
      (Req: createSdkContext, SdkHostContext shape)

- [x] 6.2 Test openSpecdHost paths
      `packages/sdk/test/composition/host-context.spec.ts`
      Approach: mock config loader forced vs discovery modes
      (Req: openSpecdHost)

- [x] 6.3 Test withOpenGraphProvider lifecycle
      `packages/sdk/test/composition/with-open-graph-provider.spec.ts`
      Approach: mock provider; verify open/close order; fn throw preserves error
      (Req: withOpenGraphProvider signature, Error propagation, No process exit)

- [x] 6.4 Test buildProjectStatusSnapshot
      `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`
      Approach: mock kernel; `includeGraph: false` skips provider; `true` opens provider and calls GetGraphHealth
      (Req: buildProjectStatusSnapshot orchestration, Result shape stability)

- [x] 6.5 Test runIndexProjectGraph
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: mock IndexProjectGraph; verify workspace filter and onProgress passthrough
      (Req: runIndexProjectGraph orchestration, Progress callback passthrough)

## 7. Documentation

- [x] 7.1 Add SDK documentation
      `docs/core/sdk.md`: new doc file
      Approach: document bootstrap flow, orchestration helpers, config read/write boundary per design
      (Req: @specd/sdk orchestrates cross-package host bootstrap)

- [x] 7.2 Add JSDoc to all exported SDK symbols
      `packages/sdk/src/**/*.ts`: exported functions and types
      Approach: `@param`, `@returns`, `@throws` on all public API per default:\_global/docs
      (Req: Version constant, all public exports)

## 8. Validation

- [x] 8.1 Build and test sdk package
      `packages/sdk/`: package scripts
      Approach: `pnpm --filter @specd/sdk build && pnpm --filter @specd/sdk test && pnpm --filter @specd/sdk lint`
      (Req: all verify scenarios)

- [x] 8.2 Manual export smoke test
      root: node import check
      Approach: `node -e "import('@specd/sdk').then(m => console.log(Object.keys(m).sort()))"` — confirm expected exports present
      (Req: Public barrel exports for A2a)
