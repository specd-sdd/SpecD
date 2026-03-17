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

`createCodeGraphProvider(config: SpecdConfig): CodeGraphProvider` accepts a `SpecdConfig` from `@specd/core` and:

1. Derives `storagePath` from `config.projectRoot` (locates `.specd/code-graph.lbug`)
2. Creates `LadybugGraphStore` with the storage path
3. Creates `AdapterRegistry` and registers the built-in adapters (TypeScript, Python, Go, PHP)
4. Creates `IndexCodeGraph` with the store and registry
5. Returns a `CodeGraphProvider` wired to all components

**Legacy (standalone):**

`createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider` accepts:

- **`storagePath`** (`string`, required) — workspace root path, used to locate the `.specd/code-graph.lbug` file
- **`adapters`** (`LanguageAdapter[]`, optional) — additional language adapters to register beyond the 4 built-in adapters

The factory detects which overload is being used by checking for the `projectRoot` property (present on `SpecdConfig`) vs the `storagePath` property (present on `CodeGraphOptions`).

Callers MUST NOT construct `CodeGraphProvider` directly — the constructor is not part of the public API.

### Requirement: Package exports

The `@specd/code-graph` package SHALL export only:

- `createCodeGraphProvider` — factory function
- `CodeGraphProvider` — type only (for type annotations, not construction)
- `CodeGraphOptions` — options type for the factory
- `IndexOptions`, `IndexResult`, `WorkspaceIndexTarget`, `WorkspaceIndexBreakdown`, `DiscoveredSpec` — indexer types. `IndexOptions` includes `workspaces` (required array of `WorkspaceIndexTarget`), `projectRoot` (required), `onProgress` (optional callback), and `chunkBytes` (optional chunk size budget, default 20 MB).
- `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult` — traversal/impact types
- `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType` — model types
- `SymbolQuery`, `GraphStatistics` — query types
- `LanguageAdapter` — interface for custom adapters
- `CodeGraphError` and subclasses — error types

Internal components (`LadybugGraphStore`, `AdapterRegistry`, `TypeScriptLanguageAdapter`, `IndexCodeGraph`, traversal functions) MUST NOT be exported from the package entry point.

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, and `close()` when done. The `CodeGraphProvider` delegates these calls to the underlying `GraphStore`. Methods called before `open()` or after `close()` throw `StoreNotOpenError`.

The provider does not auto-open or auto-close — callers manage the lifecycle explicitly. This follows the same pattern as database connections and avoids hidden state transitions.

### Requirement: Dependency on @specd/core

`@specd/code-graph` depends on `@specd/core` as a runtime dependency. It uses types (`SpecdConfig`, `SpecdWorkspaceConfig`) and may use domain services (e.g. `parseMetadata`, `SpecRepository`) for spec resolution. The primary factory function accepts `SpecdConfig` to derive workspace targets, storage path, and spec sources.

## Constraints

- `createCodeGraphProvider` is the only construction path — `CodeGraphProvider` constructor is not exported
- Internal components are not re-exported from the package
- The `LanguageAdapter` interface is exported so consumers can write custom adapters
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
// symbols[0].filePath === 'core/src/domain/entities/change.ts'

await provider.close()
```

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — model types exported from package
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore`, `LadybugGraphStore` (internal wiring)
- [`specs/code-graph/language-adapter/spec.md`](../language-adapter/spec.md) — `LanguageAdapter` (exported), `AdapterRegistry` (internal)
- [`specs/code-graph/indexer/spec.md`](../indexer/spec.md) — `IndexCodeGraph` (internal), `IndexResult` (exported)
- [`specs/code-graph/traversal/spec.md`](../traversal/spec.md) — traversal/impact types (exported), functions (internal)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — composition layer pattern
