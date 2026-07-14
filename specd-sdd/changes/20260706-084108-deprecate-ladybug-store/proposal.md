# Proposal: deprecate-ladybug-store

## Motivation

The Ladybug graph store backend requires a native DuckDB environment, which has introduced process lifecycle issues (native threads preventing clean Node.js process exit, requiring forced `process.exit(0)` inside CLI graph commands) and redundant wrapper architecture (`withOpenGraphProvider` in the SDK and `withProvider` in the CLI). Since `sqlite` is now the default and only active built-in store, Ladybug can be extracted out of the main monorepo as an external extension, allowing us to remove these lifecycle wrapper workarounds and simplify the core codebase.

## Current behaviour

Currently, `@specd/code-graph` supports two built-in storage engines: `sqlite` (default) and `ladybug`. To prevent Ladybug's native background threads from keeping the process alive indefinitely, the CLI uses the `withProvider` wrapper, which traps `SIGINT`/`SIGTERM` and calls `process.exit(0)` on success. The SDK similarly uses `withOpenGraphProvider` to manage provider open/close callbacks. This introduces callback nesting and native process exit workarounds that are unnecessary for a pure SQLite backend.

## Proposed solution

We will:

1. Extract the Ladybug graph store backend out of this repository, removing its native code, tests, and built-in registration from the monorepo. The code will be relocated to a separate repository at `../specd-ladybug-graph-store` (GitHub: `https://github.com/specd-sdd/specd-ladybug-graph-store`).
2. Retain Pluggability in `@specd/code-graph`: The factory function `createCodeGraphProvider` already supports custom external store registration via `graphStoreFactories` in its options. We will remove `ladybug` from the built-in list (`BUILTIN_GRAPH_STORE_FACTORIES`) so it becomes a purely external engine.
3. Pluggability Verification: We will add/maintain integration tests in `@specd/code-graph` that register a mock external graph-store factory and verify its initialization, queries, and disposal, confirming the pluggability contract works.
4. Support Configuration: Introduce configuration options in `specd.yaml` so users can select and declare custom graph stores:
   - Add `graph.store?: SpecdAdapterBinding` in `SpecdConfig.graph` to allow selecting the store backend using the same adapter binding structure as other subsystems. If `graph.store` or `graph.store.adapter` is omitted, the system defaults to using the `'sqlite'` store backend.
   - Add `plugins.graphStores?: readonly SpecdPluginDeclaration[]` in `SpecdConfig` to allow declaring external graph store plugins in `specd.yaml`.
5. Support Graph Store Plugins: Update the plugin system in `@specd/plugin-manager` to support the `'graph-store'` plugin type:
   - Add `'graph-store'` to the `PLUGIN_TYPES` array.
   - Define a `GraphStorePlugin` interface extending `SpecdPlugin` that exposes `readonly storeId: string` and `getGraphStoreFactory(): { create(options: { storagePath: string }): any }`.
6. SDK Context and Plugin Propagation: Update `createSdkContext` and `openSpecdHost` in `@specd/sdk` to:
   - Accept `graphOptions?: CodeGraphFactoryOptions`.
   - Load any declared `plugins.graphStores` via the `PluginLoader`.
   - Extract the factories and `storeId` mappings from loaded `GraphStorePlugin` instances.
   - Forward the loaded factories and the configured `graph.store.adapter` directly to `createCodeGraphProvider(config, graphOptions)`.
7. Implement `Symbol.asyncDispose` (Explicit Resource Management) in `CodeGraphProvider`, the abstract `GraphStore`, and `SQLiteGraphStore` to allow standard, block-scoped lifecycle management via the `await using` statement.
8. Refactor SDK orchestrators (`buildProjectStatusSnapshot`, `runIndexProjectGraph`) and CLI graph commands (`stats`, `search`, `impact`, `hotspots`) to use `await using` directly, thereby eliminating the `withOpenGraphProvider` and `withProvider` wrapper functions.
9. Define Host Shutdown Contracts: Specify explicit lifecycle rules for how hosts must close down to ensure compatibility with external native plugins:
   - **Short-lived hosts (CLI)**: Command handlers must execute query logic inside an `await using` block and explicitly invoke `process.exit(0)` on success or `process.exit(1)` on error to guarantee clean process termination, even if external plugins leave active background threads in the pool.
   - **Long-lived hosts (MCP, Daemons, APIs)**: Must capture termination signals (`SIGINT`, `SIGTERM`), trigger async disposal on all active providers/kernels, and explicitly call `process.exit(0)` to force-terminate any native worker threads during daemon shutdown.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:ladybug-graph-store`: Deprecated and removed from the monorepo's built-in stores.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: Remove `ladybug` from the built-in registry and specify `Symbol.asyncDispose` support on `CodeGraphProvider`.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:with-open-graph-provider`: Deprecated and removed completely.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:composition`: Remove `withOpenGraphProvider` from exports and composition rules.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-cli-context`: Remove `withProvider` and `withOpenGraphProvider` references, updating to use `await using`.
  - Depends on (added): none
  - Depends on (removed): `sdk:with-open-graph-provider`
- `sdk:build-project-status-snapshot`: Update to use `await using` instead of `withOpenGraphProvider`.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:run-index-project-graph`: Update to use `await using` instead of `withOpenGraphProvider`.
  - Depends on (added): none
  - Depends on (removed): `sdk:with-open-graph-provider`
- `cli:graph-stats`: Update to use `await using` directly and implement the explicit exit contract.
  - Depends on (added): none
  - Depends on (removed): `sdk:with-open-graph-provider`
- `cli:graph-impact`: Update to use `await using` directly and implement the explicit exit contract.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-hotspots`: Update to use `await using` directly and implement the explicit exit contract.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-search`: Update to use `await using` directly and implement the explicit exit contract.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: Clean up Ladybug references in verify scenarios.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:specd-plugin-type`: Add `'graph-store'` to `PLUGIN_TYPES` and define the `GraphStorePlugin` interface.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: Add `graph.store` and `plugins.graphStores` properties to the `specd.yaml` configuration schema.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`code-graph` package**: Removal of `LadybugGraphStore` implementation, deletion of `packages/code-graph/src/infrastructure/ladybug/`, and deletion of corresponding test files. Addition of `Symbol.asyncDispose` to `CodeGraphProvider`, `GraphStore`, and `SQLiteGraphStore`.
- **`sdk` package**: Removal of `with-open-graph-provider.ts` and its tests. Refactoring `buildProjectStatusSnapshot` and `runIndexProjectGraph` to use `await using`. Update `createSdkContext` and `openSpecdHost` to load `plugins.graphStores`, extract factories/IDs, and forward them to `createCodeGraphProvider`.
- **`cli` package**: Deletion of `with-provider.ts` and its tests. Refactoring of the four graph commands to use `await using` directly and perform explicit process exit.
- **`plugin-manager` package**: Addition of the `'graph-store'` plugin type and the `GraphStorePlugin` contract.
- **`core` package**: Update configuration schema and validation for `specd.yaml` to parse `graph.store` and `plugins.graphStores`.
- **TypeScript requirements**: The target configuration `lib` will be updated to include `"ESNext.Disposable"` to support `Symbol.asyncDispose`.

## Technical context

- **Destination Repository**: The extracted Ladybug backend code will reside at `../specd-ladybug-graph-store` (`https://github.com/specd-sdd/specd-ladybug-graph-store`).
- **Pluggability Verification**: To verify that external store registration works correctly, we will add an integration test in the core/code-graph codebase that registers a dummy/mock external store factory and verifies it is resolved and loaded correctly.
- **Explicit Resource Management (ERM)**: Since TS 5.2+ and Node.js v18.18+/v20+ are used, we can leverage ES-native `await using` instead of custom callback-based lifecycle wrappers.
- **Environment Compatibility**: The current workspace environment runs Node.js `v25.9.0` and TypeScript `^5.9.3`. Both support ERM natively out of the box. No software updates to Node.js or TypeScript are required.
- **Configuration Adjustments**: The compiler options in `tsconfig.base.json` will be updated by adding `"ESNext.Disposable"` to `"lib"` so that the TypeScript compiler recognizes ERM types natively.
- **Idempotency Guard**: `[Symbol.asyncDispose]()` calls `this.close()`, which is already idempotent in `SQLiteGraphStore` (`if (this.db === undefined) return`).
- **Signal Handling and Exits**: Handled strictly at the host level. The CLI command handlers will wrap provider usage in `await using` try-catch blocks and end with `process.exit(0)` (success) or `process.exit(1)` (error).

## Usage examples

### Standalone (deps signature — no specd.yaml required)

```typescript
import { createCodeGraphProvider, createSQLiteGraphStore } from '@specd/code-graph'
import { createLadybugGraphStore } from 'specd-ladybug-graph-store'

// SQLite (built-in)
const sqliteStore = createSQLiteGraphStore({ storagePath: '/path/to/.specd' })
await using provider = createCodeGraphProvider({ store: sqliteStore })
await provider.open()
const stats = await provider.getStatistics()

// Ladybug (external)
const ladybugStore = createLadybugGraphStore({ storagePath: '/path/to/.specd' })
await using provider = createCodeGraphProvider({ store: ladybugStore })
await provider.open()
```

### Config-based (config signature — reads specd.yaml)

```typescript
import { createCodeGraphProvider } from '@specd/code-graph'
import { LadybugStoreFactory } from 'specd-ladybug-graph-store'

// SQLite is the default — no graphStoreFactories needed
await using provider = createCodeGraphProvider(config)
await provider.open()

// Ladybug — pass the external factory; adapter is selected via config.graph.store.adapter
await using provider = createCodeGraphProvider(config, {
  graphStoreFactories: { ladybug: LadybugStoreFactory },
})
await provider.open()
```

`specd.yaml` for the Ladybug case:

```yaml
graph:
  store:
    adapter: ladybug
  excludePaths:
    - '**/dist/**'

plugins:
  graphStores:
    - name: specd-ladybug-graph-store
```

### Via the SDK (plugin-aware bootstrap)

When using the SDK, graph store plugins declared in `specd.yaml` are loaded automatically.
The host does not need to import or register the external factory manually:

```typescript
import { openSpecdHost } from '@specd/sdk'

// SDK loads plugins.graphStores from specd.yaml, extracts their factories,
// and forwards them to createCodeGraphProvider internally.
const { createGraphProvider } = await openSpecdHost()
await using provider = createGraphProvider()
await provider.open()
const stats = await provider.getStatistics()
```

If the host needs to supply extra graph options explicitly (e.g. in a custom CLI without specd.yaml plugins):

```typescript
import { openSpecdHost } from '@specd/sdk'
import { LadybugStoreFactory } from 'specd-ladybug-graph-store'

const { createGraphProvider } = await openSpecdHost({
  graphOptions: {
    graphStoreFactories: { ladybug: LadybugStoreFactory },
  },
})
await using provider = createGraphProvider()
await provider.open()
```

## Open questions

- **Plugin contract scope:** Should this change include the full plugin contract (`GraphStorePlugin` interface, `'graph-store'` in `PLUGIN_TYPES`, `plugins.graphStores` in `specd.yaml`, and SDK plugin-loading logic), or should the plugin infrastructure be deferred to a separate change? Including it now enables full end-to-end pluggability but increases the scope significantly. Deferring it means this change only ships ERM + Ladybug extraction + SQLite-only built-in, with the plugin mechanism following separately.
