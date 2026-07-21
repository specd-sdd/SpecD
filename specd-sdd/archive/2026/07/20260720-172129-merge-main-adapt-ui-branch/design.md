# Design: merge-main-adapt-ui-branch

## Non-goals

- Do not modify, delete, rename, or repurpose `@specd/code-graph-electron`.
- Do not introduce a Ladybug Electron factory.
- Do not overwrite the built-in `sqlite` backend id.
- Do not re-export `createCodeGraphProvider` from `@specd/code-graph-sqlite-electron`.
- Do not retarget CLI or API default graph execution to Electron-vendored SQLite.
- Do not change `withOpenGraphProvider` / `runIndexProjectGraph` contracts in `@specd/sdk` (CLI short-lived path stays; long-lived hosts refresh after index).
- Do not publish `@specd/code-graph-sqlite-electron` as a public npm product.

## Affected areas

### Already landed

- Merge of `main` into `feat/user-interface` (`31ca50a2`).
- Nested `SdkContextOptions.kernel` / `graph` seams present.
- `packages/api/src/composition/create-api-server.ts` already nests kernel log options — keep and extend with long-lived provider ownership.
- Workspace `code-graph-sqlite-electron` registered in `specd.yaml`; package scaffold exists.

### Existing files to modify

**New package (complete scaffold):**

- `packages/code-graph-sqlite-electron/**` — factory, deferred loader, vendor scripts, tsup, tests, package metadata.
- `.gitignore` — ignore `packages/code-graph-sqlite-electron/vendor/`.

**Desktop:**

- `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
  - Stop importing `@specd/code-graph-electron`.
  - Wire `createSdkContext` with `graphStoreId: 'sqlite-electron'` + factory.
  - Own one long-lived opened provider per project session; replace short-lived open/close helper with healthy long-lived access (`withHealthyGraphProvider`).
  - On `GraphProviderStaleError`: close + reopen/replace; on project switch/teardown: close.
  - After `runIndexProjectGraph`: replace/reopen long-lived provider.
  - Import graph symbols from `@specd/sdk`.
  - Risk: HIGH (IPC hotspot) — keep IPC method shapes/DTOs unchanged.
- `apps/specd-studio-desktop/package.json` — dependency + rebuild scripts → new package.
- `apps/specd-studio-desktop/tsup.main.config.ts` — externalise new package.

**API:**

- `packages/api/src/composition/create-api-server.ts` — open long-lived provider at bootstrap; close in `ApiServer.close()`; refresh after index / on stale.
- `packages/api/src/composition/create-api-context.ts` — expose `getGraphProvider()` (peek) and `withGraphProvider()` (healthy stale-retry) on `ApiContext`; hold provider on `ApiServerState`.
- `packages/api/src/delivery/http/handlers/handler-graph.ts` — use `withGraphProvider()` for reads; release → `runIndexProjectGraph` → refresh for index.
- Related callers (project status graph health, etc.) that currently create+open+close MUST use the healthy long-lived accessor.

### Leave untouched

- `packages/code-graph-electron/**`
- Builtin `sqlite` registration
- CLI `withOpenGraphProvider` / `withProvider` short-lived path

## New constructs

### Package `@specd/code-graph-sqlite-electron`

Same contract as previously designed:

- `createElectronSqliteGraphStoreFactory(): GraphStoreFactory` via `createSqliteGraphStoreFactory({ loadDatabaseModule })`
- `loadVendoredBetterSqlite3Module()` — deferred `require` of package-local `vendor/better-sqlite3`
- Scripts: `sync-vendored-sqlite.mjs`, `rebuild-vendored-sqlite-electron.mjs`, `electron-build-metadata.mjs` (copy patterns from electron package; independent paths)
- No composition re-exports; private workspace package

### Long-lived host helpers (API + desktop, local to each host)

Not a new SDK export in this change. Each host implements:

```ts
async function ensureOpenGraphProvider(host: {
  createGraphProvider: () => CodeGraphProvider
  graphProvider?: CodeGraphProvider
}): Promise<CodeGraphProvider>

async function refreshGraphProvider(...): Promise<CodeGraphProvider>
// close existing if any → createGraphProvider() → open() → store

async function withHealthyGraphProvider<T>(
  run: (provider: CodeGraphProvider) => Promise<T>,
): Promise<T>
// try run; on GraphProviderStaleError → refresh → retry once
```

**API surface:**

```ts
interface ApiServerState extends SdkHostContext {
  config: SpecdConfig
  kernelActor: ActorResolver
  authType: string
  graphProvider: CodeGraphProvider // opened
}

interface ApiContext extends SdkHostContext {
  // existing fields...
  /** Peek: returns the held long-lived opened provider (no stale reopen). */
  getGraphProvider(): Promise<CodeGraphProvider>
  /** Healthy: run against the long-lived provider; reopen once on GraphProviderStaleError. */
  withGraphProvider<T>(run: (provider: CodeGraphProvider) => Promise<T>): Promise<T>
  releaseGraphProviderForIndex(): Promise<void>
  refreshGraphProvider(): Promise<CodeGraphProvider>
}
```

**Desktop:** store opened provider on `DesktopHostContext` / session; IPC graph paths call `withHealthyGraphProvider`; project switch closes it.

**Accessor split (not short-lived):** `withGraphProvider` / `withHealthyGraphProvider` reuse the same long-lived instance. They are **not** `withOpenGraphProvider` (open → callback → close).

## Approach

1. Complete `@specd/code-graph-sqlite-electron` (loader, factory, scripts, gitignore, tests, build).
2. Desktop: SDK graph options + long-lived provider lifecycle; remove per-call helper and electron package imports; retarget deps/scripts/tsup.
3. API: open provider at `createApiServer` bootstrap; expose `getGraphProvider` (peek) + `withGraphProvider` (healthy); convert graph handlers to `withGraphProvider`; refresh after `runIndexProjectGraph` and on stale; close on `ApiServer.close()`.
4. Keep `runIndexProjectGraph` as-is (short-lived internally); hosts always refresh long-lived afterward.
5. Confirm API nested kernel log options remain correct.
6. Leave `@specd/code-graph-electron` unused.
7. Update stale desktop tests that still assert `@specd/code-graph-electron` / short-lived `openGraphProviders`.

### Desktop wiring

```ts
const { kernel, createGraphProvider } = await createSdkContext(config, {
  kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) },
  graph: {
    graphStoreId: 'sqlite-electron',
    graphStoreFactories: {
      'sqlite-electron': createElectronSqliteGraphStoreFactory(),
    },
  },
})
const graphProvider = createGraphProvider()
await graphProvider.open()
// retain on host; IPC uses withHealthyGraphProvider; switch/teardown closes
```

### API wiring

```ts
const sdkHost = await createSdkContext(config, {
  kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) },
})
const graphProvider = sdkHost.createGraphProvider()
await graphProvider.open()
const state: ApiServerState = { ...sdkHost, config, kernelActor, authType, graphProvider }

// handlers (reads):
await ctx.withGraphProvider(async (provider) => {
  /* ... */
})
// index:
await ctx.releaseGraphProviderForIndex()
try {
  await runIndexProjectGraph(ctx, input)
} finally {
  await ctx.refreshGraphProvider()
}
```

### Backend ids

- Desktop: `'sqlite-electron'` (additive).
- API/CLI: builtin `'sqlite'`.

## Key decisions

- **New package vs mash `code-graph-electron`** → independence; leave old package unused.
- **Factory injection vs composition fork** → `createSqliteGraphStoreFactory({ loadDatabaseModule })`.
- **Desktop + API are long-lived hosts** → matches `code-graph:composition` and `docs/sdk/index.md`. **Rejected:** routine `withOpenGraphProvider` per IPC/HTTP call.
- **`getGraphProvider` vs `withGraphProvider`** → peek vs healthy stale-retry on the same long-lived provider. **Rejected:** conflating healthy accessor with SDK short-lived `withOpenGraphProvider`.
- **Do not change `runIndexProjectGraph` in this change** → refresh long-lived provider after index. **Rejected for now:** optional-provider parameter on SDK index helper (can be a follow-up).
- **Ladybug Electron deferred.**

## Trade-offs

- **[Risk] Concurrent HTTP requests share one provider** → Mitigation: provider already surfaces `GRAPH_BUSY`; index path refreshes afterward; document busy errors.
- **[Risk] Index uses short-lived provider while long-lived still open** → Mitigation: after index always refresh/replace long-lived (generation may rotate on force recreate).
- **[Risk] Desktop IPC hotspot** → Mitigation: lifecycle only; no DTO/IPC renames.
- **[Risk] Duplicate vendor scripts** → Accept for package independence.

## Spec impact

### New

- `code-graph-sqlite-electron:sqlite-electron-store`

### Modified

- `studio-desktop:main-kernel-lifecycle`, `studio-desktop:ipc-handler-registry`
- `api:composition-create-api-server`, `api:composition-create-api-context`, `api:composition-graph-provider`, `api:handler-graph`

### Dependents

- IPC/HTTP contracts stay stable if accessors are internal. No additional dependent specs require edits beyond the scoped set.

## Migration / compatibility

- Desktop dependency swap + rebuild under new vendor path.
- API behaviour change is internal (same HTTP routes); clients should see fewer open/close costs, same DTOs.
- First desktop start may rebuild native addon.

## Testing requirements

- New package: deferred load + factory + vendor path tests.
- Desktop typecheck/build; smoke graph IPC with long-lived provider; switch closes provider.
- API tests: bootstrap opens provider; handlers do not per-request close; close() closes provider; stale/index refresh paths covered where practical.
- Confirm CLI/API do not depend on `@specd/code-graph-sqlite-electron`.

## Acceptance criteria

- `@specd/code-graph-sqlite-electron` builds and exports the factory.
- Desktop uses sqlite-electron + long-lived provider; no `code-graph-electron` import; no per-call open/close for routine IPC.
- API owns long-lived provider; handlers use `withGraphProvider` (healthy); `getGraphProvider` is peek-only; close on shutdown; refresh after index/stale.
- Desktop package/tests assert `@specd/code-graph-sqlite-electron` and long-lived holder (not legacy `code-graph-electron` / `openGraphProviders`).
- Builtin `sqlite` unchanged for Node hosts.
- Vendor dir gitignored for the new package.
