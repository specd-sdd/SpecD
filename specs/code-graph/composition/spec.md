# Composition

## Purpose

Consumers of `@specd/code-graph` should not need to know how the store, indexer, adapters, and traversal functions are wired together. The composition layer provides a single facade and factory function that assembles all internal components, manages lifecycle, and defines the package's public API surface.

## Requirements

### Requirement: CodeGraphProvider facade

`CodeGraphProvider` SHALL be the top-level API object that wraps all code graph functionality behind one lifecycle-managed facade.

Public responsibilities include:

- Indexing: `index(options: IndexOptions): Promise<IndexResult>` — runs `IndexCodeGraph` and owns any provider-internal force-reset or lock policy required by indexing
- Querying: `getSymbol(id)`, `findSymbols(query)`, `getFile(path)`, `getDocument(path)`, `findFilesByConfigRelativePath(configRelativePath)`, `findDocumentsByConfigRelativePath(configRelativePath)`, `getSpec(specId)`, `getSpecDependencies(specId)`, `getSpecDependents(specId)`, `getCoveredFiles(specId)`, `getCoveringSpecsForFile(filePath)`, `getCoveredSymbols(specId)`, `getCoveringSpecsForSymbol(symbolId)`, `getStatistics()` — delegates to `GraphStore`
- Exact batch querying: `getSymbolsByIds(ids)`, `getFilesByPaths(paths)`, `getDocumentsByPaths(paths)`, `getSpecsByIds(ids)` — delegates to `GraphStore` exact batch node operations
- Search: `searchSymbols(options: SearchOptions)`, `searchSpecs(options: SearchOptions)`, `searchDocuments(options: SearchOptions)` — full-text search with exact-match prioritization, delegates to `GraphStore`
- Maintenance: `clear(): Promise<void>` — clears persisted graph contents while preserving the provider lifecycle contract
- Traversal: `getUpstream(symbolId, options?)`, `getDownstream(symbolId, options?)` — delegates to traversal functions
- Impact: `analyzeImpact(target, direction)`, `analyzeFileImpact(filePath, direction)`, `analyzeFilesImpact(filePaths, direction, maxDepth)`, `analyzeSpecImpact(specId, direction)`, `detectChanges(changedFiles)`, `getHotspots(options?)` — delegates to impact/traversal functions
- Selector normalization: `resolveFileSelector(selector: string): Promise<ResolvedFileSelector[]>`, `resolveSymbolSelector(selector: string): Promise<ResolvedSymbolSelectorResult>` — resolves project-relative or absolute paths to canonical graph identities
- Lifecycle: `open(): Promise<void>`, `close(): Promise<void>` — manages the store connection and backend resource lifetime

`getSpec(specId)` returns `undefined` when the spec is not indexed. Callers that require existence MAY throw domain-specific errors above the provider layer.

Every composite provider operation (traversal, impact, hotspots, change detection, indexing) SHALL perform exactly one availability/staleness validation before fanning out its store reads. A composite operation MUST NOT revalidate availability once per symbol, file, or frontier, and MUST NOT produce `StoreOverloadError` merely because it processes a wide graph. Composite operations SHALL fan out only through the bounded batch and concurrency contracts of the underlying store and traversal layers.

Public callers MUST NOT depend on `recreate()`, worker protocol operations, or exposed lock-helper methods. Force-reset behavior, worker-efficient batch reads, and indexing locks are provider-owned internal concerns.

### Requirement: Factory function

Two factory signatures are provided:

Primary (workspace-aware):

`createCodeGraphProvider(config: SpecdConfig, options?: CodeGraphCompositionOptions): CodeGraphProvider`

1. Derives the graph storage root from `config.configPath`
2. Resolves the active graph-store backend id using `options.graphStoreId` when provided, otherwise `sqlite`
3. Builds a graph-store registry containing the built-in SQLite factory plus any additive `options.graphStoreFactories`
4. Validates registrations and rejects an external collision with the built-in backend id instead of silently overriding its factory
5. Creates the selected concrete `GraphStore` from that registry using the derived storage root
6. Creates `AdapterRegistry` and registers the built-in language adapters (TypeScript, Python, Go, PHP)
7. Registers any additive language adapters from `options.adapters`
8. Creates `IndexCodeGraph` with the selected store and language-adapter registry
9. Returns a `CodeGraphProvider` wired to all components

Legacy (standalone):

`createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider` accepts:

- `storagePath` (string, required) — filesystem root allocated to the selected concrete graph-store backend
- `graphStoreId` (string, optional) — selected backend id; when omitted, uses `sqlite`
- `graphStoreFactories` (optional additive registrations) — external graph-store factories merged with the built-in SQLite registration before backend selection
- `adapters` (`LanguageAdapter[]`, optional) — additional language adapters to register beyond the built-in language adapters

The provider is stateless regarding project configuration; it uses `SpecdConfig` only to derive composition inputs such as storage path and project root.

`CodeGraphCompositionOptions` SHALL support the same additive graph-store selection model and language-adapter extension model as `CodeGraphOptions`.

The factory detects which overload is being used by checking for the project-root-bearing `SpecdConfig` shape.

The built-in graph-store registry SHALL contain exactly the `sqlite` backend. The built-in default graph-store id SHALL be `sqlite`. Selecting any other id MUST succeed only when the caller supplied a factory for that id; otherwise composition MUST throw the graph-store registry's unknown-backend error.

`graphStoreFactories` SHALL remain a supported additive registration seam for future graph-store plugins. External factories MUST obey the same lifecycle and storage-root contract as the built-in factory. A registration whose id collides with the built-in `sqlite` id MUST fail deterministically and MUST NOT replace the built-in factory. The `Readonly<Record<string, GraphStoreFactory>>` input structurally provides at most one external factory per id.

`createSqliteGraphStoreFactory()` SHALL accept `SqliteGraphStoreFactoryOptions`, including an optional serializable `SqliteRuntimeDescriptor`. Factory creation MUST remain synchronous. Native SQLite module loading, worker startup, schema preparation, and runtime-specific binding resolution MUST happen during `open()`, not during `createCodeGraphProvider(...)`.

`CodeGraphProvider` SHALL be a type-only public interface describing the provider lifecycle and query surface. The concrete implementation class, its constructor, `GraphStore`, worker protocol, and `IndexCodeGraph` inputs MUST remain internal to the package. Callers MUST obtain the interface only from `createCodeGraphProvider(...)` and MUST NOT construct a provider directly.

### Requirement: Package exports

The `@specd/code-graph` `"."` public barrel SHALL export only:

- Composition and wiring: `createCodeGraphProvider`, type-only `CodeGraphProvider`, `CodeGraphCompositionOptions`, `CodeGraphOptions`, `GraphStoreFactory`, `GraphStoreFactoryOptions`, `SqliteGraphStoreFactoryOptions`, `createSqliteGraphStoreFactory`, `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions`
- Host use cases: `GetGraphHealth`, `GetGraphHealthInput`, `GetGraphHealthResult`, `createGetGraphHealth`, `IndexProjectGraph`, `IndexProjectGraphInput`, `createIndexProjectGraph`, `GetSpecCoverage`, `GetSpecCoverageInput`, `GetSpecCoverageResult`, `createGetSpecCoverage`, `GetChangeSpecCoverage`, `GetChangeSpecCoverageInput`, `GetChangeSpecCoverageResult`, `createGetChangeSpecCoverage`
- VCS and config: `buildProjectGraphConfig`, `createBootstrapGraphConfig`, `GraphConfigOverrides`
- Public indexer and discovery types: `IndexOptions`, `IndexProgressCallback`, `ProjectGraphConfig`, `WorkspaceIndexTarget`, `DiscoveredSpec`, `IndexResult`, `IndexError`, `WorkspaceIndexBreakdown`, `DiscoverFilesOptions`, `DEFAULT_EXCLUDE_PATHS`
- Traversal and impact: `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult`, `RiskLevel`, `analyzeFilesImpact`
- Hotspots: `DEFAULT_HOTSPOT_KINDS`, `HotspotEntry`, `HotspotOptions`, `HotspotResult`
- Search: `SearchOptions`, `expandSymbolName`, `expandSearchQuery`, `expandSearchToken`
- Staleness and fingerprint: `isGraphStale`, `computeGraphFingerprint`, `computeRootFingerprint`, `computeWorkspaceFingerprint`, `parseFingerprintMap`, `serializeFingerprintMap`, `detectFingerprintMismatch`, `GraphFingerprintInput`
- Language adapter: `LanguageAdapter`
- Model vocabulary: `FileNode`, `DocumentNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType`, `SymbolQuery`, `GraphStatistics`, `ImportDeclaration`, `ImportDeclarationKind`, `SourceLocation`, `BindingScopeKind`, `BindingSourceKind`, `BindingScope`, `BindingFact`, `CallForm`, `CallFact`, `ResolvedDependency`
- `SpecdCodeGraphError` and public subclasses including `StoreNotOpenError`, `InvalidSymbolKindError`, `InvalidRelationTypeError`, `DuplicateSymbolIdError`, `SpecNotFoundError`, `GraphProviderStaleError`, `StoreOverloadError`, `StoreWorkerError`, `BulkSessionStateError`, `InvalidGraphStoreConfigurationError`, `GraphSchemaIncompatibleError`
- `CODE_GRAPH_VERSION`

Worker protocol DTOs, worker clients, concrete store classes, test-only worker-path overrides, database internals, lock helpers, and recreation helpers MUST NOT be exported from `"."`.

`InMemoryIndexSession`, the concrete SQLite adapter, and other composition internals MAY remain available from `"./internal"`. Removed Ladybug symbols MUST NOT be reintroduced.

### Requirement: Public and internal entry points

`@specd/code-graph` MUST publish:

- `src/public.ts` (or equivalent) as `"."` — curated public surface aligned with **Package exports** below
- `src/index.ts` as `"./internal"` — full barrel including indexer internals, store adapter symbols, and `InMemoryIndexSession`

`package.json` `exports` MUST map these entry points. The `"."` barrel MUST NOT use unrestricted `export *` of infrastructure modules.

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, unless a higher-level helper such as `withOpenGraphProvider` manages that lifecycle on their behalf.

The provider does not auto-open or auto-close. Lifecycle remains explicit.

`open()` is the required async boundary for backend readiness. Built-in or external backends MAY defer runtime-specific binding resolution, native module loading, worker startup, schema preparation, or storage-generation checks until `open()`.

`close()` MUST be idempotent. Calling it more than once, or combining it with future async-dispose support, MUST NOT fail merely because the provider was already closed. Closing MUST deterministically settle or reject outstanding requests before the underlying worker and database connection finish shutdown.

Long-lived hosts such as HTTP APIs, MCP servers, and Electron processes MUST be able to create a provider synchronously, `await open()` it under host control, reuse it while healthy without synchronous SQLite work blocking the host event loop, and explicitly close it during shutdown or replacement.

### Requirement: Dependency on @specd/core

`@specd/code-graph` depends on `@specd/core` as a runtime dependency. It uses types (`SpecdConfig`, `SpecdWorkspaceConfig`) and may use domain services (e.g. `parseMetadata`, `SpecRepository`) for spec resolution. The primary factory function accepts `SpecdConfig` to derive `storagePath` only — the provider is stateless and does not cache the config. Workspace targets and spec sources are built by the caller and passed via `IndexOptions` at each `index()` call.

### Requirement: Host use cases

`@specd/code-graph` SHALL expose application use cases for host orchestration above `CodeGraphProvider`:

- `GetGraphHealth` / `createGetGraphHealth` — statistics plus staleness and fingerprint diagnostics
- `IndexProjectGraph` / `createIndexProjectGraph` — project index execution with optional force recreate
- `GetSpecCoverage` / `createGetSpecCoverage` — single-spec implementation coverage
- `GetChangeSpecCoverage` / `createGetChangeSpecCoverage` — change-scoped coverage aggregation

Host use cases receive an already-open `CodeGraphProvider`. They MUST NOT replace direct provider methods for search, hotspots, impact, or traversal — those remain facade delegates.

### Requirement: Symbol-reference provider surface

`CodeGraphProvider` SHALL expose single and batch symbol-reference resolution plus canonical-symbol and public-binding impact operations. These operations SHALL delegate to the shared resolver/traversal services under the provider's existing lifecycle and availability checks.

The provider SHALL expose an exact public-binding lookup keyed by public surface, exported name, symbol space, and canonical target identity. The lookup SHALL return the selected binding and its declarations without passing through ranked or paginated search, so common export names cannot hide an already-resolved binding behind a result limit.

Selector resolution SHALL distinguish unique, ambiguous, and missing outcomes. Unqualified impact selectors SHALL use case-exact names first, fall back only to case-insensitive exact names, never widen to prefixes/text, and bound ambiguity candidates before returning them to a host.

Selector validation failures that are reachable from host input (for example an empty selector) SHALL reject with a typed graph error carrying a stable machine-readable code (`INVALID_GRAPH_SELECTOR`) rather than a generic `Error`, preserving the descriptive message. When ambiguous-symbol presentation must enrich candidates with symbol details, it SHALL issue exactly one exact batch lookup rather than one call per candidate.

The curated package surface SHALL export resolver input/result/status/reason/provenance types and factories, logical-symbol/public-binding/member/coverage vocabulary, and the enriched health/index result types. Concrete resolver implementations and backend storage details SHALL remain internal.

### Requirement: Code Graph-orchestrated search surface

`CodeGraphProvider` SHALL expose one multi-category search operation accepting the query, requested `symbols | files | specs | documents` categories, shared filters, per-category limit, and snippet preference. It SHALL normalize an exact file filter from canonical workspace-relative, config/project-relative, or absolute form to one graph file; wildcard filters SHALL remain patterns.

A Code Graph application use case SHALL build the shared query plan, execute semantic-symbol and backend content lanes, locate precise file occurrences, suppress only occurrences represented by returned symbol selection ranges, group and rank results, cap general/wildcard occurrences per file, and apply category limits after logical grouping and suppression. Exact single-file searches SHALL return every retained occurrence. The provider SHALL return the unified deterministic projection under its existing lifecycle and availability checks.

Delivery adapters MUST NOT reproduce query expansion, invoke category searches independently to merge them, deduplicate symbol/file matches, or apply final limits. Existing lower-level provider search methods MAY remain for compatibility, but the unified operation is authoritative for cross-category behavior.

The curated package surface SHALL export the unified search input/result and source-match value objects needed by hosts. Backend candidate types and implementation helpers SHALL remain internal.

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

- [`code-graph:symbol-model`](../symbol-model/spec.md) — graph and reference vocabulary
- [`code-graph:graph-store`](../graph-store/spec.md) — persistence contract
- [`code-graph:indexer`](../indexer/spec.md) — indexing pipeline
- [`code-graph:traversal`](../traversal/spec.md) — query-side traversal
- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal layering
- [`code-graph:get-graph-health`](../get-graph-health/spec.md) — health orchestration
- [`code-graph:index-project-graph`](../index-project-graph/spec.md) — index orchestration
- [`code-graph:get-spec-coverage`](../get-spec-coverage/spec.md) — spec coverage
- [`code-graph:get-change-spec-coverage`](../get-change-spec-coverage/spec.md) — change coverage
- [`code-graph:resolve-symbol-reference`](../resolve-symbol-reference/spec.md) — conservative reference resolution

## ADRs

- [ADR-0025: Non-Blocking Worker-Thread SQLite Graph Store](../../../docs/adr/0025-nonblocking-worker-sqlite-graph-store.md) — provider composition starts and owns the worker-backed SQLite lifecycle
