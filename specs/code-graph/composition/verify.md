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
- **AND** the returned provider can be opened, used for indexing and queries, and closed without error

#### Scenario: Factory resolves storage root from SpecdConfig.configPath

- **GIVEN** a valid `SpecdConfig` with `configPath` set
- **WHEN** `createCodeGraphProvider(config)` is called
- **THEN** the provider storage root is derived from `config.configPath`
- **AND** the provider can be opened, used for indexing and queries, and closed without error

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

#### Scenario: SpecNotFoundError is exported

- **WHEN** a consumer imports from `@specd/code-graph`
- **THEN** `SpecNotFoundError` is available as an import
- **AND** thrown instances expose machine-readable code `SPEC_NOT_FOUND` and the requested spec id

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

### Requirement: Dependency on @specd/core

#### Scenario: Package depends on @specd/core

- **WHEN** the `@specd/code-graph` package is inspected
- **THEN** its `package.json` has a dependency on `@specd/core`
- **AND** the primary factory accepts `SpecdConfig` from `@specd/core`

### Requirement: Host use cases

#### Scenario: Package exports host use case factories

- **WHEN** `@specd/code-graph` is imported
- **THEN** `createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, and `createGetChangeSpecCoverage` are available as named exports
