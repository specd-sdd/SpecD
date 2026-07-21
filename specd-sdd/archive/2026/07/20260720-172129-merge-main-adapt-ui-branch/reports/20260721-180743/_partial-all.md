# Spec Compliance Partial — all 7 change specs

- **Change:** `merge-main-adapt-ui-branch`
- **Mode:** change (read-only)
- **Timestamp:** 20260721-180743
- **Graph:** fresh (`stale: false` at audit time)
- **Prior audit:** `reports/20260721-170103` (desktop test drift HIGH; API get/withGraphProvider wording drift)

## Prior findings — recheck

| Prior finding                                                                              | Status                | Evidence                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop tests still expect `@specd/code-graph-electron` / short-lived `openGraphProviders` | **FIXED**             | `desktop-graph-runtime.spec.ts`, `ipc-graph-provider.spec.ts`, `desktop-host-lifecycle.spec.ts` assert sqlite-electron + long-lived; **vitest PASS 5 / FAIL 0**    |
| Spec said `getGraphProvider` reopens on stale; code peeks only                             | **FIXED**             | Merged `api:composition-create-api-context` / `composition-graph-provider` / `handler-graph`: `getGraphProvider` = peek; `withGraphProvider` = healthy stale-retry |
| Handlers must use healthy accessor                                                         | **FIXED / CONFIRMED** | `handler-graph.ts` all read routes use `ctx.withGraphProvider(...)`; index uses release → `runIndexProjectGraph` → `refreshGraphProvider`                          |

**Remaining HIGH issues:** none.

---

## 1. `code-graph-sqlite-electron:sqlite-electron-store`

### Requirements

| #   | Requirement                                                             | Impl                       | Tests                                                |
| --- | ----------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| R1  | Dedicated Electron SQLite store package                                 | **PASS**                   | Covered (barrel / workspace asserts)                 |
| R2  | `sqlite-electron` GraphStoreFactory via `createSqliteGraphStoreFactory` | **PASS**                   | Factory construct without native load                |
| R3  | Deferred native module load                                             | **PASS**                   | Spy asserts load not called at factory construction  |
| R4  | Locally generated vendored tree + gitignore                             | **PASS**                   | `.gitignore` assert + vendor path asserts            |
| R5  | Platform-aware Electron rebuild cache                                   | **PASS** (scripts)         | **Gap:** no behavioral skip-rebuild test             |
| R6  | Shared SQLite graph semantics                                           | **PASS** (by construction) | **Gap:** no sqlite↔sqlite-electron equivalence smoke |
| R7  | Host wiring via SDK graph options                                       | **PASS** (desktop)         | Desktop source asserts PASS                          |
| R8  | Internal-only (`private: true`)                                         | **PASS**                   | package.json                                         |

### Implementation notes

- Package `@specd/code-graph-sqlite-electron`, `private: true`, exports `createElectronSqliteGraphStoreFactory` only (no composition re-export).
- Factory: `createSqliteGraphStoreFactory({ loadDatabaseModule: loadVendoredBetterSqlite3Module })`.
- Root `.gitignore`: `packages/code-graph-sqlite-electron/vendor/`.
- Sync/rebuild scripts with Electron version + platform + arch cache metadata present.
- Desktop host: `graphStoreId: 'sqlite-electron'` + additive factory; no `@specd/code-graph-electron` on path.

### Test run

`packages/code-graph-sqlite-electron`: **PASS 6 / FAIL 0**

### Discrepancies / HIGH

- **None HIGH.** Residual **gaps** only: rebuild-skip behavior, provider-level deferred-load-on-`open()`, cross-backend equivalence.

### Counts

- Requirements PASS: 8 | FAIL: 0 | Gaps: 2–3 (non-blocking)

---

## 2. `studio-desktop:main-kernel-lifecycle`

### Requirements

| #   | Requirement                                                                               | Impl     | Tests                                                               |
| --- | ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| R1  | One SDK host per open local project                                                       | **PASS** | `desktop-host-lifecycle` hostPromise / generation asserts           |
| R2  | Project switch tears down kernel + graph                                                  | **PASS** | `resetDesktopKernel` closes `activeGraph.provider`                  |
| R3  | Electron SQLite runtime prep (dep, rebuild scripts, prestart, long-lived sqlite-electron) | **PASS** | `desktop-graph-runtime` PASS                                        |
| R4  | `start` clears `ELECTRON_RUN_AS_NODE`                                                     | **PASS** | package.json scripts (static)                                       |
| R5  | Bundled CJS main + externals                                                              | **PASS** | `main: dist/main/index.cjs`; tsup externals include sqlite-electron |
| R6  | Nested `kernel.logFormatter` plain-text                                                   | **PASS** | Source assert in lifecycle test                                     |

### Implementation notes

- `getHost()`: single `createSdkContext` with `graphStoreId: 'sqlite-electron'`, `createElectronSqliteGraphStoreFactory()`, `openLongLivedGraphProvider`.
- `withGraphProvider` → `withHealthyGraphProvider` (stale reopen once).
- No routine `withOpenGraphProvider`; no `@specd/code-graph-electron` import.
- CLI/API packages do not depend on sqlite-electron.

### Prior HIGH recheck

- Stale tests expecting `code-graph-electron` / `openGraphProviders`: **FIXED**. Vitest on the three files: **PASS 5 / FAIL 0**.

### Discrepancies / HIGH

- **None HIGH.**

### Counts

- Requirements PASS: 6 | FAIL: 0 | Gaps: minor (no dedicated Electron-launch integration test)

---

## 3. `studio-desktop:ipc-handler-registry`

### Requirements

| #   | Requirement                                                                                     | Impl     | Tests                                  |
| --- | ----------------------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| R1  | IPC mirrors SpecdDataPort / SDK kernel                                                          | **PASS** | Existing IPC suite + lifecycle asserts |
| R2  | ipc-message-envelope                                                                            | **PASS** | Existing                               |
| R3  | SDK kernel access (no per-handler kernel)                                                       | **PASS** | lifecycle asserts                      |
| R4  | Graph IPC: long-lived sqlite-electron; no code-graph-electron; no routine withOpenGraphProvider | **PASS** | `ipc-graph-provider` PASS              |
| R5  | Project status via `@specd/client` mapper                                                       | **PASS** | lifecycle status mapper asserts        |

### Implementation notes

- Graph IPC cases wrap `withGraphProvider` → `withHealthyGraphProvider`.
- Index IPC uses `createIndexProjectGraph` from `@specd/sdk` on the long-lived provider (spec **MAY** use `runIndexProjectGraph`; not a MUST violation).
- Import: `@specd/code-graph-sqlite-electron` only for factory.

### Prior HIGH recheck

- `ipc-graph-provider.spec.ts` old package expectation: **FIXED**.

### Discrepancies / HIGH

- **None HIGH.** Note (non-HIGH): desktop index path differs from API’s `runIndexProjectGraph` + release/refresh; still SDK-backed and long-lived-compliant.

### Counts

- Requirements PASS: 5 | FAIL: 0 | Gaps: 0 HIGH

---

## 4. `api:composition-create-api-server`

### Requirements

| #   | Requirement                                                                                  | Impl     | Tests                                                         |
| --- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| R1  | Factory accepts project/host/port/auth                                                       | **PASS** | Existing server tests                                         |
| R2  | Auth from `api.auth` only; v1 disabled                                                       | **PASS** | Existing                                                      |
| R3  | One `createSdkContext` + long-lived graph open; close on shutdown; nested kernel log options | **PASS** | Bootstrap + `ApiServer.close()` closes `state.graph.provider` |
| R4  | Routes under `/v1`                                                                           | **PASS** | graph 13/13 etc.                                              |
| R5  | Auth type without secrets                                                                    | **PASS** | Existing                                                      |

### Implementation notes

```78:96:packages/api/src/composition/create-api-server.ts
  const sdkHost = await createSdkContext(config, {
    kernel: {
      logRing,
      logFormatter: createLogFormatter({ colorize: false }),
    },
  })
  // ...
  graph: {
    provider: await openLongLivedGraphProvider(sdkHost.createGraphProvider),
  },
```

- No `@specd/code-graph-sqlite-electron` dependency (standard SDK/Node graph).

### Discrepancies / HIGH

- **None HIGH.**

### Counts

- Requirements PASS: 5 | FAIL: 0 | Gaps: no dedicated unit for close-provider alone (covered by server lifecycle)

---

## 5. `api:composition-graph-provider`

### Requirements

| #   | Requirement                                                                                                                          | Impl     | Tests                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------- |
| R1  | Provider from SdkHostContext / project config; long-lived open/reuse/close                                                           | **PASS** | graph suite                                       |
| R2  | Index via `runIndexProjectGraph` project assembly                                                                                    | **PASS** | handler index path                                |
| R3  | Stale observable via status                                                                                                          | **PASS** | graph status tests                                |
| R4  | Healthy accessor `withGraphProvider`; peek `getGraphProvider`; no direct `createCodeGraphProvider` / routine `withOpenGraphProvider` | **PASS** | Spec + code aligned                               |
| R5  | Refresh after index + stale reopen once                                                                                              | **PASS** | Index finally refresh; `withHealthyGraphProvider` |

### Prior wording drift recheck

- Spec now correctly documents peek vs healthy split — **FIXED**.

### Discrepancies / HIGH

- **None HIGH.** **Gap (non-HIGH):** no focused unit test that injects `GraphProviderStaleError` and asserts single reopen.

### Counts

- Requirements PASS: 5 | FAIL: 0 | Gaps: 1 (stale-retry unit)

---

## 6. `api:composition-create-api-context`

### Requirements

| #   | Requirement                                                                                                                          | Impl     | Tests                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------- |
| R1  | Context exposes kernel, actor, createGraphProvider, getGraphProvider (peek), withGraphProvider (healthy), config, authType, apiActor | **PASS** | Shape in `create-api-context.ts` |
| R2  | Handlers use `withGraphProvider`; `createGraphProvider` delegates to SDK host                                                        | **PASS** | handler-graph usage              |

### Implementation (accessor split — confirmed)

```62:67:packages/api/src/composition/create-api-context.ts
    getGraphProvider() {
      return Promise.resolve(state.graph.provider)
    },
    withGraphProvider(run) {
      return withHealthyGraphProvider(state.createGraphProvider, state.graph, run)
    },
```

- `withHealthyGraphProvider`: run → on `GraphProviderStaleError` → `refreshLongLivedGraphProvider` → retry once.

### Prior HIGH / medium wording recheck

- Spec/verify now match peek vs healthy — **FIXED**. Handlers never rely on peek for reads.

### Discrepancies / HIGH

- **None HIGH.** Additive helpers `releaseGraphProviderForIndex` / `refreshGraphProvider` are compliant extras.

### Counts

- Requirements PASS: 2 | FAIL: 0 | Gaps: unit coverage for peek vs stale-retry (non-HIGH)

---

## 7. `api:handler-graph`

### Requirements

| #   | Requirement                                                                                                             | Impl     | Tests                           |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| R1  | Routes under `/v1` per routes-graph                                                                                     | **PASS** | graph.spec **PASS 13 / FAIL 0** |
| R2  | Delegate: `withGraphProvider` for reads; `runIndexProjectGraph` for index; no direct code-graph / withOpenGraphProvider | **PASS** | Source + suite                  |
| R3  | Presenters / DTO shapes                                                                                                 | **PASS** | Existing                        |
| R4  | problem+json failures                                                                                                   | **PASS** | Existing                        |
| R5  | CLI-aligned index assembly via SDK                                                                                      | **PASS** | `runIndexProjectGraph`          |
| R6  | SDK delivery imports only                                                                                               | **PASS** | Imports from `@specd/sdk`       |

### Index path (confirmed)

```67:75:packages/api/src/delivery/http/handlers/handler-graph.ts
      await ctx.releaseGraphProviderForIndex()
      try {
        const result = await runIndexProjectGraph(ctx, {
          ...(body.force === true ? { force: true } : {}),
        })
        return toGraphIndexResultDto(result)
      } finally {
        await ctx.refreshGraphProvider()
      }
```

### Discrepancies / HIGH

- **None HIGH.**

### Counts

- Requirements PASS: 6 | FAIL: 0 | Gaps: 0

---

## Aggregate (this partial)

| Spec                                             | Impl | Tests                        | HIGH issues   |
| ------------------------------------------------ | ---- | ---------------------------- | ------------- |
| code-graph-sqlite-electron:sqlite-electron-store | PASS | PASS 6/6                     | 0 (gaps only) |
| studio-desktop:main-kernel-lifecycle             | PASS | PASS (prior FAIL fixed)      | 0             |
| studio-desktop:ipc-handler-registry              | PASS | PASS (prior FAIL fixed)      | 0             |
| api:composition-create-api-server                | PASS | PASS                         | 0             |
| api:composition-graph-provider                   | PASS | PASS                         | 0             |
| api:composition-create-api-context               | PASS | PASS (shape; stale-unit gap) | 0             |
| api:handler-graph                                | PASS | PASS 13/13                   | 0             |

**Totals:** PASS **7** / FAIL **0** / HIGH **0** / non-blocking gaps **~4** (rebuild-skip, sqlite equivalence, GraphProviderStaleError unit, optional desktop Electron-launch IT).
