# SQLite Electron Store

## Purpose

Electron desktop needs a SQLite-backed code-graph store whose native module is rebuilt for Electron’s ABI, without forking `@specd/code-graph` composition or overwriting `@specd/code-graph-electron`. This spec defines the `@specd/code-graph-sqlite-electron` package contract: an additive `sqlite-electron` graph-store factory that injects an Electron-vendored `better-sqlite3` module through `createSqliteGraphStoreFactory({ loadDatabaseModule })`.

## Requirements

### Requirement: Dedicated Electron SQLite store package

The system SHALL provide a dedicated workspace package named `@specd/code-graph-sqlite-electron` for Electron-targeted SQLite graph-store construction.

The package MUST exist as a separate workspace from `@specd/code-graph` and `@specd/code-graph-electron`. It MUST NOT re-export `createCodeGraphProvider` or any full code-graph composition surface.

### Requirement: sqlite-electron GraphStoreFactory

The package SHALL export a factory constructor that returns a `GraphStoreFactory` suitable for additive registration on `CodeGraphCompositionOptions.graphStoreFactories` under the backend id `sqlite-electron`.

The factory MUST be built with `createSqliteGraphStoreFactory` from `@specd/code-graph`, supplying a `loadDatabaseModule` that resolves the package’s Electron-vendored `better-sqlite3` entry.

The factory MUST NOT overwrite or collide with the built-in `sqlite` backend id.

### Requirement: Deferred native module load

`loadDatabaseModule` MUST defer loading the vendored native module until `SQLiteGraphStore.open()`, matching the injectable-loader contract of `code-graph:sqlite-graph-store`.

Factory construction and `createCodeGraphProvider(...)` MUST remain synchronous with respect to native addon loading.

### Requirement: Locally generated vendored sqlite tree

The package SHALL treat `vendor/better-sqlite3/` as a locally generated runtime artifact rather than a git-tracked package tree.

The package MUST:

- ignore `packages/code-graph-sqlite-electron/vendor/` from version control
- populate the vendored tree through an owned sync script before build or rebuild workflows need it
- preserve a physically separate module root from both Node CLI `better-sqlite3` and `@specd/code-graph-electron` vendor paths

### Requirement: Platform-aware Electron rebuild cache

The Electron-specific sqlite rebuild flow owned by this package SHALL use rebuild cache metadata that is portable across machines.

Rebuild cache metadata MUST record at least:

- the target Electron version used by `studio-desktop`
- the host `platform`
- the host `arch`

The rebuild flow MUST skip recompilation when the vendored `build/Release/better_sqlite3.node` already exists and the cache metadata matches the current Electron version, platform, and architecture.

### Requirement: Shared SQLite graph semantics

Graph behaviour observed through a provider that selects `graphStoreId: 'sqlite-electron'` MUST match `SQLiteGraphStore` semantics from `code-graph:sqlite-graph-store` for indexing, search, traversal, impact, hotspots, and stats.

Differences MUST be limited to native-module resolution and packaging for Electron.

### Requirement: Host wiring via SDK graph options

Desktop hosts that need Electron SQLite MUST construct providers through `@specd/sdk` / `createCodeGraphProvider` with:

- `graphStoreId: 'sqlite-electron'`
- `graphStoreFactories: { 'sqlite-electron': <factory from this package> }`

Hosts MUST NOT import `@specd/code-graph-electron` for this path.

### Requirement: Internal-only distribution role

`@specd/code-graph-sqlite-electron` SHALL be an internal workspace package for desktop packaging. It MUST NOT be designed as a separately published public npm package by default.

## Constraints

- MUST NOT re-export or fork `@specd/code-graph` composition
- MUST NOT modify or replace `@specd/code-graph-electron` in this change
- Builtin backend id `sqlite` remains reserved for CLI/API Node runtimes
- Ladybug Electron adapters are out of scope

## Spec Dependencies

- [`code-graph:composition`](../../code-graph/composition/spec.md) — `createSqliteGraphStoreFactory`, additive `graphStoreFactories`, `graphStoreId` selection
- [`code-graph:sqlite-graph-store`](../../code-graph/sqlite-graph-store/spec.md) — injectable `loadDatabaseModule` and SQLite graph semantics
