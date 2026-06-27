# Composition

## Purpose

Consumers of `@specd/code-graph` should not need to know how the store, indexer, adapters, and traversal functions are wired together. The composition layer provides a single facade and factory function that assembles all internal components, manages lifecycle, and defines the package's public API surface.

## Requirements

### Requirement: CodeGraphProvider facade

`CodeGraphProvider` SHALL be the top-level API object that wraps all code graph functionality. It exposes:

- **Indexing**: `index(options: IndexOptions): Promise<IndexResult>` — runs `IndexCodeGraph`
- **Querying**: `getSymbol(id)`, `findSymbols(query)`, `getFile(path)`, `getDocument(path)`, `findFilesByConfigRelativePath(configRelativePath)`, `findDocumentsByConfigRelativePath(configRelativePath)`, `getSpec(specId)`, `getSpecDependencies(specId)`, `getSpecDependents(specId)`, `getCoveredFiles(specId)`, `getCoveringSpecsForFile(filePath)`, `getCoveredSymbols(specId)`, `getCoveringSpecsForSymbol(symbolId)`, `getStatistics()` — delegates to `GraphStore`
- **Search**: `searchSymbols(options: SearchOptions)`, `searchSpecs(options: SearchOptions)`, `searchDocuments(options: SearchOptions)` — full-text search with exact-match prioritization, delegates to `GraphStore`
- **Maintenance**: `clear(): Promise<void>`, `recreate(): Promise<void>` — removes all data or recreates store
- **Traversal**: `getUpstream(symbolId, options?)`, `getDownstream(symbolId, options?)` — delegates to traversal functions
- **Impact**: `analyzeImpact(target, direction)`, `analyzeFileImpact(filePath, direction)`, `analyzeFilesImpact(filePaths, direction, maxDepth)`, `analyzeSpecImpact(specId, direction)`, `detectChanges(changedFiles)`, `getHotspots(options?)` — delegates to impact/traversal functions
- **Selector Normalization**: `resolveFileSelector(selector: string): Promise<ResolvedFileSelector[]>`, `resolveSymbolSelector(selector: string): Promise<ResolvedSymbolSelector[]>` — resolves project-relative or absolute paths to canonical graph identities
- **Lock Management**: `assertGraphIndexUnlocked()`, `acquireGraphIndexLock()` — checks or holds the indexing process mutex lock
- **Lifecycle**: `open(): Promise<void>`, `close(): Promise<void>` — manages the store connection

`getSpec(specId)` returns `undefined` when the spec is not indexed. Callers that require a spec to exist (for example CLI spec impact) SHALL throw `SpecNotFoundError` after checking the result.

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

The provider is stateless regarding project configuration; it uses `SpecdConfig` to derive its internal storage root but does not cache it. Workspaces and graph-specific rules are passed to `index()` via `IndexOptions` at each call.

`CodeGraphFactoryOptions` SHALL support the same additive graph-store selection model as `CodeGraphOptions`, except that the storage root is derived from `SpecdConfig`.

The factory detects which overload is being used by checking for the `projectRoot` property (present on `SpecdConfig`) vs the `storagePath` property (present on `CodeGraphOptions`).

The built-in graph-store registry SHALL include at least:

- `ladybug` — the Ladybug-backed implementation
- `sqlite` — the SQLite-backed implementation

The built-in default graph-store id SHALL be `sqlite`. `ladybug` remains available only by explicit selection.

Callers MUST NOT construct `CodeGraphProvider` directly — the constructor is not part of the public API.

### Requirement: Package exports

The `@specd/code-graph` package SHALL export only:

- **Composition & Wiring**: `createCodeGraphProvider`, `CodeGraphProvider`, `CodeGraphFactoryOptions`, `CodeGraphOptions`, `GraphStoreFactory`, `GraphStoreFactoryOptions`
- **Host use cases**: `GetGraphHealth`, `GetGraphHealthInput`, `GetGraphHealthResult`, `createGetGraphHealth`, `IndexProjectGraph`, `IndexProjectGraphInput`, `createIndexProjectGraph`, `GetSpecCoverage`, `GetSpecCoverageInput`, `GetSpecCoverageResult`, `createGetSpecCoverage`, `GetChangeSpecCoverage`, `GetChangeSpecCoverageInput`, `GetChangeSpecCoverageResult`, `createGetChangeSpecCoverage`
- **VCS & Config**: `buildProjectGraphConfig`, `createBootstrapGraphConfig`, `GraphConfigOverrides`
- **Lock Management**: `acquireGraphIndexLock`, `assertGraphIndexUnlocked`
- **Indexer & Discovery**: `IndexOptions`, `IndexProgressCallback`, `ProjectGraphConfig`, `WorkspaceIndexTarget`, `DiscoveredSpec`, `IndexResult`, `IndexError`, `WorkspaceIndexBreakdown`, `IndexSession`, `RegisterFileInput`, `RegisterAnalysisInput`, `InMemoryIndexSession`, `DiscoverFilesOptions`, `DEFAULT_EXCLUDE_PATHS`
- **Traversal & Impact**: `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult`, `RiskLevel`, `analyzeFilesImpact`
- **Hotspots**: `DEFAULT_HOTSPOT_KINDS`, `HotspotEntry`, `HotspotOptions`, `HotspotResult`
- **Search**: `SearchOptions`, `expandSymbolName`, `expandSearchQuery`, `expandSearchToken`
- **Staleness & Fingerprint**: `isGraphStale`, `computeGraphFingerprint`, `computeRootFingerprint`, `computeWorkspaceFingerprint`, `parseFingerprintMap`, `serializeFingerprintMap`, `detectFingerprintMismatch`, `GraphFingerprintInput`
- **Language Adapter**: `LanguageAdapter`
- **Model/Vocabulary**: `FileNode`, `DocumentNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType`, `SymbolQuery`, `GraphStatistics`, `ImportDeclaration`, `ImportDeclarationKind`, `SourceLocation`, `BindingScopeKind`, `BindingSourceKind`, `BindingScope`, `BindingFact`, `CallForm`, `CallFact`, `ResolvedDependency`
- **Errors**: `SpecdCodeGraphError` and its subclasses (such as `StoreNotOpenError`, `InvalidSymbolKindError`, `InvalidRelationTypeError`, `DuplicateSymbolIdError`, `SpecNotFoundError`)

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, and `close()` when done. The `CodeGraphProvider` delegates these calls to the underlying `GraphStore`. Methods called before `open()` or after `close()` throw `StoreNotOpenError`.

The provider does not auto-open or auto-close — callers manage the lifecycle explicitly. This follows the same pattern as database connections and avoids hidden state transitions.

### Requirement: Dependency on @specd/core

`@specd/code-graph` depends on `@specd/core` as a runtime dependency. It uses types (`SpecdConfig`, `SpecdWorkspaceConfig`) and may use domain services (e.g. `parseMetadata`, `SpecRepository`) for spec resolution. The primary factory function accepts `SpecdConfig` to derive `storagePath` only — the provider is stateless and does not cache the config. Workspace targets and spec sources are built by the caller and passed via `IndexOptions` at each `index()` call.

### Requirement: Host use cases

`@specd/code-graph` SHALL expose application use cases for host orchestration above `CodeGraphProvider`:

- `GetGraphHealth` / `createGetGraphHealth` — statistics plus staleness and fingerprint diagnostics
- `IndexProjectGraph` / `createIndexProjectGraph` — project index execution with optional force recreate
- `GetSpecCoverage` / `createGetSpecCoverage` — single-spec implementation coverage
- `GetChangeSpecCoverage` / `createGetChangeSpecCoverage` — change-scoped coverage aggregation

Host use cases receive an already-open `CodeGraphProvider`. They MUST NOT replace direct provider methods for search, hotspots, impact, or traversal — those remain facade delegates.

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

- [`code-graph:symbol-model`](../symbol-model/spec.md) — graph vocabulary
- [`code-graph:graph-store`](../graph-store/spec.md) — persistence contract
- [`code-graph:indexer`](../indexer/spec.md) — indexing pipeline
- [`code-graph:traversal`](../traversal/spec.md) — query-side traversal
- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal layering
- [`code-graph:get-graph-health`](../get-graph-health/spec.md) — health orchestration use case
- [`code-graph:index-project-graph`](../index-project-graph/spec.md) — index orchestration use case
- [`code-graph:get-spec-coverage`](../get-spec-coverage/spec.md) — spec coverage use case
- [`code-graph:get-change-spec-coverage`](../get-change-spec-coverage/spec.md) — change coverage use case
