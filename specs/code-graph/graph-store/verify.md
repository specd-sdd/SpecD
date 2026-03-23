# Verification: Graph Store

## Requirements

### Requirement: Connection lifecycle

#### Scenario: Operation before open throws

- **WHEN** `getFile()` is called on a `GraphStore` that has not been opened
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Operation after close throws

- **GIVEN** a `GraphStore` that was opened and then closed
- **WHEN** `upsertFile()` is called
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Open runs schema migration

- **GIVEN** an existing database file with schema version 1
- **AND** the adapter expects schema version 2
- **WHEN** `open()` is called
- **THEN** the schema is migrated to version 2 before the method resolves

### Requirement: Atomic file-level upsert

#### Scenario: Upsert replaces all data for a file

- **GIVEN** a file `src/utils.ts` with 3 symbols and 2 relations in the store
- **WHEN** `upsertFile()` is called for `src/utils.ts` with 2 symbols and 1 relation
- **THEN** the store contains exactly 2 symbols and 1 relation for that file

#### Scenario: Failed upsert preserves previous state

- **GIVEN** a file `src/utils.ts` with existing data in the store
- **WHEN** `upsertFile()` fails mid-transaction (e.g. invalid data)
- **THEN** the previous symbols and relations for that file remain intact

#### Scenario: Upsert creates file node if not exists

- **WHEN** `upsertFile()` is called for a file path not yet in the store
- **THEN** a new `FileNode` is created along with its symbols and relations

### Requirement: Additive relation insertion

#### Scenario: addRelations preserves existing data

- **GIVEN** a store with symbols A (in file1) and B (in file2) and no CALLS relations
- **WHEN** `addRelations([{ source: A.id, target: B.id, type: 'CALLS' }])` is called
- **THEN** the CALLS relation exists in the store
- **AND** all existing file, symbol, and relation data is preserved

#### Scenario: addRelations survives file re-upsert

- **GIVEN** a CALLS relation from symbol A (file1) to symbol B (file2) added via `addRelations`
- **WHEN** `upsertFile` is called for file2 (re-indexing it)
- **THEN** the CALLS relation from A to B is deleted (because B is removed and re-created)
- **AND** this is expected — the indexer re-adds CALLS in Phase 3 after all upserts

### Requirement: File removal

#### Scenario: Remove deletes file and all associated data

- **GIVEN** a file `src/auth.ts` with symbols A and B, and relations involving those symbols
- **WHEN** `removeFile('src/auth.ts')` is called
- **THEN** the `FileNode`, both `SymbolNode` entries, and all relations referencing those symbols or that file path are removed

#### Scenario: Remove non-existent file is idempotent

- **WHEN** `removeFile('nonexistent.ts')` is called
- **THEN** the operation completes without error

### Requirement: Spec upsert and removal

#### Scenario: Upsert replaces spec DEPENDS_ON relations

- **GIVEN** a spec `core:core/change` with 2 `DEPENDS_ON` relations in the store
- **WHEN** `upsertSpec()` is called with 3 new `DEPENDS_ON` relations
- **THEN** the store contains exactly 3 `DEPENDS_ON` relations for that spec

#### Scenario: Remove spec cleans up all relations

- **GIVEN** a spec `core:core/config` that is both a source and target of `DEPENDS_ON` relations
- **WHEN** `removeSpec('core:core/config')` is called
- **THEN** the `SpecNode` and all `DEPENDS_ON` relations where it appears as source or target are removed

### Requirement: Query methods

#### Scenario: getSpecDependencies returns outgoing DEPENDS_ON

- **GIVEN** spec A depends on specs B and C
- **WHEN** `getSpecDependencies(A.specId)` is called
- **THEN** two `DEPENDS_ON` relations are returned with targets B and C

#### Scenario: getSpecDependents returns incoming DEPENDS_ON

- **GIVEN** specs A and B both depend on spec C
- **WHEN** `getSpecDependents(C.specId)` is called
- **THEN** two `DEPENDS_ON` relations are returned with sources A and B

#### Scenario: getCallers returns only incoming CALLS relations

- **GIVEN** symbol B has two callers (A and C) and one callee (D)
- **WHEN** `getCallers(B.id)` is called
- **THEN** two relations are returned with `source` being A and C

#### Scenario: findSymbols filters by kind

- **GIVEN** the store contains functions, classes, and methods
- **WHEN** `findSymbols({ kind: SymbolKind.Class })` is called
- **THEN** only class symbols are returned

#### Scenario: findSymbols with name pattern

- **GIVEN** symbols named `createUser`, `createOrder`, `deleteUser`
- **WHEN** `findSymbols({ name: 'create*' })` is called
- **THEN** `createUser` and `createOrder` are returned

#### Scenario: findSymbols filters by comment text

- **GIVEN** symbols with comments containing "validates user input" and "computes hash"
- **WHEN** `findSymbols({ comment: 'validates' })` is called
- **THEN** only the symbol with "validates user input" in its comment is returned

### Requirement: Graph statistics

#### Scenario: Statistics include all expected fields

- **WHEN** `getStatistics()` is called on a populated store
- **THEN** the result SHALL include `fileCount`, `symbolCount`, `specCount`, `relationCounts`, `languages`, `lastIndexedAt`, and `lastIndexedRef`

#### Scenario: lastIndexedRef defaults to null

- **GIVEN** no VCS ref has been stored
- **WHEN** `getStatistics()` is called
- **THEN** `lastIndexedRef` SHALL be `null`

#### Scenario: lastIndexedRef reflects stored value

- **GIVEN** the `lastIndexedRef` meta key has been set to `"abc1234"`
- **WHEN** `getStatistics()` is called
- **THEN** `lastIndexedRef` SHALL be `"abc1234"`

### Requirement: LadybugDB adapter

#### Scenario: Database created on first open

- **GIVEN** no `.specd/` directory exists at `storagePath`
- **WHEN** `open()` is called on `LadybugGraphStore`
- **THEN** the `.specd/` directory and `code-graph.lbug` file are created

#### Scenario: Parameterized queries prevent injection

- **WHEN** `findSymbols({ name: "'; DROP TABLE symbols; --" })` is called
- **THEN** the query executes safely and returns no results (no injection)

### Requirement: Bulk operations

#### Scenario: Clear removes all data

- **GIVEN** a store with files, symbols, and relations
- **WHEN** `clear()` is called
- **THEN** `getStatistics()` returns zero for all counts

#### Scenario: getAllFiles returns all indexed files

- **GIVEN** a store with 5 files
- **WHEN** `getAllFiles()` is called
- **THEN** 5 `FileNode` entries are returned

#### Scenario: getAllSpecs returns all indexed specs

- **GIVEN** a store with 12 specs
- **WHEN** `getAllSpecs()` is called
- **THEN** 12 `SpecNode` entries are returned
