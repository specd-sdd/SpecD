# Verification: Composition

## Requirements

### Requirement: CodeGraphProvider facade

#### Scenario: All operations delegate correctly

- **GIVEN** a `CodeGraphProvider` created via the factory and opened
- **WHEN** `findSymbols()` is called
- **THEN** it delegates to `GraphStore.findSymbols()` and returns the result

#### Scenario: Index delegates to IndexCodeGraph

- **GIVEN** an opened `CodeGraphProvider`
- **WHEN** `index({ workspaces: [...], projectRoot: '/project' })` is called
- **THEN** `IndexCodeGraph.execute()` is invoked with the workspace targets and the result is returned

#### Scenario: Clear removes all data for full re-index

- **GIVEN** an opened `CodeGraphProvider` with indexed data
- **WHEN** `clear()` is called followed by `index()`
- **THEN** all files and symbols are re-processed (none skipped)

### Requirement: Factory function

#### Scenario: Primary factory with SpecdConfig

- **WHEN** `createCodeGraphProvider(config)` is called with a `SpecdConfig`
- **THEN** the graph storage root is derived from `config.configPath`
- **AND** the returned provider can be opened, used for indexing and queries, and closed without error

#### Scenario: Legacy factory with CodeGraphOptions

- **WHEN** `createCodeGraphProvider({ storagePath: '/project' })` is called
- **THEN** the returned provider can be opened, used for indexing and queries, and closed without error

#### Scenario: Factory detects overload by property

- **GIVEN** an object with `projectRoot` property
- **WHEN** passed to `createCodeGraphProvider`
- **THEN** it is treated as `SpecdConfig`
- **GIVEN** an object with `storagePath` property
- **WHEN** passed to `createCodeGraphProvider`
- **THEN** it is treated as `CodeGraphOptions`

#### Scenario: Default backend is sqlite

- **GIVEN** no explicit `graphStoreId`
- **WHEN** a provider is created from either factory overload
- **THEN** the built-in backend id `sqlite` is selected

#### Scenario: Explicit backend id overrides the default

- **GIVEN** a provider factory call with `graphStoreId: 'ladybug'`
- **WHEN** the provider is constructed
- **THEN** the Ladybug-backed store is used as the single active backend for that provider

#### Scenario: Additive graph-store registrations extend the built-ins

- **GIVEN** a custom graph-store factory registered through `graphStoreFactories`
- **WHEN** `graphStoreId` selects that custom backend id
- **THEN** the provider uses the custom backend
- **AND** the built-in `sqlite` and `ladybug` backends remain available

#### Scenario: Unknown graph-store id fails clearly

- **GIVEN** a provider factory call with `graphStoreId: 'missing-backend'`
- **WHEN** the graph-store registry is resolved
- **THEN** provider construction fails with a clear unknown-backend error

#### Scenario: Custom adapters registered (legacy)

- **GIVEN** a custom adapter for Python
- **WHEN** `createCodeGraphProvider({ storagePath: '/project', adapters: [pythonAdapter] })` is called
- **THEN** the provider can index `.py` files using the custom adapter
- **AND** the built-in TypeScript adapter is still available

#### Scenario: Direct construction not supported

- **WHEN** a caller attempts to construct `CodeGraphProvider` via `new CodeGraphProvider()`
- **THEN** the constructor is not available in the public API (not exported or marked internal)

### Requirement: Package exports

#### Scenario: Internal components not exported

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** `LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, built-in language adapters, and `IndexCodeGraph` are not available as imports

#### Scenario: LanguageAdapter interface is exported

- **WHEN** a consumer wants to write a custom language adapter
- **THEN** they can import the `LanguageAdapter` interface from `@specd/code-graph`

#### Scenario: Graph-store composition types are exported

- **WHEN** a consumer wants to register or select a backend explicitly
- **THEN** `GraphStoreFactory`, `CodeGraphOptions`, and `CodeGraphFactoryOptions` are available as imports

#### Scenario: Model types are exported

- **WHEN** a consumer needs to type-annotate results
- **THEN** `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, and `RelationType` are available as imports

#### Scenario: Workspace integration types are exported

- **WHEN** a consumer needs to build workspace targets
- **THEN** `WorkspaceIndexTarget`, `WorkspaceIndexBreakdown`, and `DiscoveredSpec` are available as imports

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

### Requirement: Dependency on @specd/core

#### Scenario: Package depends on @specd/core

- **WHEN** the `@specd/code-graph` package is inspected
- **THEN** its `package.json` has a dependency on `@specd/core`
- **AND** the primary factory accepts `SpecdConfig` from `@specd/core`
