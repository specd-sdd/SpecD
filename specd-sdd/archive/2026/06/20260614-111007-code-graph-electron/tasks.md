# Tasks: code-graph-electron

## 1. Electron graph package

- [x] 1.1 Scaffold the internal Electron graph workspace
      `packages/code-graph-electron/package.json`: workspace metadata — create the internal-only package with `private: true`, ESM exports, and desktop-scoped scripts
      Approach: add a package boundary dedicated to Electron packaging so desktop stops depending on the standard graph package path while the package remains non-public
      (Req: Electron-specific graph package, Internal-only distribution role)

- [x] 1.2 Add the Electron package build configuration
      `packages/code-graph-electron/tsconfig.json`, `packages/code-graph-electron/tsup.config.ts`: package build surface — compile the Electron package from `packages/code-graph/src` without forking authored graph code
      Approach: use the shared source tree as the single source of truth and emit a separate `dist/` for the Electron package
      (Req: Shared provider contract, Shared source model without behavioural fork)

- [x] 1.3 Add package-level tests for the shared provider surface
      `packages/code-graph-electron/test/composition/code-graph-electron.spec.ts`: export and metadata coverage — verify provider compatibility, internal-only role, and shared-source behaviour expectations
      Approach: assert the Electron package exports the same top-level graph composition surface desktop expects, while keeping metadata internal-only
      (Req: Shared provider contract, Shared source model without behavioural fork, Internal-only distribution role)

## 2. Desktop graph wiring

- [x] 2.1 Retarget desktop graph imports to the Electron package
      `apps/specd-studio-desktop/src/main/ipc-handlers.ts`: `createCodeGraphProvider`, `DEFAULT_EXCLUDE_PATHS` import path — switch desktop local graph composition from `packages/code-graph/dist/index.js` to `@specd/code-graph-electron`
      Approach: keep the existing provider contract and replace only the package boundary so desktop stays on the same graph API shape
      (Req: Electron-specific graph package, Shared provider contract)

- [x] 2.2 Keep CLI and API on the standard package
      `packages/code-graph/package.json`, desktop wiring touchpoints, and any workspace references: package boundary review — ensure no change forces CLI or API to adopt the Electron package path
      Approach: preserve `@specd/code-graph` as the Node-facing default while limiting the new package to desktop consumers
      (Req: Electron-specific graph package, Isolated native runtime path)

- [x] 2.3 Investigate and stop graph-state loss on desktop startup
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`, `apps/specd-studio-desktop/src/main/ipc-handlers.ts`: graph open/recreate lifecycle — inspect startup and graph-operation paths so launching Electron does not wipe or invalidate `.specd/config/graph` unless explicitly requested
      Approach: harden SQLite migration so transient open failures do not delete the DB, and keep destructive graph actions limited to explicit recreate/reindex flows
      (Req: Isolated native runtime path, Shared source model without behavioural fork)

- [x] 2.4 Add desktop tests for package selection and runtime isolation
      `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts`, `apps/specd-studio-desktop/test/desktop-graph-runtime.spec.ts`: desktop-local graph coverage — verify Electron package usage, startup safety, and isolation from CLI/API runtime paths
      Approach: assert import/package routing at the desktop boundary and add smoke-style checks around graph-status persistence and native-path separation
      (Req: Electron-specific graph package, Isolated native runtime path, Desktop runtime compatibility track)

## 3. Documentation and verification

- [x] 3.1 Document the internal desktop graph package
      `docs/studio/packages.md`, `docs/client/connection-profiles.md`: desktop graph documentation — explain that desktop local graph composition uses `@specd/code-graph-electron` as an internal-only package
      Approach: update the existing desktop/local connection documentation instead of introducing separate public-package docs
      (Req: Internal-only distribution role)

- [x] 3.2 Run package and desktop build/typecheck verification
      `packages/code-graph-electron`, `apps/specd-studio-desktop`: build and typecheck commands — confirm the new package builds and desktop still compiles against the shared provider contract
      Approach: run `pnpm --filter @specd/code-graph-electron build`, `pnpm --filter @specd/studio-desktop typecheck`, and `pnpm --filter @specd/studio-desktop build`
      (Req: Shared provider contract, Shared source model without behavioural fork)

## 4. Vendored sqlite follow-up

- [x] 4.1 Vendor a physically separate sqlite package tree for Electron
      `packages/code-graph-electron/vendor/better-sqlite3/`, `packages/code-graph-electron/scripts/sync-vendored-sqlite.mjs`: vendored runtime root — create a copied sqlite package tree under the Electron workspace so runtime resolution no longer collapses back into the shared `.pnpm/better-sqlite3@...` store path
      Approach: sync the canonical `better-sqlite3` package contents into `vendor/better-sqlite3/` and keep the copied tree as the Electron-owned module root
      (Req: Isolated native runtime path, Internal-only distribution role)

- [x] 4.2 Rewrite Electron graph runtime imports to the vendored sqlite entrypoint
      `packages/code-graph-electron/tsup.config.ts`, `packages/code-graph-electron/src/runtime/vendored-better-sqlite3.ts`: build/runtime indirection — make the emitted Electron graph bundle import sqlite through the vendored entrypoint instead of `better-sqlite3` or a logical alias
      Approach: use a build rewrite/plugin that redirects `SQLiteGraphStore` imports to `src/runtime/vendored-better-sqlite3.ts`, and ensure the emitted `dist/index.js` points at the vendored path
      (Req: Isolated native runtime path, Shared source model without behavioural fork)

- [x] 4.3 Rebuild the vendored sqlite addon against Electron
      `packages/code-graph-electron/scripts/rebuild-electron.mjs`, `apps/specd-studio-desktop/package.json`, `pnpm-workspace.yaml`: Electron-native rebuild flow — rebuild the vendored sqlite addon in place for the desktop Electron target without mutating the standard CLI/API addon path
      Approach: run the vendored sync before rebuild, target the Electron version used by `studio-desktop`, and add any workspace build-policy wiring needed so contributors do not rely on ambiguous manual rebuilds
      (Req: Isolated native runtime path, Desktop runtime compatibility track)

- [x] 4.4 Add tests for vendored runtime separation
      `packages/code-graph-electron/test/composition/code-graph-electron.spec.ts`, `packages/code-graph-electron/test/runtime/vendored-sqlite.spec.ts`: package/runtime coverage — verify that the vendored sqlite tree exists, matches the canonical dependency version, and is the path referenced by the Electron build output
      Approach: assert the emitted bundle imports the vendored entrypoint, and add file-system assertions that the vendored package tree and rebuilt addon live under `packages/code-graph-electron/vendor/`
      (Req: Isolated native runtime path, Shared provider contract, Shared source model without behavioural fork)

- [x] 4.5 Re-run Electron runtime smoke verification for graph persistence
      `dev/scripts/electron-graph-smoke.mjs`, `studio-desktop` local runtime, CLI `graph stats`: end-to-end validation — prove desktop graph startup, search, and manual reindex work under the Electron runtime without erasing an existing graph index
      Approach: run the smoke script with the Electron runtime after vendored rebuild, confirm sqlite resolves from the vendored tree, compare `graph stats` before and after launch, and verify force reindex remains an explicit user action
      (Req: Isolated native runtime path, Desktop runtime compatibility track)
