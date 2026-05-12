# Verification: SQLite Graph Store

## Requirements

### Requirement: SQLite-backed implementation

#### Scenario: Backend initialization stays inside the adapter

- **WHEN** `SQLiteGraphStore.open()` is called through the abstract `GraphStore`
  lifecycle
- **THEN** the adapter initializes its SQLite-specific connection and schema state
  before serving queries
- **AND** storage-agnostic callers do not need to know any SQLite DDL or query details

### Requirement: Config-derived persistence layout

#### Scenario: Graph and tmp directories are derived from configPath

- **GIVEN** project config resolves `configPath` to `/repo/.specd/config`
- **WHEN** `SQLiteGraphStore.open()` or a backend-owned indexing operation needs
  filesystem storage
- **THEN** persistent SQLite files are created only under `/repo/.specd/config/graph`
- **AND** scratch artifacts are created only under `/repo/.specd/config/tmp`

### Requirement: Default backend role

#### Scenario: SQLite is the built-in default backend id

- **GIVEN** the built-in graph-store registry contains both `sqlite` and `ladybug`
- **WHEN** no explicit `graphStoreId` is supplied during provider or kernel
  construction
- **THEN** the backend id `sqlite` is selected

#### Scenario: Default backend preserves Ladybug-era capabilities

- **WHEN** graph indexing, search, stats, traversal, impact, and hotspot flows run
  through the built-in default backend
- **THEN** they succeed through `SQLiteGraphStore` without requiring a fallback to
  `LadybugGraphStore`

### Requirement: Destructive recreation

#### Scenario: Recreate discards SQLite-owned graph files under the graph root

- **GIVEN** SQLite persistence already exists under `{configPath}/graph`
- **WHEN** `SQLiteGraphStore.recreate()` is invoked through the abstract force-reset
  path
- **THEN** the previously persisted SQLite graph state is discarded
- **AND** any SQLite-owned companion artifacts in the same graph root are discarded
  with it
- **AND** callers do not target SQLite filenames directly

### Requirement: SQLite schema ownership

#### Scenario: Physical schema remains backend-specific

- **WHEN** storage-agnostic use cases depend on `GraphStore`
- **THEN** they rely only on abstract node and relation semantics
- **AND** SQLite table names, virtual tables, indexes, and storage columns remain
  internal to `SQLiteGraphStore`

### Requirement: Persisted node storage

#### Scenario: Logical node kinds survive backend-specific layout choices

- **WHEN** files, symbols, specs, and metadata are persisted by `SQLiteGraphStore`
- **THEN** the abstract graph-store queries can retrieve the expected logical node
  kinds
- **AND** callers do not need to know whether SQLite uses one table per kind or
  another internal layout

### Requirement: Persisted relation storage

#### Scenario: All required relation families are stored

- **WHEN** the SQLite schema is initialized for a fresh graph database
- **THEN** persisted storage exists for `IMPORTS`, `DEFINES`, `CALLS`, `EXPORTS`,
  `DEPENDS_ON`, `COVERS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`

### Requirement: SQLite full-text search

#### Scenario: Symbol and spec search use SQLite full-text search

- **GIVEN** symbols and specs have been indexed into SQLite
- **WHEN** abstract search methods are called
- **THEN** results come back in descending relevance order from SQLite-backed full-text
  search structures

#### Scenario: FTS structures can be refreshed after bulk writes

- **GIVEN** the backend has inserted symbols and specs through bulk-loading operations
- **WHEN** `rebuildFtsIndexes()` is invoked
- **THEN** subsequent abstract search queries see the newly indexed data

### Requirement: Transactional mutation model

#### Scenario: File upsert is all-or-nothing

- **GIVEN** a file already has persisted graph state in SQLite
- **WHEN** `upsertFile()` fails during its transaction
- **THEN** the previous committed state for that file remains intact

#### Scenario: Bulk indexing batch is all-or-nothing

- **GIVEN** a bulk indexing operation is persisting a batch of graph data
- **WHEN** the SQLite transaction for that batch fails
- **THEN** the backend does not expose a partially committed batch

### Requirement: Bulk indexing support

#### Scenario: Large indexing runs use backend-specific batching safely

- **WHEN** a large repository is indexed through `SQLiteGraphStore`
- **THEN** the backend may batch writes, use prepared statements, or use temporary
  tables internally
- **AND** the observable `GraphStore` contract remains unchanged

### Requirement: Schema versioning

#### Scenario: Incompatible schema version permits rebuild strategy

- **GIVEN** the persisted SQLite metadata records a schema version older than the
  adapter expects
- **WHEN** the adapter opens the database and determines it cannot migrate safely
- **THEN** it may require a destructive rebuild instead of applying an incremental
  migration

### Requirement: Backend-specific companion files

#### Scenario: SQLite companion files stay under graph persistence root

- **WHEN** SQLite creates a primary database file together with WAL or shared-memory
  companions
- **THEN** all of those files live under `{configPath}/graph`
- **AND** callers do not configure or address those files individually through the
  abstract port
