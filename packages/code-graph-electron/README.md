# @specd/code-graph-electron

Internal workspace package for `studio-desktop` local graph operations.

## What It Does

`@specd/code-graph-electron` exposes the same top-level code-graph composition surface as `@specd/code-graph`, but with one critical difference:

- Electron loads SQLite through a vendored `better-sqlite3` tree under `vendor/better-sqlite3`
- CLI and API keep using the standard Node runtime path from `@specd/code-graph`

This package exists only to isolate the native addon runtime path for Electron. It is not a public npm package and it is not meant to be consumed outside this monorepo.

## Why It Exists

`studio-desktop` runs graph operations in Electron main. The standard `@specd/code-graph` package loads `better-sqlite3`, which is fine for CLI/API under Node, but Electron needs its own ABI-compatible native build.

Without this package, the same effective addon path can work for Node and still fail in Electron with an ABI mismatch.

## How It Works

1. `src/index.ts` re-exports the shared code-graph source surface.
2. `tsup.config.ts` rewrites `SQLiteGraphStore` so SQLite resolves through `src/runtime/vendored-better-sqlite3.ts`.
3. That runtime wrapper points at `vendor/better-sqlite3/lib/index.js`.
4. The native addon lives at `vendor/better-sqlite3/build/Release/better_sqlite3.node`.

The package keeps shared graph behavior aligned with `@specd/code-graph`; only packaging and native runtime resolution differ.

## Scripts

- `pnpm --filter @specd/code-graph-electron build`
  - syncs the vendored sqlite tree
  - builds the Electron-specific bundle

- `pnpm --filter @specd/code-graph-electron rebuild:vendored-sqlite-electron`
  - syncs the vendored sqlite tree
  - rebuilds the vendored addon against the Electron version used by `studio-desktop`

- `pnpm --filter @specd/code-graph-electron test`
  - builds the package
  - runs package-level tests without requiring Node to load the vendored Electron addon

## Maintenance Rules

- Do not replace the vendored runtime with a package alias. `pnpm` aliases were proven to collapse back into the shared store path.
- Do not make this package public.
- Keep `@specd/code-graph` as the source of truth for graph behavior.
- If you change vendoring behavior, verify the full sequence:
  1. `pnpm --filter @specd/code-graph-electron rebuild:vendored-sqlite-electron`
  2. `pnpm --filter @specd/code-graph-electron test`
  3. `ELECTRON_RUN_AS_NODE=1 ./node_modules/.pnpm/electron@<version>/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dev/scripts/electron-graph-smoke.mjs`

## Primary Consumer

- `apps/specd-studio-desktop`

If desktop-local graph wiring stops importing this package, the runtime split is no longer in effect.
