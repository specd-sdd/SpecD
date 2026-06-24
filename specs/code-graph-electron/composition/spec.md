# Composition

## Purpose

`studio-desktop` needs local code-graph access without sharing the same native SQLite runtime path used by CLI and API. This spec defines the Electron-specific composition contract for `@specd/code-graph-electron`: what surface it must provide, how it relates to `@specd/code-graph`, and what boundaries it must preserve for desktop-only usage.

## Requirements

### Requirement: Electron-specific graph package

The system SHALL provide a dedicated workspace package named `@specd/code-graph-electron` for Electron desktop usage.

This package MUST exist as a separate workspace from `@specd/code-graph`, and `studio-desktop` MUST consume it for local graph operations instead of importing the standard `@specd/code-graph` build output directly.

CLI and API consumers MUST remain on `@specd/code-graph` unless they explicitly opt into a different runtime-specific package.

### Requirement: Shared provider contract

`@specd/code-graph-electron` SHALL expose the same top-level provider contract expected by desktop graph consumers.

At minimum, the package MUST provide:

- a `createCodeGraphProvider(...)` factory compatible with desktop local composition
- the provider and option types required by desktop graph wiring
- the graph constants and types that desktop imports from the current code-graph composition surface

Desktop local graph callers MUST NOT need a desktop-only API fork to use the package.

### Requirement: Isolated native runtime path

`@specd/code-graph-electron` SHALL isolate the native SQLite runtime path used by Electron from the runtime path used by `@specd/code-graph` in CLI and API.

The desktop package MUST ensure that when Electron loads the local graph provider, the effective native-module resolution path for SQLite-backed graph storage is owned by the Electron-specific package rather than by the standard `@specd/code-graph` package.

This isolation MUST allow desktop packaging and rebuild workflows to target Electron's supported runtime line without changing the native runtime expectations of CLI or API.

### Requirement: Locally generated vendored sqlite tree

`@specd/code-graph-electron` SHALL treat `vendor/better-sqlite3/` as a locally
generated runtime artifact rather than a git-tracked package tree.

The package MUST:

- ignore `packages/code-graph-electron/vendor/` from version control
- populate the vendored tree through its owned sync script before build or rebuild
  workflows need it
- preserve the physically separate module root required for Electron runtime
  isolation from the standard `@specd/code-graph` sqlite path

The repository MUST NOT depend on committed copies of vendored sqlite sources or
platform-specific `better_sqlite3.node` binaries to satisfy desktop graph runtime
behaviour.

### Requirement: Platform-aware vendored sqlite rebuild cache

The Electron-specific sqlite rebuild flow owned by `@specd/code-graph-electron` SHALL
use rebuild cache metadata that is portable across machines.

Rebuild cache metadata MUST record at least:

- the target Electron version used by `studio-desktop`
- the host `platform`
- the host `arch`

The rebuild flow MUST skip recompilation when the vendored
`build/Release/better_sqlite3.node` already exists and the cache metadata matches
the current Electron version, platform, and architecture.

Rebuild cache metadata MUST NOT rely on machine-specific absolute filesystem paths as
the primary cache key.

### Requirement: Shared source model without behavioural fork

`@specd/code-graph-electron` SHALL reuse the shared code-graph source model instead of introducing an independent behavioural fork.

The package MUST preserve the same graph semantics as `@specd/code-graph` for:

- backend selection and provider lifecycle
- graph indexing and search behaviour
- graph traversal, impact, hotspots, and stats operations
- SQLite-backed graph-store behaviour as observed by desktop consumers

Desktop-specific composition MAY differ in packaging, dependency resolution, or runtime-targeted native rebuilds, but it MUST NOT intentionally diverge from the functional graph behaviour defined by the shared code-graph specs.

### Requirement: Internal-only distribution role

`@specd/code-graph-electron` SHALL be treated as an internal workspace package for desktop application packaging.

The package MUST NOT be designed as a separately published public npm package by default. Its primary distribution role is to support the packaged `studio-desktop` application and desktop development workflows inside the monorepo.

### Requirement: Desktop runtime compatibility track

The desktop graph composition SHALL support alignment with a newer supported Electron runtime line when required for native module compatibility.

If `studio-desktop` upgrades its Electron major line as part of adopting `@specd/code-graph-electron`, the package contract MUST continue to keep that compatibility decision scoped to desktop runtime packaging and MUST NOT impose the same runtime target on CLI or API.

## Constraints

- `@specd/code-graph-electron` is a desktop-facing composition package, not a second public graph product
- The package must preserve the shared graph API shape used by desktop consumers
- Native-runtime isolation is mandatory; cosmetic package renaming without effective runtime-path separation does not satisfy this spec
- Behavioural drift from `@specd/code-graph` is not allowed unless a future spec explicitly permits it

## Spec Dependencies

- [`code-graph:composition`](../../../specs/code-graph/composition/spec.md) — shared provider surface and composition expectations that the Electron package must preserve
- [`code-graph:sqlite-graph-store`](../../../specs/code-graph/sqlite-graph-store/spec.md) — SQLite-backed graph behaviour whose native runtime path must be isolated for Electron
- [`default:_global/architecture`](../../../specs/_global/architecture/spec.md) — package-layering and composition constraints for runtime-specific wiring
