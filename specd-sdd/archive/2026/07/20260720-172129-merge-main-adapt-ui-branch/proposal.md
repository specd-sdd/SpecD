# Proposal: merge-main-adapt-ui-branch

## Motivation

`feat/user-interface` has diverged far from canonical `main`. Continuing Studio/UI work on a stale shared core/graph/SDK base will multiply conflict cost and drift from shipped contracts. We need to merge `main`, preserve both branches’ behaviour, adapt this branch to main’s newer composition seams, replace the Electron graph composition fork with a proper injectable SQLite store adapter in a new package, and align desktop + API graph hosts with the long-lived provider lifecycle.

## Current behaviour

- `main` is merged into this branch; shared packages now include `createSqliteGraphStoreFactory({ loadDatabaseModule })` and SDK nested `SdkContextOptions.kernel` / `graph` options.
- Desktop local graph wiring still imports `@specd/code-graph-electron` (composition fork + vendored sqlite), which we will stop consuming without deleting the package.
- Desktop and API still open/close graph providers per IPC/HTTP call (short-lived), despite `code-graph:composition` naming HTTP APIs and Electron as long-lived hosts.
- Workspace `@specd/code-graph-sqlite-electron` is registered in `specd.yaml` as a scaffold; factory/runtime implementation is pending this change.

## Proposed solution

1. Merge `main` into `feat/user-interface` (main is canonical for shared packages).
2. Resolve conflicts without dropping Studio/UI contracts from this branch or graph/SDK/composition contracts from `main`.
3. Post-merge, inventory new/changed specs and APIs from `main`; register the specs this change must adapt; write deltas/artifacts so both sides’ requirements remain enforceable.
4. Introduce a **new** workspace package (`@specd/code-graph-sqlite-electron`) that:
   - owns Electron-targeted vendored/rebuild SQLite runtime assets
   - exports a `sqlite-electron` `GraphStoreFactory` built with `createSqliteGraphStoreFactory({ loadDatabaseModule })`
   - does **not** re-export code-graph composition
5. Wire `studio-desktop` through SDK host `graph` options (`graphStoreId: 'sqlite-electron'` + additive factories), moving off the composition-fork import path.
6. Adopt **long-lived** graph providers for desktop IPC and API HTTP hosts (open once, reuse, reopen on `GraphProviderStaleError`, close on teardown/project switch). Keep `withOpenGraphProvider` for CLI/one-shot paths; after `runIndexProjectGraph`, hosts refresh their long-lived provider.
7. Leave `@specd/code-graph-electron` in the repo unused for this path (no delete, no mash).

## Specs affected

### New specs

- `code-graph-sqlite-electron:sqlite-electron-store`: Electron-targeted SQLite graph-store factory (`sqlite-electron`) over vendored better-sqlite3 via `createSqliteGraphStoreFactory({ loadDatabaseModule })`; no composition fork.
  - Depends on: `code-graph:composition`, `code-graph:sqlite-graph-store`

### Modified specs

- `studio-desktop:main-kernel-lifecycle`: Desktop switches to `@specd/code-graph-sqlite-electron` + SDK `graph` options; owns a long-lived open provider per project session.
  - Depends on (added): `code-graph-sqlite-electron:sqlite-electron-store`, `code-graph:composition`
- `studio-desktop:ipc-handler-registry`: Local graph IPC reuses the long-lived host provider (not per-call open/close / not `withOpenGraphProvider` for routine IPC).
  - Depends on (added): `code-graph-sqlite-electron:sqlite-electron-store`, `code-graph:composition`
- `api:composition-create-api-server`: Nested kernel log options; process owns long-lived opened graph provider closed on `ApiServer.close()`.
  - Depends on (added): `code-graph:composition`
- `api:composition-create-api-context`: Expose `getGraphProvider` (peek) and `withGraphProvider` (healthy long-lived accessor) for the process-scoped opened provider.
  - Depends on (added): `code-graph:composition`
- `api:composition-graph-provider`: Centralize long-lived ownership, stale reopen via healthy accessor, and post-index refresh.
  - Depends on (added): `sdk:host-context`, `code-graph:composition`
- `api:handler-graph`: Graph read routes use `withGraphProvider()` on the long-lived host; no per-request open/close.
  - Depends on (added): `api:composition-graph-provider`, `code-graph:composition`

Out of scope: modifying `sdk:run-index-project-graph` / `withOpenGraphProvider` contracts (CLI short-lived path stays); Ladybug Electron; deleting `code-graph-electron`; putting `code-graph:composition` itself in change scope (consume as dependency only).

## Impact

- Git merge of `main` (already landed).
- New `@specd/code-graph-sqlite-electron` package + desktop dependency/script/tsup retarget.
- Desktop and API graph lifecycle move to long-lived providers.
- `@specd/code-graph-electron` left unused for the new path.

## Technical context

- **Long-lived model** (docs/sdk + `code-graph:composition`): create → `open()` → reuse → reopen on `GraphProviderStaleError` → `close()` on shutdown/replace.
- **Short-lived** (`withOpenGraphProvider`): remains for CLI and internal use by `runIndexProjectGraph`; long-lived hosts refresh afterward.
- **Long-lived accessors (API/desktop):** `getGraphProvider` returns the held opened provider (peek). `withGraphProvider` / `withHealthyGraphProvider` runs work against that same provider and reopens once on `GraphProviderStaleError`. This is **not** the SDK short-lived `withOpenGraphProvider` open/close path.
- **Desktop backend:** `sqlite-electron` via new package. **API backend:** default Node `sqlite` (no sqlite-electron dependency).
- **Factory seam:** `createSqliteGraphStoreFactory({ loadDatabaseModule })`; deferred native load until `open()`.
- **Post-verify follow-up:** clarify accessor split in API specs; update stale desktop tests still asserting `@specd/code-graph-electron` / short-lived `openGraphProviders`.

## Open questions

Resolved:

1. Final package/workspace name — `@specd/code-graph-sqlite-electron`.
2. Desktop + API are long-lived hosts (not per-call `withOpenGraphProvider`).
3. `code-graph-electron` stays unused/undeleted.
4. Avoid scoping `code-graph:composition` / `sqlite-graph-store` into this change to reduce overlap with `deprecate-ladybug-store`.
