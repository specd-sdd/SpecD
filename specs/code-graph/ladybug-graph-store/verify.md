# Verification: Ladybug Graph Store

## Requirements

### Requirement: Ladybug-backed implementation

#### Scenario: Backend initialization stays inside the adapter

- **WHEN** `LadybugGraphStore.open()` is called through the abstract `GraphStore` lifecycle
- **THEN** the adapter initializes its Ladybug-specific connection and schema state before serving queries
- **AND** storage-agnostic callers do not need to know any Ladybug DDL or query details

#### Scenario: Ladybug remains available by backend id

- **GIVEN** a graph-store registry containing both `ladybug` and `sqlite`
- **WHEN** composition selects the backend id `ladybug`
- **THEN** `LadybugGraphStore` is constructed as the single active backend for that provider or kernel path
- **AND** callers do not need to know any Ladybug class name or constructor details

### Requirement: Config-derived persistence layout

#### Scenario: Graph and tmp directories are derived from configPath

- **GIVEN** project config resolves `configPath` to `/repo/.specd/config`
- **WHEN** `LadybugGraphStore.open()` or a bulk-loading operation needs filesystem storage
- **THEN** persistent Ladybug files are created only under `/repo/.specd/config/graph`
- **AND** scratch artifacts are created only under `/repo/.specd/config/tmp`

### Requirement: Destructive recreation

#### Scenario: Recreate discards Ladybug-owned graph files under the graph root

- **GIVEN** Ladybug persistence already exists under `{configPath}/graph`
- **WHEN** `LadybugGraphStore.recreate()` is invoked through the abstract force-reset path
- **THEN** the previously persisted Ladybug graph state is discarded
- **AND** any Ladybug-owned companion artifacts in the same graph root are discarded with it
- **AND** callers do not target `.lbug`, `.wal`, or `.lock` files directly

### Requirement: Ladybug schema ownership

#### Scenario: Physical schema remains backend-specific

- **WHEN** storage-agnostic use cases depend on `GraphStore`
- **THEN** they rely only on abstract node and relation semantics
- **AND** Ladybug table names, storage columns, and index shape remain internal to `LadybugGraphStore`

### Requirement: Node tables

#### Scenario: SearchName remains a backend column

- **GIVEN** a symbol named `handleUserLogin`
- **WHEN** the symbol is persisted by `LadybugGraphStore`
- **THEN** the physical `Symbol` table includes both the declared `name` and the backend-specific `searchName`
- **AND** storage-agnostic consumers still observe the symbol through the abstract `SymbolNode`

### Requirement: Relationship tables

#### Scenario: COVERS is materialized even before population is activated

- **WHEN** the Ladybug schema is initialized for a fresh graph database
- **THEN** a persisted `COVERS` relation family exists alongside the active code-graph relation families
- **AND** the backend is ready to store `Spec -> File` links when spec-to-code indexing is introduced

### Requirement: Full-text search implementation

#### Scenario: Search indexes are rebuilt after bulk data changes

- **GIVEN** the backend has inserted symbols and specs through bulk-loading operations
- **WHEN** `rebuildFtsIndexes()` is invoked
- **THEN** Ladybug search indexes are recreated so subsequent abstract search queries see the new data

### Requirement: Schema versioning

#### Scenario: Incompatible schema version permits rebuild strategy

- **GIVEN** the persisted Ladybug metadata records a schema version older than the adapter expects
- **WHEN** the adapter opens the database and determines it cannot migrate safely
- **THEN** it may require a destructive rebuild instead of applying an incremental migration

### Requirement: Bulk loading and scratch files

#### Scenario: Run-scoped scratch files are cleaned after success

- **GIVEN** a bulk load materializes CSV scratch files under `{configPath}/tmp`
- **WHEN** the bulk load completes successfully
- **THEN** the run-scoped scratch files are removed
- **AND** unrelated files in the same temp root are left untouched

#### Scenario: Failure leaves cleanup as best effort

- **GIVEN** a bulk load process crashes after creating run-scoped scratch files
- **WHEN** the process cannot reach normal cleanup logic
- **THEN** leftover scratch files are tolerated as backend-owned temporary artifacts
- **AND** the next run may clean or replace them without affecting the abstract store contract

### Requirement: Concrete database files

#### Scenario: Backend companion files stay under graph persistence root

- **WHEN** Ladybug creates a primary database file together with lock or WAL companions
- **THEN** all of those files live under `{configPath}/graph`
- **AND** callers do not configure or address those files individually through the abstract port

### Requirement: Persisted metadata keys

#### Scenario: Store statistics read metadata from backend storage

- **GIVEN** the adapter has persisted `lastIndexedAt` and `lastIndexedRef` in its metadata storage
- **WHEN** `GraphStore.getStatistics()` is called through the abstract port
- **THEN** the returned `GraphStatistics` reflects those persisted values
- **AND** callers do not depend on how Ladybug stores them physically
