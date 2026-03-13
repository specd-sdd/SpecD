# Verification: Composition

## Requirements

### Requirement: CodeGraphProvider facade

#### Scenario: All operations delegate correctly

- **GIVEN** a `CodeGraphProvider` created via the factory and opened
- **WHEN** `findSymbols()` is called
- **THEN** it delegates to `GraphStore.findSymbols()` and returns the result

#### Scenario: Index delegates to IndexCodeGraph

- **GIVEN** an opened `CodeGraphProvider`
- **WHEN** `index({ workspacePath: '/project' })` is called
- **THEN** `IndexCodeGraph.execute()` is invoked with the workspace path and the result is returned

### Requirement: Factory function

#### Scenario: Factory creates fully wired provider

- **WHEN** `createCodeGraphProvider({ storagePath: '/project' })` is called
- **THEN** the returned provider can be opened, used for indexing and queries, and closed without error

#### Scenario: Custom adapters registered

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
- **THEN** `LadybugGraphStore`, `AdapterRegistry`, `TypeScriptLanguageAdapter`, and `IndexCodeGraph` are not available as imports

#### Scenario: LanguageAdapter interface is exported

- **WHEN** a consumer wants to write a custom language adapter
- **THEN** they can import the `LanguageAdapter` interface from `@specd/code-graph`

#### Scenario: Model types are exported

- **WHEN** a consumer needs to type-annotate results
- **THEN** `FileNode`, `SymbolNode`, `Relation`, `SymbolKind`, and `RelationType` are available as imports

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

### Requirement: No dependency on @specd/core

#### Scenario: No core imports in package

- **WHEN** the `@specd/code-graph` package is inspected
- **THEN** its `package.json` has no dependency on `@specd/core` or any `@specd/*` package
- **AND** no source file imports from `@specd/core`
