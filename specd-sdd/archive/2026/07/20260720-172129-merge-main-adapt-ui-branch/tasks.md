# Tasks: merge-main-adapt-ui-branch

## 1. Package scaffold completion

- [x] 1.1 Fill `@specd/code-graph-sqlite-electron` package metadata
      `packages/code-graph-sqlite-electron/package.json` — replace scaffold scripts/deps/exports
      Approach: private ESM; `files: ["dist/", "vendor/"]`; deps `@specd/code-graph` + `better-sqlite3@^12.8.0`; scripts sync/rebuild/build/typecheck/test/lint
      (Req: Dedicated Electron SQLite store package, Internal-only distribution role)

- [x] 1.2 Add tsup build without sqlite-store rewrite plugin
      `packages/code-graph-sqlite-electron/tsup.config.ts` — entry `src/index.ts` → `dist/`
      Approach: plain tsup ESM; no esbuild rewrite of `better-sqlite3` imports
      (Req: Dedicated Electron SQLite store package)

- [x] 1.3 Ignore generated vendor tree
      `.gitignore` — add `packages/code-graph-sqlite-electron/vendor/`
      Approach: mirror electron vendor ignore; leave electron ignore untouched
      (Req: Locally generated vendored sqlite tree)

## 2. Vendored sqlite scripts

- [x] 2.1 Copy portable Electron build metadata helpers
      `packages/code-graph-sqlite-electron/scripts/electron-build-metadata.mjs`
      Approach: duplicate from electron package; `electronVersion`/`platform`/`arch`; reject `binaryPath`
      (Req: Platform-aware Electron rebuild cache)

- [x] 2.2 Add vendor sync script for this package root
      `packages/code-graph-sqlite-electron/scripts/sync-vendored-sqlite.mjs`
      Approach: target this package’s `vendor/better-sqlite3` only
      (Req: Locally generated vendored sqlite tree)

- [x] 2.3 Add Electron rebuild script with cache skip
      `packages/code-graph-sqlite-electron/scripts/rebuild-vendored-sqlite-electron.mjs`
      Approach: sync → skip if metadata matches → else Electron `npm rebuild` + write metadata
      (Req: Platform-aware Electron rebuild cache)

## 3. Factory and deferred loader

- [x] 3.1 Implement deferred vendored module loader
      `packages/code-graph-sqlite-electron/src/runtime/load-vendored-better-sqlite3.ts`
      Approach: `require` only inside async loader; return `{ default: Database }`
      (Req: Deferred native module load)

- [x] 3.2 Export `createElectronSqliteGraphStoreFactory`
      `packages/code-graph-sqlite-electron/src/create-electron-sqlite-graph-store-factory.ts` + `src/index.ts`
      Approach: wrap `createSqliteGraphStoreFactory({ loadDatabaseModule })`; no composition re-exports
      (Req: sqlite-electron GraphStoreFactory)

- [x] 3.3 Build the package
      `pnpm --filter @specd/code-graph-sqlite-electron build`
      Approach: sync + tsup produce `dist/`
      (Req: Dedicated Electron SQLite store package)

## 4. Package tests

- [x] 4.1 Test deferred native load on factory construction
      `packages/code-graph-sqlite-electron/test/...`
      Approach: constructing factory must not load `.node`
      (Req: Deferred native module load)

- [x] 4.2 Test factory uses injectable sqlite seam
      `packages/code-graph-sqlite-electron/test/...`
      Approach: assert wiring to `createSqliteGraphStoreFactory` + vendored loader
      (Req: sqlite-electron GraphStoreFactory)

- [x] 4.3 Test vendor paths stay under this package
      `packages/code-graph-sqlite-electron/test/...`
      Approach: paths include `code-graph-sqlite-electron/vendor`, not `code-graph-electron/vendor`
      (Req: Locally generated vendored sqlite tree)

## 5. Desktop dependency and rebuild wiring

- [x] 5.1 Swap desktop dependency to sqlite-electron package
      `apps/specd-studio-desktop/package.json`
      Approach: remove `@specd/code-graph-electron`; add `@specd/code-graph-sqlite-electron`; `pnpm install`
      (Req: Host wiring via SDK graph options)

- [x] 5.2 Retarget rebuild scripts to the new package
      `apps/specd-studio-desktop/package.json`
      Approach: filter rebuild to `@specd/code-graph-sqlite-electron`; keep alias + `prestart`
      (Req: desktop startup prepares the Electron SQLite graph runtime)

- [x] 5.3 Externalise new package in main tsup bundle
      `apps/specd-studio-desktop/tsup.main.config.ts`
      Approach: external `@specd/code-graph-sqlite-electron`
      (Req: main process entry is bundled for pnpm and Electron)

## 6. Desktop long-lived graph host

- [x] 6.1 Rewire `getHost` with SDK graph options + open long-lived provider
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts` — `getHost`
      Approach: `graphStoreId: 'sqlite-electron'` + factory; `createGraphProvider()` then `await open()`; retain on host with nested kernel log options
      (Req: Host wiring; long-lived Electron host; plain-text logs)

- [x] 6.2 Replace per-call `withGraphProvider` with healthy long-lived access
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
      Approach: delete local open/close helper; graph IPC uses retained provider; on `GraphProviderStaleError` close+reopen/replace and retry once; do not use `withOpenGraphProvider` for routine IPC
      (Req: graph IPC methods use the Electron graph runtime)

- [x] 6.3 Close/refresh provider on project switch and after index
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts` — session reset + index IPC
      Approach: project switch closes long-lived provider; after `runIndexProjectGraph` refresh/replace before next graph IPC
      (Req: project switch tears down kernel and graph state; long-lived refresh)

- [x] 6.4 Remove `@specd/code-graph-electron` imports
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
      Approach: import symbols from `@specd/sdk` + factory from sqlite-electron package
      (Req: Host wiring via SDK graph options)

## 7. API long-lived graph host

- [x] 7.1 Open long-lived provider in `createApiServer` and close on shutdown
      `packages/api/src/composition/create-api-server.ts`
      Approach: after `createSdkContext`, `createGraphProvider()` + `open()`; store on `ApiServerState`; `close()` closes provider; keep nested kernel log options
      (Req: one kernel per process; long-lived HTTP API host)

- [x] 7.2 Add `getGraphProvider` and `withGraphProvider` on API context/state
      `packages/api/src/composition/create-api-context.ts`
      Approach: `getGraphProvider` peeks held provider; `withGraphProvider` → `withHealthyGraphProvider` (stale → refresh once); also expose release/refresh for index
      (Req: context exposes kernel and actor; graph provider factory is per project config)

- [x] 7.3 Convert graph handlers to healthy long-lived accessor
      `packages/api/src/delivery/http/handlers/handler-graph.ts`
      Approach: replace per-request create/open/close with `ctx.withGraphProvider(...)`; index uses release → `runIndexProjectGraph` → refresh in `finally`
      (Req: handler delegates without duplicating domain rules)

- [x] 7.4 Refresh long-lived provider after index and on stale in composition path
      `packages/api/src/composition/*` (+ any shared helper colocated there)
      Approach: centralize refresh used by index handler and stale recovery; do not call `withOpenGraphProvider` for routine routes
      (Req: long-lived provider refresh after index and stale errors)

## 8. Verification

- [x] 8.1 Typecheck/build new package, desktop main, and API
      Approach: fix resolution/export/lifecycle typing issues
      (Req: package + bundled entry + API composition)

- [x] 8.2 Smoke desktop local graph IPC with long-lived provider
      Approach: rebuild vendor; open project; graph IPC; switch project closes provider
      (Req: Shared SQLite semantics; graph IPC long-lived)

- [x] 8.3 Confirm CLI/API do not depend on sqlite-electron; API uses Node sqlite long-lived
      Approach: package.json/import audit
      (Req: CLI/API keep standard runtime; desktop-only sqlite-electron)

- [x] 8.4 Exercise API graph status then index then status without per-request close
      Approach: existing API graph tests / targeted assertion that provider stays open across reads and refreshes after index
      (Req: Server opens one long-lived graph provider; Index completion refreshes)

## 9. Post-verify test alignment

- [x] 9.1 Update `desktop-graph-runtime.spec.ts` for sqlite-electron package
      `apps/specd-studio-desktop/test/desktop-graph-runtime.spec.ts`
      Approach: assert `@specd/code-graph-sqlite-electron` dep and rebuild script filter; drop `@specd/code-graph-electron` expectations
      (Req: Desktop local host depends on the sqlite-electron package)

- [x] 9.2 Update `ipc-graph-provider.spec.ts` for sqlite-electron import
      `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts`
      Approach: expect `from '@specd/code-graph-sqlite-electron'` (or factory import) instead of `@specd/code-graph-electron`
      (Req: Local graph IPC uses long-lived sqlite-electron provider)

- [x] 9.3 Update `desktop-host-lifecycle.spec.ts` for long-lived holder
      `apps/specd-studio-desktop/test/desktop-host-lifecycle.spec.ts`
      Approach: assert `createGraphProvider` destructure / `activeGraph` + `resetDesktopKernel` closes provider; remove short-lived `openGraphProviders` expectations
      (Req: project switch tears down kernel and graph state; long-lived Electron host)
