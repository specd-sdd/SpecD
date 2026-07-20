# Composition

## Purpose

Consumers of `@specd/code-graph` should not need to know how the store, indexer, adapters, and traversal functions are wired together. The composition layer provides a single facade and factory function that assembles all internal components, manages lifecycle, and defines the package's public API surface.

## Requirements

### Requirement: CodeGraphProvider facade

`CodeGraphProvider` SHALL be the top-level API object that wraps all code graph functionality behind one lifecycle-managed facade.

Public responsibilities include:

- Indexing: `index(options: IndexOptions): Promise<IndexResult>` — runs `IndexCodeGraph` and owns any provider-internal force-reset or lock policy required by indexing
- Querying: `getSymbol(id)`, `findSymbols(query)`, `getFile(path)`, `getDocument(path)`, `findFilesByConfigRelativePath(configRelativePath)`, `findDocumentsByConfigRelativePath(configRelativePath)`, `getSpec(specId)`, `getSpecDependencies(specId)`, `getSpecDependents(specId)`, `getCoveredFiles(specId)`, `getCoveringSpecsForFile(filePath)`, `getCoveredSymbols(specId)`, `getCoveringSpecsForSymbol(symbolId)`, `getStatistics()` — delegates to `GraphStore`
- Search: `searchSymbols(options: SearchOptions)`, `searchSpecs(options: SearchOptions)`, `searchDocuments(options: SearchOptions)` — full-text search with exact-match prioritization, delegates to `GraphStore`
- Maintenance: `clear(): Promise<void>` — clears persisted graph contents while preserving the provider lifecycle contract
- Traversal: `getUpstream(symbolId, options?)`, `getDownstream(symbolId, options?)` — delegates to traversal functions
- Impact: `analyzeImpact(target, direction)`, `analyzeFileImpact(filePath, direction)`, `analyzeFilesImpact(filePaths, direction, maxDepth)`, `analyzeSpecImpact(specId, direction)`, `detectChanges(changedFiles)`, `getHotspots(options?)` — delegates to impact/traversal functions
- Selector normalization: `resolveFileSelector(selector: string): Promise<ResolvedFileSelector[]>`, `resolveSymbolSelector(selector: string): Promise<ResolvedSymbolSelector[]>` — resolves project-relative or absolute paths to canonical graph identities
- Lifecycle: `open(): Promise<void>`, `close(): Promise<void>` — manages the store connection and backend resource lifetime

`getSpec(specId)` returns `undefined` when the spec is not indexed. Callers that require existence MAY throw domain-specific errors above the provider layer.

Public callers MUST NOT depend on `recreate()` or on exposed lock-helper methods. Force-reset behavior and indexing locks are provider-owned internal concerns.

### Requirement: Factory function

Two factory signatures are provided:

Primary (workspace-aware):

`createCodeGraphProvider(config: SpecdConfig, options?: CodeGraphCompositionOptions): CodeGraphProvider`

1. Derives the graph storage root from `config.configPath`
2. Resolves the active graph-store backend id using `options.graphStoreId` when provided, otherwise the built-in default backend id
3. Builds a merged graph-store registry from the built-in backends plus any additive `options.graphStoreFactories`
4. Creates the selected concrete `GraphStore` from that registry using the derived storage root
5. Creates `AdapterRegistry` and registers the built-in adapters (TypeScript, Python, Go, PHP)
6. Registers any additive language adapters from `options.adapters`
7. Creates `IndexCodeGraph` with the selected store and adapter registry
8. Returns a `CodeGraphProvider` wired to all components

Legacy (standalone):

`createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider` accepts:

- `storagePath` (string, required) — filesystem root allocated to the selected concrete graph-store backend
- `graphStoreId` (string, optional) — selected backend id; when omitted, uses the built-in default backend id
- `graphStoreFactories` (optional additive registrations) — external graph-store factories merged with the built-in graph-store registry before backend selection
- `adapters` (`LanguageAdapter[]`, optional) — additional language adapters to register beyond the 4 built-in adapters

The provider is stateless regarding project configuration; it uses `SpecdConfig` only to derive composition inputs such as storage path and project root.

`CodeGraphCompositionOptions` SHALL support the same additive graph-store selection model and adapter-extension model as `CodeGraphOptions`.

The factory detects which overload is being used by checking for the project-root-bearing `SpecdConfig` shape.

The built-in graph-store registry SHALL include at least:

- `ladybug` — the Ladybug-backed implementation
- `sqlite` — the SQLite-backed implementation

The built-in default graph-store id SHALL be `sqlite`. `ladybug` remains available only when explicitly selected.

Factory creation MUST remain synchronous. Any backend-native module loading or runtime-specific binding resolution required by a built-in or external store MUST happen during `open()`, not during `createCodeGraphProvider(...)`.

`CodeGraphProvider` SHALL be a type-only public interface describing the provider lifecycle and query surface. The concrete implementation class, its constructor, `GraphStore`, and `IndexCodeGraph` inputs MUST remain internal to the package. Callers MUST obtain the interface only from `createCodeGraphProvider(...)` and MUST NOT construct a provider directly.

### Requirement: Package exports

The `@specd/code-graph` `"."` public barrel SHALL export only:

- Composition & wiring: `createCodeGraphProvider`, type-only `CodeGraphProvider`, `CodeGraphCompositionOptions`, `CodeGraphOptions`, `GraphStoreFactory`, `GraphStoreFactoryOptions`, `createSqliteGraphStoreFactory`
- Host use cases: `GetGraphHealth`, `GetGraphHealthInput`, `GetGraphHealthResult`, `createGetGraphHealth`, `IndexProjectGraph`, `IndexProjectGraphInput`, `createIndexProjectGraph`, `GetSpecCoverage`, `GetSpecCoverageInput`, `GetSpecCoverageResult`, `createGetSpecCoverage`, `GetChangeSpecCoverage`, `GetChangeSpecCoverageInput`, `GetChangeSpecCoverageResult`, `createGetChangeSpecCoverage`
- VCS & Config: `buildProjectGraphConfig`, `createBootstrapGraphConfig`, `GraphConfigOverrides`
- Indexer & Discovery (public types only): `IndexOptions`, `IndexProgressCallback`, `ProjectGraphConfig`, `WorkspaceIndexTarget`, `DiscoveredSpec`, `IndexResult`, `IndexError`, `WorkspaceIndexBreakdown`, `DiscoverFilesOptions`, `DEFAULT_EXCLUDE_PATHS`
- Traversal & Impact: `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult`, `RiskLevel`, `analyzeFilesImpact`
- Hotspots: `DEFAULT_HOTSPOT_KINDS`, `HotspotEntry`, `HotspotOptions`, `HotspotResult`
- Search: `SearchOptions`, `expandSymbolName`, `expandSearchQuery`, `expandSearchToken`
- Staleness & Fingerprint: `isGraphStale`, `computeGraphFingerprint`, `computeRootFingerprint`, `computeWorkspaceFingerprint`, `parseFingerprintMap`, `serializeFingerprintMap`, `detectFingerprintMismatch`, `GraphFingerprintInput`
- Language Adapter: `LanguageAdapter`
- Model/Vocabulary: `FileNode`, `DocumentNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType`, `SymbolQuery`, `GraphStatistics`, `ImportDeclaration`, `ImportDeclarationKind`, `SourceLocation`, `BindingScopeKind`, `BindingSourceKind`, `BindingScope`, `BindingFact`, `CallForm`, `CallFact`, `ResolvedDependency`
- Errors: `SpecdCodeGraphError` and its subclasses (such as `StoreNotOpenError`, `InvalidSymbolKindError`, `InvalidRelationTypeError`, `DuplicateSymbolIdError`, `SpecNotFoundError`, `GraphProviderStaleError`)
- Version: `CODE_GRAPH_VERSION`

Lock-management helpers and provider-internal recreation/reset helpers MUST NOT be exported from `"."`.

The following MUST be exported only from `"./internal"`, not from `"."`: `InMemoryIndexSession`, concrete store adapter symbols, and other composition internals not required by public hosts.

### Requirement: Public and internal entry points

`@specd/code-graph` MUST publish:

- `src/public.ts` (or equivalent) as `"."` — curated public surface aligned with **Package exports** below
- `src/index.ts` as `"./internal"` — full barrel including indexer internals, store adapter symbols, and `InMemoryIndexSession`

`package.json` `exports` MUST map these entry points. The `"."` barrel MUST NOT use unrestricted `export *` of infrastructure modules.

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, unless a higher-level helper such as `withOpenGraphProvider` manages that lifecycle on their behalf.

The provider does not auto-open or auto-close. Lifecycle remains explicit.

`open()` is the required async boundary for backend readiness. Built-in or external backends MAY defer runtime-specific binding resolution, native module loading, schema preparation, or storage-generation checks until `open()`.

`close()` MUST be idempotent. Calling it more than once, or combining it with future `Symbol.asyncDispose` support, MUST NOT fail merely because the provider was already closed.

Long-lived hosts such as HTTP APIs, MCP servers, and Electron processes MUST be able to create a provider synchronously, `await open()` it under host control, reuse it while healthy, and explicitly `close()` it during shutdown or replacement.

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

- `createCodeGraphProvider` is the only construction path — `CodeGraphProvider` is exported type-only and no provider constructor is exported
- Internal components and store adapter implementations are exported only from `"./internal"`
- The `LanguageAdapter` interface is exported from `"."` so consumers can write custom adapters
- Graph-store backend selection is registry-driven and internal to composition; it is not a `specd.yaml` setting
- The provider builds exactly one active `GraphStore` per construction path, selected by backend id from the merged graph-store registry
- `CodeGraphProvider` holds no domain logic — it delegates and enforces provider-owned lifecycle and availability policy
- Lifecycle is explicit — no auto-open, no auto-close
- Provider-owned indexing locks and destructive recreation helpers are internal implementation details, not part of the public facade
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
