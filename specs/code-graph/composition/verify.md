# Verification: Composition

## Requirements

### Requirement: CodeGraphProvider facade

#### Scenario: All operations delegate correctly

- **GIVEN** a `CodeGraphProvider` created via the factory and opened
- **WHEN** `findSymbols()` is called
- **THEN** it delegates to `GraphStore.findSymbols()` and returns the result

#### Scenario: Index delegates to IndexCodeGraph

- **GIVEN** an opened `CodeGraphProvider`
- **WHEN** `index(options)` is called
- **THEN** `IndexCodeGraph.execute()` is invoked and the result is returned

#### Scenario: Clear removes all data for full re-index

- **GIVEN** an opened `CodeGraphProvider` with indexed data
- **WHEN** `clear()` is called followed by `index()`
- **THEN** all files and symbols are re-processed (none skipped)

#### Scenario: Provider normalizes file selectors

- **WHEN** `resolveFileSelector()` is called with a project-relative path
- **THEN** it resolves correctly to the canonical graph identity

### Requirement: Factory function

#### Scenario: Primary factory with SpecdConfig

- **WHEN** `createCodeGraphProvider(config)` is called with a `SpecdConfig`
- **THEN** the graph storage root is derived from `config.configPath`
- **AND** the returned SQLite-backed provider can be opened, used for indexing and queries, and closed without error

#### Scenario: SQLite is the only built-in registration

- **WHEN** provider composition is created without `graphStoreId` or external factories
- **THEN** the `sqlite` factory is selected
- **AND** no `ladybug` factory is present in the built-in registry

#### Scenario: External graph-store factory remains selectable

- **GIVEN** `graphStoreFactories` contains a factory registered as `external-test`
- **WHEN** `createCodeGraphProvider` is called with `graphStoreId: 'external-test'`
- **THEN** that factory receives the derived storage root and creates the active store
- **AND** the SQLite factory is not instantiated

#### Scenario: Duplicate graph-store id is rejected

- **GIVEN** an external factory uses the built-in id `sqlite`
- **WHEN** provider composition builds the merged registry
- **THEN** it throws the graph-store registry collision error
- **AND** the built-in SQLite factory is not silently replaced

#### Scenario: Unknown graph-store id is rejected

- **WHEN** `graphStoreId` names neither `sqlite` nor an externally registered factory
- **THEN** provider composition throws the graph-store registry unknown-backend error

#### Scenario: Provider construction is factory-only

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** `CodeGraphProvider` is available only as a type
- **AND** constructing a provider directly is rejected at compile time

#### Scenario: Custom SQLite runtime descriptor is accepted by factory

- **GIVEN** a custom `SqliteRuntimeDescriptor` specifying `modulePath`
- **WHEN** `createCodeGraphProvider` or `createSqliteGraphStoreFactory` is configured with that descriptor
- **THEN** the factory creates the provider synchronously without error
- **AND** the descriptor is passed to the underlying SQLite worker during `open()`

### Requirement: Package exports

#### Scenario: Internal components not exported

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** `LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, built-in language adapters, and `IndexCodeGraph` are not available as imports

#### Scenario: LanguageAdapter interface is exported

- **WHEN** a consumer wants to write a custom language adapter
- **THEN** they can import the `LanguageAdapter` interface from `@specd/code-graph`

#### Scenario: Graph-store composition types are exported

- **WHEN** a consumer wants to register or select a backend explicitly
- **THEN** `GraphStoreFactory`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions`, and `createSqliteGraphStoreFactory` are available as imports

#### Scenario: Model types are exported

- **WHEN** a consumer needs to type-annotate results
- **THEN** `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, and `RelationType` are available as imports

#### Scenario: Workspace integration types are exported

- **WHEN** a consumer needs to build workspace targets
- **THEN** `WorkspaceIndexTarget`, `WorkspaceIndexBreakdown`, and `DiscoveredSpec` are available as imports

#### Scenario: SpecNotFoundError is exported

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** `SpecNotFoundError` is available as an import
- **AND** thrown instances expose machine-readable code `SPEC_NOT_FOUND` and the requested spec id

#### Scenario: Concrete store adapters are available only from the internal entry

- **GIVEN** a consumer importing from `@specd/code-graph/internal`
- **WHEN** the internal entry is queried for concrete store adapter symbols
- **THEN** `SQLiteGraphStore`, `AdapterRegistry`, and the built-in language adapters are importable
- **AND** none of those symbols are importable from `@specd/code-graph` (`"."`)
- **AND** `LadybugGraphStore` is not importable from either entrypoint

### Requirement: Public and internal entry points

#### Scenario: package.json exports public and internal

- **WHEN** `packages/code-graph/package.json` `exports` is inspected
- **THEN** `"."` and `"./internal"` entry points exist

#### Scenario: InMemoryIndexSession only on internal entry

- **WHEN** importing from `@specd/code-graph` `"."`
- **THEN** `InMemoryIndexSession` is not available at compile time
- **AND** importing from `@specd/code-graph/internal` succeeds

### Requirement: Lifecycle management

#### Scenario: Method before open throws

- **GIVEN** a `CodeGraphProvider` created but not opened
- **WHEN** `findSymbols()` is called
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Method after close throws

- **GIVEN** a `CodeGraphProvider` that was opened and then closed
- **WHEN** `analyzeImpact()` is called
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Open and close are idempotent-safe

- **GIVEN** an opened `CodeGraphProvider`
- **WHEN** `close()` is called twice
- **THEN** the second call completes without error
- **AND** underlying worker threads and connections are terminated cleanly

### Requirement: Dependency on @specd/core

#### Scenario: Package depends on @specd/core

- **WHEN** the `@specd/code-graph` package is inspected
- **THEN** its `package.json` has a dependency on `@specd/core`
- **AND** the primary factory accepts `SpecdConfig` from `@specd/core`

### Requirement: Host use cases

#### Scenario: Package exports host use case factories

- **WHEN** `@specd/code-graph` is imported
- **THEN** `createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, and `createGetChangeSpecCoverage` are available as named exports

### Requirement: Symbol-reference provider surface

#### Scenario: Public facade delegates resolver lifecycle

- **WHEN** a host invokes batch resolution and export impact
- **THEN** the provider delegates under its availability checks
- **AND** only public reference/result types are exported from `"."`

#### Scenario: Provider returns bounded selector ambiguity

- **GIVEN** an unqualified selector has several case-exact candidates
- **WHEN** a host resolves it for impact
- **THEN** the provider returns a bounded deterministic ambiguity without traversal
- **AND** it does not widen the selector to prefix or textual matches

#### Scenario: Exact public binding lookup bypasses search pagination

- **GIVEN** more than one search page of bindings shares an exported name
- **WHEN** a host requests one binding by surface, exported name, space, and target identity
- **THEN** the provider returns that exact binding and its declarations
- **AND** no ranked or paginated symbol search is used

#### Scenario: Concrete resolver implementation stays internal

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** the concrete `ResolveSymbolReference` implementation is not available as an import from `"."`
- **AND** resolver input/result/status/reason/provenance types and factories remain available from `"."`

#### Scenario: Empty selector input rejects with a typed error

- **GIVEN** an opened provider
- **WHEN** a host resolves an empty file selector or an empty symbol selector
- **THEN** the rejection is a typed graph error with code `INVALID_GRAPH_SELECTOR`
- **AND** the descriptive message is preserved instead of a generic `Error`

#### Scenario: Ambiguity presentation enriches candidates through one batch lookup

- **GIVEN** a symbol selector resolves to several bounded ambiguity candidates
- **WHEN** presentation loads symbol details for those candidates
- **THEN** exactly one exact batch symbol lookup serves all candidates
- **AND** candidate order, missing-symbol handling, and deterministic output are preserved

### Requirement: Code Graph-orchestrated search surface

#### Scenario: One provider call owns the unified search

- **GIVEN** symbols, files, specs, and documents are requested together
- **WHEN** a host invokes unified search
- **THEN** one Code Graph application use case expands the query, executes candidate lanes, suppresses duplicates, ranks, groups, and applies limits
- **AND** the provider returns one deterministic category-grouped result

#### Scenario: Provider normalizes exact file filters

- **GIVEN** canonical, config-relative, and absolute selectors identify one source file
- **WHEN** unified search receives each selector
- **THEN** it returns the same file with all retained occurrences
- **AND** wildcard search keeps its pattern and per-file cap

#### Scenario: Delivery adapter cannot recreate cross-category behavior

- **WHEN** the CLI invokes graph search
- **THEN** it delegates one unified request
- **AND** lower-level compatibility methods are not used to merge, rerank, deduplicate, or limit the response

#### Scenario: Public surface exposes contracts but not backend candidates

- **WHEN** a host imports unified search types from the curated package entrypoint
- **THEN** request, result, and source-match value objects are available
- **AND** backend candidate helpers remain internal
