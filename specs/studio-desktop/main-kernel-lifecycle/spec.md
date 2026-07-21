# Main Kernel Lifecycle

## Purpose

Electron desktop host concern — **Main Kernel Lifecycle**. Local mode bootstraps an SDK host context (`createSdkContext`) in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. The main process owns one SDK host context per locally opened project.

## Requirements

### Requirement: one kernel per open local project

Opening a project directory MUST construct exactly one SDK host context (kernel + `createGraphProvider` from `createSdkContext`) for that `specd.yaml` root until the project is closed or switched.

### Requirement: project switch tears down kernel and graph state

Switching projects MUST dispose the previous SDK host context and any desktop graph provider state before creating a new one to avoid cross-project leakage.

### Requirement: desktop startup prepares the Electron SQLite graph runtime

The desktop host MUST prepare its Electron-native SQLite graph runtime before the
app starts local graph work.

The desktop package MUST:

- depend on `@specd/code-graph-sqlite-electron` for the Electron-vendored SQLite
  graph-store factory used by desktop-local graph execution
- expose `rebuild:graph-sqlite-electron` for rebuilding the locally generated
  vendored Electron SQLite addon owned by `@specd/code-graph-sqlite-electron`
- expose `rebuild:graph-electron` as an alias of that rebuild
- run the Electron SQLite rebuild from `prestart`

Desktop startup MUST NOT assume that the vendored sqlite tree or its Electron-targeted
native addon are present in git. The first successful desktop start on a fresh clone
MAY require a local native rebuild when the generated addon is missing or stale for
the current Electron version, platform, or architecture.

Desktop-local graph MUST follow the long-lived host model from `code-graph:composition`:
construct the process/project SDK host with `graphStoreId: 'sqlite-electron'` and the
additive factory from `@specd/code-graph-sqlite-electron`, create one provider via
`createGraphProvider()`, `await open()`, reuse it while healthy, reopen on
`GraphProviderStaleError`, and `close()` on project switch or host teardown.

Desktop MUST NOT import `@specd/code-graph-electron` for this path. The existing
`@specd/code-graph-electron` package MAY remain in the monorepo unused.

Desktop MUST NOT use `withOpenGraphProvider` for routine local graph IPC (that helper
is the short-lived CLI/one-shot path). Index orchestration MAY still call
`runIndexProjectGraph` (which opens a short-lived provider internally); after index
completes the desktop host MUST replace/reopen its long-lived provider.

This wiring isolates the native SQLite runtime required by the Electron desktop
host without retargeting CLI or API away from the standard non-Electron graph
runtime exposed through `@specd/sdk` and backed by `@specd/code-graph`.

### Requirement: desktop main process launches as Electron

The desktop `start` script MUST clear `ELECTRON_RUN_AS_NODE` before spawning Electron so the main process receives the Electron API (`app`, `BrowserWindow`, `ipcMain`) instead of the npm CLI path export.

When `ELECTRON_RUN_AS_NODE` is set, startup MUST NOT proceed with a broken main process that cannot call `app.whenReady()`.

### Requirement: main process entry is bundled for pnpm and Electron

The Electron main entry MUST be built as a bundled CommonJS artifact at `dist/main/index.cjs`.

The bundle MUST externalise `electron`, `@specd/code-graph-sqlite-electron`, `@specd/sdk`, and
`@specd/client`, relying on workspace `exports.require` surfaces for correct pnpm
resolution under the Electron main process.

`package.json` `main` MUST reference `dist/main/index.cjs`.

### Requirement: desktop kernel configures plain-text logs

`createSdkContext` for the desktop main process MUST receive nested kernel options
`kernel: { logFormatter: createLogFormatter({ colorize: false }) }` (and any
`logRing` when used) so that log readback through local IPC returns plain text
without ANSI escape sequences. Top-level `logFormatter` / `logRing` on
`SdkContextOptions` MUST NOT be used.

## Spec Dependencies

- [`sdk:host-context`](../../sdk/host-context/spec.md) — `createSdkContext` bootstrap for desktop main
- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
- [`code-graph-sqlite-electron:sqlite-electron-store`](../../code-graph-sqlite-electron/sqlite-electron-store/spec.md) — Electron SQLite factory and vendored runtime used for local graph
- [`code-graph:composition`](../../code-graph/composition/spec.md) — long-lived provider lifecycle for Electron hosts
