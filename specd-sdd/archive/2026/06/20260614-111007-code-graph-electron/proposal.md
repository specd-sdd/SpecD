# Proposal: code-graph-electron

## Motivation

`codegraph` works in CLI and API but fails in `studio-desktop` local mode because Electron loads the native SQLite path under a different runtime ABI. We need a desktop-safe graph package now because the current local desktop architecture routes graph operations directly through Electron main.

## Current behaviour

`apps/specd-studio-desktop/src/main/ipc-handlers.ts` creates a local graph provider in-process and imports the current provider from `packages/code-graph/dist/index.js`. That provider selects the default SQLite backend, and `SQLiteGraphStore` loads `better-sqlite3`, which makes desktop sensitive to Electron's native-module ABI even when CLI and API continue to work.

The current setup is also fragile for contributors because a shared native resolution path can be valid for Node-based CLI and API while still failing only in Electron. The graph evidence confirms that `studio-desktop:src/main/ipc-handlers.ts` is the critical desktop coupling point and a high-impact surface for graph behaviour.

## Proposed solution

Introduce a new workspace package, `@specd/code-graph-electron`, dedicated to Electron desktop usage. `studio-desktop` will depend on this package instead of the standard `@specd/code-graph`, while CLI and API remain on the existing package.

The new package will preserve the existing code-graph API shape and reuse the shared source model, but it will own an Electron-specific native dependency path so desktop no longer relies on the same effective `better-sqlite3` runtime resolution as CLI and API.

`@specd/code-graph-electron` is intended as an internal workspace package for desktop packaging only. It is not meant to be published independently to npm, matching the decision that `studio-desktop` itself will be distributed as an application rather than as a published package.

As part of the same desktop-runtime track, the change may also upgrade `studio-desktop` from its current Electron `36.x` line to a newer supported Electron line if that simplifies the native-module rebuild and packaging strategy. The package split remains the primary solution; the Electron upgrade is a supporting compatibility measure, not the main fix.

## Specs affected

### New specs

- `code-graph-electron:composition`: Defines the Electron-specific composition contract, source-sharing boundary with `code-graph`, and desktop-consumption expectations for the new package.
  - Depends on: `code-graph:composition`, `code-graph:sqlite-graph-store`, `default:_global/architecture`

### Modified specs

- None.

## Impact

Affected areas include `packages/code-graph`, the new `packages/code-graph-electron` workspace, and `apps/specd-studio-desktop/src/main/ipc-handlers.ts` plus desktop build/dependency wiring. External dependency impact is centered on Electron-specific handling of `better-sqlite3` and a possible Electron runtime upgrade for desktop. Package-distribution impact is intentionally internal-only: the new workspace is expected to remain non-public and non-published.

## Technical context

The current desktop local flow is `renderer -> preload bridge -> Electron IPC -> apps/specd-studio-desktop/src/main/ipc-handlers.ts -> createCodeGraphProvider(config)`. Graph exploration confirms that desktop currently imports the provider from `packages/code-graph/dist/index.js`, and the package spec for `code-graph:composition` defines SQLite as the default backend. `code-graph:sqlite-graph-store` confirms that the SQLite adapter owns the native persistence layer and imports `better-sqlite3`.

Several alternatives were explored and rejected as the primary direction:

- Rebuilding one shared native module path for all runtimes is too fragile for contributors using different local Node versions.
- Moving graph work to a separately launched helper was rejected for now because it either keeps the Electron ABI problem or introduces a second packaged runtime.
- A manual fork of `packages/code-graph` was rejected because it would create unnecessary drift.

The agreed direction is to create a dedicated Electron-facing package that keeps the API and shared source shape but isolates the native runtime path used by desktop.

The current `studio-desktop` package declares Electron `^36.4.0`. This change may move desktop to a newer supported Electron line, but the proposal does not treat “latest” as a standing requirement because that target is time-sensitive and could shift while the change is in flight.

## Open questions

None at proposal stage. The exact build and packaging mechanics for reusing `packages/code-graph/src` without forking code are deferred to `design.md` within the already agreed package direction.
