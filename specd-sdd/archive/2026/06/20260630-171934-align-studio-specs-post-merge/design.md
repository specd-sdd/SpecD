# Design: align-studio-specs-post-merge

## Scope

Studio post-merge alignment: **113 specs** across `sdk`, `api`, `studio-desktop`, `client`, `studio-web`, and `code-graph-electron`, plus **runtime fixes** for desktop startup and Electron graph version resolution.

## Terminology

| Old prose                                              | Updated prose                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `createKernel` in API/desktop bootstrap                | `createSdkContext` from `@specd/sdk`                                                |
| Handler imports `@specd/core`                          | Handler imports `@specd/sdk`; core use cases invoked via `kernel`                   |
| Direct `createCodeGraphProvider` in API                | `apiContext.createGraphProvider()` from `SdkHostContext`                            |
| Desktop graph IPC                                      | Still `@specd/code-graph-electron` in main process (exception in `sdk:composition`) |
| Vite host must not call `createKernel`                 | Must not call `createKernel` **or** `createSdkContext`                              |
| ESM `import { app } from 'electron'` in unbundled main | Bundled CJS main + `ELECTRON_RUN_AS_NODE` cleared at start                          |

## Delta strategy

1. **SDK specs** — document Studio hosts as integrators; add Studio bootstrap requirement to `host-context`.
2. **API composition** — rewrite bootstrap requirements to `SdkHostContext` / `ApiServerState`.
3. **API handlers** — update Purpose, delegation, Constraints; add `SDK delivery imports` requirement.
4. **API presenters / routes / DTOs / middleware** — update shared Constraints boilerplate.
5. **Desktop** — replace `createKernel` boilerplate; lifecycle documents Electron launch and CJS main bundle.
6. **Client** — update Constraints: ui/client MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
7. **Studio web** — `vite-host` bootstrap prohibition extended to `createSdkContext`.
8. **Code graph electron** — document `@specd/code-graph` dep and bundled version resolution.

## Implementation (merge fixes)

| Area                              | Change                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/specd-studio-desktop`       | `start` clears `ELECTRON_RUN_AS_NODE`; `main` → `index.cjs`; tsup bundles main as CJS |
| `packages/code-graph`             | `readInstalledCodeGraphVersion` searches `node_modules/@specd/code-graph`             |
| `packages/code-graph-electron`    | depends on `@specd/code-graph`; `exports.require` for CJS consumers                   |
| `packages/sdk`, `packages/client` | `exports.require` for bundled desktop main                                            |

## Generation

Bulk deltas via `dev/scripts/generate-align-studio-specs-deltas.mjs` + `fix-align-studio-specs-deltas.mjs`; hand-authored for composition, lifecycle, IPC, electron runtime.

## Docs

Update `dev/docs/studio/merge-main-analysis-2026-06-25.md` Fase 6 when change archives (already partially done).

## Risk

LOW–MEDIUM — mostly documentation; desktop main bundle and graph version paths need smoke test (`pnpm build && pnpm start`).
