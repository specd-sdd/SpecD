# Composition

## Purpose

Consumers of `@specd/code-graph` should not need to know how the store, indexer, adapters, and traversal functions are wired together. The composition layer provides a single facade and factory function that assembles all internal components, manages lifecycle, and defines the package's public API surface.

## Requirements

### Requirement: CodeGraphProvider facade

`CodeGraphProvider` SHALL be the top-level API object that wraps all code graph functionality. It exposes:

- **Indexing**: `index(options: IndexOptions): Promise<IndexResult>` — runs `IndexCodeGraph`
- **Querying**: `getSymbol(id)`, `findSymbols(query)`, `getFile(path)`, `getSpec(specId)`, `getSpecDependencies(specId)`, `getSpecDependents(specId)`, `getStatistics()` — delegates to `GraphStore`
- **Search**: `searchSymbols(options: SearchOptions)`, `searchSpecs(options: SearchOptions)` — full-text search with BM25 ranking and store-level filtering, delegates to `GraphStore`
- **Maintenance**: `clear(): Promise<void>` — removes all data from the store (for full re-index)
- **Traversal**: `getUpstream(symbolId, options?)`, `getDownstream(symbolId, options?)` — delegates to traversal functions
- **Impact**: `analyzeImpact(target, direction)`, `analyzeFileImpact(filePath, direction)`, `detectChanges(changedFiles)` — delegates to impact functions
- **Lifecycle**: `open(): Promise<void>`, `close(): Promise<void>` — manages the store connection

`CodeGraphProvider` is a thin orchestration layer — it holds no domain logic. All methods delegate to the appropriate domain service or use case.

### Requirement: Factory function

Two factory signatures are provided:

**Primary (workspace-aware):**

`createCodeGraphProvider(config: SpecdConfig, options?: CodeGraphFactoryOptions): CodeGraphProvider` accepts a `SpecdConfig` from `@specd/core` plus optional internal composition overrides and:

1. Derives the graph storage root from `config.configPath`
2. Resolves the active graph-store backend id using `options.graphStoreId` when provided, otherwise the built-in default backend id
3. Builds a merged graph-store registry from the built-in backends plus any additive `options.graphStoreFactories`
4. Creates the selected concrete `GraphStore` from that registry using the derived storage root
5. Creates `AdapterRegistry` and registers the built-in adapters (TypeScript, Python, Go, PHP)
6. Registers any additive language adapters from `options.adapters`
7. Creates `IndexCodeGraph` with the selected store and adapter registry
8. Returns a `CodeGraphProvider` wired to all components

**Legacy (standalone):**

`createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider` accepts:

- **`storagePath`** (`string`, required) — filesystem root allocated to the selected concrete graph-store backend
- **`graphStoreId`** (`string`, optional) — selected backend id; when omitted, uses the built-in default backend id
- **`graphStoreFactories`** (optional additive registrations) — external graph-store factories merged with the built-in graph-store registry before backend selection
- **`adapters`** (`LanguageAdapter[]`, optional) — additional language adapters to register beyond the 4 built-in adapters

`CodeGraphFactoryOptions` SHALL support the same additive graph-store selection model as `CodeGraphOptions`, except that the storage root is derived from `SpecdConfig`.

The factory detects which overload is being used by checking for the `projectRoot` property (present on `SpecdConfig`) vs the `storagePath` property (present on `CodeGraphOptions`).

The built-in graph-store registry SHALL include at least:

- `ladybug` — the Ladybug-backed implementation
- `sqlite` — the SQLite-backed implementation

The built-in default graph-store id SHALL be `sqlite`. `ladybug` remains available only by explicit selection.

Callers MUST NOT construct `CodeGraphProvider` directly — the constructor is not part of the public API.

### Requirement: Package exports

The `@specd/code-graph` package SHALL export only:

- `createCodeGraphProvider` — factory function
- `CodeGraphProvider` — type only (for type annotations, not construction)
- `CodeGraphOptions` — options type for the legacy factory overload
- `CodeGraphFactoryOptions` — options type for the `SpecdConfig` overload, including additive graph-store registrations and optional `graphStoreId`
- `GraphStoreFactory` — factory contract used by additive graph-store registrations
- `IndexOptions`, `IndexResult`, `WorkspaceIndexTarget`, `WorkspaceIndexBreakdown`, `DiscoveredSpec` — indexer types. `IndexOptions` includes `workspaces` (required array of `WorkspaceIndexTarget`), `projectRoot` (required), `onProgress` (optional callback), and `chunkBytes` (optional chunk size budget, default 20 MB).
- `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult` — traversal/impact types
- `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType` — model types
- `SymbolQuery`, `GraphStatistics` — query types
- `LanguageAdapter` — interface for custom adapters
- `CodeGraphError` and subclasses — error types

Internal components (`LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, built-in language adapters, `IndexCodeGraph`, traversal functions) MUST NOT be exported from the package entry point.

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, and `close()` when done. The `CodeGraphProvider` delegates these calls to the underlying `GraphStore`. Methods called before `open()` or after `close()` throw `StoreNotOpenError`.

The provider does not auto-open or auto-close — callers manage the lifecycle explicitly. This follows the same pattern as database connections and avoids hidden state transitions.

### Requirement: Dependency on @specd/core

`@specd/code-graph` depends on `@specd/core` as a runtime dependency. It uses types (`SpecdConfig`, `SpecdWorkspaceConfig`) and may use domain services (e.g. `parseMetadata`, `SpecRepository`) for spec resolution. The primary factory function accepts `SpecdConfig` to derive `storagePath` only — the provider is stateless and does not cache the config. Workspace targets and spec sources are built by the caller and passed via `IndexOptions` at each `index()` call.

## Constraints

- `createCodeGraphProvider` is the only construction path — `CodeGraphProvider` constructor is not exported
- Internal components are not re-exported from the package
- The `LanguageAdapter` interface is exported so consumers can write custom adapters
- Graph-store backend selection is registry-driven and internal to composition; it is not a `specd.yaml` setting
- The provider builds exactly one active `GraphStore` per construction path, selected by backend id from the merged graph-store registry
- `CodeGraphProvider` holds no domain logic — it only delegates
- Lifecycle is explicit — no auto-open, no auto-close
- Depends on `@specd/core` for `SpecdConfig` type

## Examples

```typescript
import { createCodeGraphProvider, SymbolKind } from '@specd/code-graph'

// Primary usage — with SpecdConfig
const provider = createCodeGraphProvider(config)
await provider.open()

// Index all workspaces
const result = await provider.index({
  workspaces: [
    { name: 'core', codeRoot: '/project/packages/core', specs: async () => [...] },
    { name: 'cli', codeRoot: '/project/packages/cli', specs: async () => [...] },
  ],
  projectRoot: '/project',
})
console.log(`Indexed ${result.filesIndexed} files in ${result.duration}ms`)

// Legacy usage — with CodeGraphOptions
const legacyProvider = createCodeGraphProvider({ storagePath: '/my/project' })

// Query symbols (workspace-qualified paths)
const symbols = await provider.findSymbols({ kind: SymbolKind.Function, name: 'create*' })
// symbols[0].filePath === 'core:src/domain/entities/change.ts'

await provider.close()
```

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — model types exported from package
- [`code-graph:graph-store`](../graph-store/spec.md) — abstract graph-store contract and backend-neutral query semantics
- [`code-graph:ladybug-graph-store`](../ladybug-graph-store/spec.md) — Ladybug backend available by explicit backend id selection
- [`code-graph:sqlite-graph-store`](../sqlite-graph-store/spec.md) — SQLite backend used by the built-in default composition path
- [`code-graph:language-adapter`](../language-adapter/spec.md) — `LanguageAdapter` (exported), `AdapterRegistry` (internal)
- [`code-graph:indexer`](../indexer/spec.md) — `IndexCodeGraph` (internal), `IndexResult` (exported)
- [`code-graph:traversal`](../traversal/spec.md) — traversal/impact types (exported), functions (internal)
- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition layer pattern
