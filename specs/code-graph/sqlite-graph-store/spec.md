# SQLite Graph Store

## Purpose

`GraphStore` is the storage contract for the code graph, but SQLite has backend-specific
behavior that should not leak into the abstract port spec. This spec defines the
requirements that are specific to `SQLiteGraphStore`: its physical schema, persistence
layout, full-text search behavior, transaction model, and operational role as the
built-in default graph-store backend once it satisfies the full Ladybug feature set.

## Requirements

### Requirement: SQLite-backed implementation

`SQLiteGraphStore` SHALL implement the `GraphStore` contract using SQLite as the
storage engine. It is an infrastructure adapter and owns all backend-specific concerns
that are not part of the abstract `GraphStore` port.

Within a composition that supports multiple registered graph-store backends, the
SQLite adapter is identified by the backend id `sqlite`.

The adapter MUST:

- open and close a SQLite database connection safely
- execute the SQLite-specific schema DDL on first use
- keep backend-specific schema version state
- translate the abstract graph-store operations into SQLite queries, transactions, and
  full-text search operations

### Requirement: Config-derived persistence layout

`SQLiteGraphStore` SHALL use the project-level `configPath` as the root for its
persisted and temporary filesystem artifacts.

The adapter MUST derive:

- a graph persistence directory at `{configPath}/graph`
- a temporary scratch directory at `{configPath}/tmp`

The concrete SQLite database file and any backend-owned companion artifacts such as
WAL or shared-memory files SHALL live only under those derived directories. The adapter
MUST create the required directories on demand.

### Requirement: Default backend role

The built-in code-graph composition SHALL treat `sqlite` as the default backend id
when no explicit `graphStoreId` is selected.

The SQLite backend therefore MUST preserve the full set of currently supported graph
behaviors that Ladybug previously backed, including:

- durable persistence of file, symbol, spec, relation, and metadata state
- atomic mutation semantics required by the abstract `GraphStore` contract
- full-text search for symbols and specs
- bulk indexing and full re-index operations
- query support for traversal-, impact-, hotspot-, search-, and stats-facing flows

### Requirement: Destructive recreation

`SQLiteGraphStore` SHALL implement the abstract `GraphStore.recreate()` capability
using SQLite-specific persistence cleanup under the configured graph root.

When `recreate()` is invoked, the adapter MUST ensure that the next indexing run starts
from an empty SQLite backend without requiring callers to know any SQLite-specific
filenames. The implementation MAY close and reopen connections as needed, but the
observable effect MUST be that:

- all persisted SQLite graph data under `{configPath}/graph` is discarded
- any backend-owned companion artifacts such as WAL or shared-memory files are also
  discarded when they belong to the same graph persistence root
- the backend is ready to be opened again and rebuilt from scratch

### Requirement: SQLite schema ownership

`SQLiteGraphStore` SHALL own the SQLite-specific persisted schema for files, symbols,
specs, relations, full-text indexes, and store metadata.

That schema MUST define:

- persisted records for `File`, `Symbol`, `Spec`, and `Meta`
- persisted relation storage matching the `RelationType` values used by the code graph,
  including `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- any derived or backend-specific storage columns required by the implementation, such
  as normalized search text

The physical schema is an implementation concern of the SQLite adapter. Storage-agnostic
consumers MUST depend on `code-graph:code-graph/graph-store` instead of this spec.

### Requirement: Persisted node storage

The SQLite schema SHALL persist the logical node kinds required by the abstract graph
model:

- `File` nodes for indexed source files
- `Symbol` nodes for extracted code symbols
- `Spec` nodes for indexed specification documents
- `Meta` records for store-level metadata such as `lastIndexedAt`, `lastIndexedRef`,
  and backend schema version state

The adapter MAY represent those records as one table per logical node kind or another
SQLite-appropriate layout, provided the observable `GraphStore` semantics remain
preserved.

### Requirement: Persisted relation storage

The SQLite schema SHALL persist the relation families required by the abstract graph
model:

- `IMPORTS`
- `DEFINES`
- `CALLS`
- `EXPORTS`
- `DEPENDS_ON`
- `COVERS`
- `EXTENDS`
- `IMPLEMENTS`
- `OVERRIDES`

The adapter MAY represent relation storage with a single relation table, per-type
tables, or another SQLite-appropriate layout, provided the observable `GraphStore`
query semantics remain preserved.

### Requirement: SQLite full-text search

`SQLiteGraphStore` SHALL implement symbol and spec search using SQLite full-text search
capabilities.

The adapter MUST:

- provide full-text search over symbol search text and symbol comments for
  `GraphStore.searchSymbols()`
- provide full-text search over spec title, description, and searchable content for
  `GraphStore.searchSpecs()`
- return results ordered by descending relevance score
- rebuild or refresh backend-specific FTS structures when required after bulk data
  changes

The implementation MAY use SQLite FTS5 virtual tables or another SQLite-native full-text
search mechanism, provided the abstract graph-store search contract remains satisfied.

### Requirement: Transactional mutation model

`SQLiteGraphStore` SHALL use SQLite transactions to preserve the atomic mutation
semantics required by the abstract `GraphStore` contract.

At minimum:

- `upsertFile()` MUST replace file-local graph state atomically
- `removeFile()` MUST remove file-local graph state atomically
- `upsertSpec()` MUST replace spec-local graph state atomically
- `removeSpec()` MUST remove spec-local graph state atomically
- bulk indexing operations MUST commit all-or-nothing backend state for the batch they
  claim to have persisted

If a transaction fails, the backend MUST leave previously committed graph state intact.

### Requirement: Bulk indexing support

`SQLiteGraphStore` SHALL support efficient bulk indexing for large repositories.

The adapter MAY use batching, prepared statements, temporary tables, or other
SQLite-appropriate techniques to keep large indexing runs stable, provided the
observable `GraphStore` contract is preserved.

If the implementation materializes backend-owned scratch artifacts outside the primary
database file, those artifacts MUST be scoped to `{configPath}/tmp` and cleaned up
after successful completion.

### Requirement: Schema versioning

`SQLiteGraphStore` SHALL track a backend-specific schema version for its persisted
SQLite schema.

When the adapter opens a database:

1. it executes the current SQLite schema definition
2. it verifies or records the current schema version in persisted metadata
3. it prepares any required FTS structures

If the persisted SQLite schema version is incompatible with the expected version, the
implementation MAY require a destructive rebuild rather than attempting incremental
migration.

### Requirement: Backend-specific companion files

The SQLite-backed graph persistence under `{configPath}/graph` MAY create backend-specific
companion files such as WAL or shared-memory files next to the primary database file.

Those files are part of the SQLite implementation detail and are not part of the
abstract `GraphStore` contract.

## Constraints

- `SQLiteGraphStore` is an infrastructure adapter, not part of the abstract
  graph-store contract
- `sqlite` is the stable backend id used to select this adapter from a multi-backend
  graph-store registry
- SQLite-specific file layout, FTS behavior, schema shape, and schema-version handling
  are defined here, not in `code-graph:code-graph/graph-store`
- All SQLite scratch files and persisted database artifacts are rooted under
  `configPath`
- Storage-agnostic use cases and CLI commands MUST NOT depend on this spec unless they
  truly require SQLite-specific behavior

## Spec Dependencies

- [`code-graph:code-graph/graph-store`](../graph-store/spec.md) — abstract
  graph-store contract implemented by this adapter
- [`core:core/config`](../../../core/config/spec.md) — `configPath` and
  derived graph/temp directories
- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — persisted node
  and relation concepts
- [`code-graph:code-graph/workspace-integration`](../workspace-integration/spec.md)
  — workspace-prefixed file and spec identity rules
