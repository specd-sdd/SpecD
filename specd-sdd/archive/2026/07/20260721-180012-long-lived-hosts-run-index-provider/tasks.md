# Tasks: long-lived-hosts-run-index-provider

## 1. API index handler

- [x] 1.1 Pass long-lived provider into `runIndexProjectGraph` on index route
      `packages/api/src/delivery/http/handlers/handler-graph.ts`: `POST /graph/index`
      `apiHandler` — replace `releaseGraphProviderForIndex` → `runIndexProjectGraph` →
      `refreshGraphProvider` with indexing on the held provider
      Approach: inside the handler, call
      `await ctx.withGraphProvider(async (provider) => runIndexProjectGraph(ctx, {
    provider,
    ...(body.force === true ? { force: true } : {}),
  }))` then `toGraphIndexResultDto(result)`. Do not release/close before index; do not
      refresh in `finally` solely because index ran.
      (Req: handler delegates to kernel without duplicating domain rules;
      graph indexing uses CLI-aligned project assembly)

- [x] 1.2 Confirm other graph routes still use healthy accessor only
      `packages/api/src/delivery/http/handlers/handler-graph.ts`: status/search/impact/hotspots
      — no change to `withGraphProvider` usage; do not introduce per-request
      `createCodeGraphProvider` or `withOpenGraphProvider`
      Approach: spot-check handlers remain on `ctx.withGraphProvider`; leave change-scoped
      graph composition unchanged.
      (Req: handler delegates to kernel without duplicating domain rules)

## 2. API context surface cleanup

- [x] 2.1 Remove `releaseGraphProviderForIndex` from `ApiContext`
      `packages/api/src/composition/create-api-context.ts`: `ApiContext` interface and
      `createApiContext` implementation — delete `releaseGraphProviderForIndex` method
      Approach: remove interface member and method that delegates to
      `releaseLongLivedGraphProviderForIndex` (or equivalent). No remaining callers after 1.1.
      (Req: graph provider factory is per project config)

- [x] 2.2 Remove unused `refreshGraphProvider` from `ApiContext`
      `packages/api/src/composition/create-api-context.ts`: `ApiContext` / `createApiContext`
      — delete `refreshGraphProvider` now that only the index handler used it
      Approach: stale recovery stays on `withGraphProvider` /
      `withHealthyGraphProvider` in `long-lived-graph.ts`; do not delete healthy reopen.
      Update JSDoc on remaining graph accessors to state index uses injected provider and
      does not mandate post-index refresh.
      (Req: long-lived provider stale reopen and index on injected provider;
      graph provider factory is per project config)

- [x] 2.3 Drop dead release/refresh helpers if only used by removed ApiContext methods
      `packages/api/src/composition/long-lived-graph.ts` (and any re-exports) — remove
      helpers that existed solely for pre-index release / mandatory post-index refresh
      Approach: inventory callers after 2.1–2.2; keep `refreshLongLivedGraphProvider` /
      `withHealthyGraphProvider` if still used by stale recovery; remove only dead
      release-for-index helpers.
      (Req: long-lived provider stale reopen and index on injected provider)

## 3. Desktop index IPC

- [x] 3.1 Switch `indexGraph` to `runIndexProjectGraph` with session provider
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts`: `case 'indexGraph'` — replace
      manual `listWorkspaces` / `buildProjectGraphConfig` / `createVcsAdapter` /
      `createIndexProjectGraph().execute(...)` with SDK orchestration
      Approach: `const host = await getHost()`; build
      `const sdkCtx = { kernel: host.kernel, createGraphProvider: host.createGraphProvider }`;
      `await withGraphProvider(async (provider) => runIndexProjectGraph(sdkCtx, {
    provider,
    ...(input?.force === true ? { force: true } : {}),
  }))`; map/return existing success DTO path. Do not reopen host provider after success
      (including `force: true`).
      (Req: graph IPC methods use the Electron graph runtime;
      desktop startup prepares the Electron SQLite graph runtime)

- [x] 3.2 Clean unused imports after index rewrite
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts` — remove `createIndexProjectGraph`
      and any imports that become unused solely because of 3.1 (keep imports still used by
      status/other cases)
      Approach: import `runIndexProjectGraph` from `@specd/sdk` (or existing SDK barrel);
      drop dead symbols; keep `sqlite-electron` host wiring and stale `withGraphProvider`
      behaviour unchanged.
      (Req: graph IPC methods use the Electron graph runtime)

## 4. Tests

- [x] 4.1 API: index does not release/refresh around provider
      Prefer unit coverage near handler/context if HTTP suite is heavy; otherwise extend
      `packages/api/test/graph.spec.ts` or a focused composition test
      Approach: assert `POST /v1/graph/index` (or handler under test) calls
      `runIndexProjectGraph` with `provider`; assert `releaseGraphProviderForIndex` /
      post-index `refreshGraphProvider` are absent from the path; after force index,
      subsequent `withGraphProvider` read still uses a healthy session provider.
      (Verify: Graph index passes the long-lived provider without release/refresh;
      Routine API index does not use short-lived withOpenGraphProvider path)

- [x] 4.2 Desktop: index uses `runIndexProjectGraph` and keeps provider after force
      `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts` and/or
      `desktop-graph-runtime.spec.ts` — update expectations for index path
      Approach: mock/spy `runIndexProjectGraph` receiving `provider`; assert no
      `createIndexProjectGraph` on routine path; assert host does not replace/reopen solely
      after index/`force`.
      (Verify: desktop index via runIndex with provider; no post-index reopen for force)

- [x] 4.3 Stale reopen still works (regression)
      Existing API/desktop healthy-accessor tests — ensure still green after removing
      refresh-from-index helpers
      Approach: run targeted vitest for graph/desktop host; fix only if removal broke
      stale retry wiring.
      (Req: long-lived provider stale reopen and index on injected provider)

## 5. Docs and validation

- [x] 5.1 Docs sweep for obsolete release→index→refresh wording
      `docs/` — search for host index lifecycle claiming short-lived index or mandatory
      refresh after API/desktop index
      Approach: if found, update to injected-provider semantics; if none (current check
      found none), mark done with no file edit.
      (Design: Testing / docs)

- [x] 5.2 Typecheck and package tests for api + studio-desktop
      Approach: run package typecheck/tests for `@specd/api` and
      `@specd/studio-desktop` (or repo scripts used by those packages); fix compile breaks
      from removed ApiContext methods.
      (Design: Testing)

## 6. Review follow-up (compliance)

- [x] 6.1 Unit-test healthy stale reopen for API long-lived graph helper
      `packages/api/test/long-lived-graph.spec.ts` (new) — cover
      `withHealthyGraphProvider` stale retry
      Approach: mock provider that throws `GraphProviderStaleError` on first `run`,
      then succeeds after factory opens a replacement; assert refresh/retry once and
      that non-stale errors are rethrown without refresh.
      (Req: long-lived provider stale reopen and index on injected provider;
      Verify: Stale provider is reopened)
