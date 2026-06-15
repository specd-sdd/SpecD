# Spec Compliance Audit

- Mode: `--change code-graph-electron`
- Change: `code-graph-electron`
- Timestamp: `20260615-084037`
- Scope:
  - `code-graph-electron:composition`
  - dependency context reviewed: `code-graph:composition`, `code-graph:sqlite-graph-store`, `default:_global/architecture`

## Summary

- Specs audited: `1`
- Requirements reviewed: `6`
- Verification scenarios cross-checked: `8`
- Compliance findings: `0`
- Test coverage gaps found: `0`
- Drift findings: `0`

## Findings

No compliance findings were identified for `code-graph-electron:composition`.

## Evidence Reviewed

### Package and runtime isolation

- `packages/code-graph-electron/package.json`
  - package is marked `private: true`
  - package exports only the internal Electron build surface
  - Electron-specific rebuild is scoped to `rebuild:vendored-sqlite-electron`
- `packages/code-graph-electron/src/index.ts`
  - re-exports the shared code-graph source surface
  - exposes vendored runtime path exports for Electron
- `packages/code-graph-electron/tsup.config.ts`
  - rewrites SQLiteGraphStore imports from `better-sqlite3` to the vendored runtime wrapper
- `packages/code-graph-electron/src/runtime/vendored-better-sqlite3.ts`
  - resolves SQLite from `vendor/better-sqlite3`
  - exposes `vendoredSqliteBinaryPath`

### Desktop wiring

- `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
  - imports `createCodeGraphProvider` from `@specd/code-graph-electron`
  - does not use the old direct `packages/code-graph/dist/index.js` import path
- `apps/specd-studio-desktop/package.json`
  - depends on `@specd/code-graph-electron`
  - rebuild scripts are scoped to the desktop host

### CLI and API boundaries

- `packages/cli/package.json`
  - remains on `@specd/code-graph`
- `packages/api/package.json`
  - remains on `@specd/code-graph`
- `packages/api/src/composition/create-api-context.ts`
  - imports graph composition from `@specd/code-graph`
- `packages/cli/src/commands/graph/with-provider.ts`
  - imports graph composition from `@specd/code-graph`

### Tests and runtime verification

- `packages/code-graph-electron/test/composition/code-graph-electron.spec.ts`
  - confirms internal-only package role and shared top-level surface
- `packages/code-graph-electron/test/runtime/vendored-sqlite.spec.ts`
  - confirms separate vendored sqlite tree and built runtime exports
- `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts`
  - confirms desktop imports `@specd/code-graph-electron`
- `apps/specd-studio-desktop/test/desktop-graph-runtime.spec.ts`
  - confirms desktop-only dependency/rebuild wiring and that CLI/API remain on the standard package
- `dev/scripts/electron-graph-smoke.mjs`
  - verified under Electron runtime
  - resolved `vendoredSqliteBinaryPath` to `packages/code-graph-electron/vendor/better-sqlite3/build/Release/better_sqlite3.node`

## Scenario Compliance Notes

### Requirement: Electron-specific graph package

- Pass: desktop local graph wiring imports `@specd/code-graph-electron`
- Pass: CLI and API continue to import `@specd/code-graph`

### Requirement: Shared provider contract

- Pass: desktop continues to compile against `createCodeGraphProvider(...)` and shared graph types
- Pass: no desktop-only graph API fork was introduced

### Requirement: Isolated native runtime path

- Pass: Electron smoke resolved SQLite through the vendored binary path owned by `@specd/code-graph-electron`
- Pass: CLI/API remain on the standard package path and were not retargeted to Electron

### Requirement: Shared source model without behavioural fork

- Pass: package reuses the shared `code-graph` source model and limits divergence to runtime packaging/wiring
- Pass: graph stats and search remained operational after Electron smoke verification

### Requirement: Internal-only distribution role

- Pass: package metadata marks the workspace as private and internal-only

### Requirement: Desktop runtime compatibility track

- Pass: rebuild logic derives Electron compatibility from the desktop host without imposing that runtime on CLI/API

## Commands Executed

```text
node packages/cli/dist/index.js graph stats --format text
pnpm --filter @specd/code-graph-electron rebuild:vendored-sqlite-electron
pnpm --filter @specd/code-graph-electron test
pnpm --filter @specd/studio-desktop test -- --runInBand test/desktop-graph-runtime.spec.ts test/ipc-graph-provider.spec.ts
pnpm --filter @specd/studio-desktop typecheck
pnpm --filter @specd/studio-desktop build
ELECTRON_RUN_AS_NODE=1 <electron-binary> dev/scripts/electron-graph-smoke.mjs
node packages/cli/dist/index.js graph stats --format text
```

## Conclusion

`code-graph-electron:composition` is compliant with the implemented runtime split. The package remains internal, desktop wiring is correctly redirected, CLI/API boundaries are preserved, and Electron resolves SQLite through the vendored native path without forcing the same runtime target onto Node consumers.
