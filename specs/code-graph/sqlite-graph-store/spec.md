# SQLite Graph Store

## Purpose

`GraphStore` is the storage contract for the code graph, but SQLite has backend-specific
behavior that should not leak into the abstract port spec. This spec defines the
requirements that are specific to `SQLiteGraphStore`: its physical schema, persistence
layout, full-text search behavior, transaction model, and operational role as the
built-in default graph-store backend once it satisfies the full Ladybug feature set.

## Requirements

### Requirement: SQLite-backed implementation

`SQLiteGraphStore` SHALL implement the `GraphStore` contract using SQLite as the storage engine while preserving the abstract semantics defined by `code-graph:graph-store`.

Within a composition that supports multiple registered graph-store backends, the stable backend id for this adapter SHALL remain `sqlite`.

The adapter MUST:

- open and close a SQLite database connection safely
- execute the SQLite-specific schema DDL on first use
- keep backend-specific schema version state
- translate the abstract graph-store operations into SQLite queries, transactions, and full-text search operations
- support runtime-specific database-module binding through adapter construction or factory composition, while deferring any native module loading required by that binding until `open()`

`close()` MUST be idempotent.

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

`SQLiteGraphStore` SHALL implement the abstract `GraphStore.recreate()` capability using SQLite-specific destructive reset behavior.

When `recreate()` is invoked, the adapter MUST ensure that the next indexing run starts from a clean SQLite storage generation:

- all persisted SQLite graph data under `{configPath}/graph` is discarded
- any backend-owned companion artifacts such as WAL or shared-memory files are also discarded when they belong to the same graph persistence root
- the persisted storage-generation marker for that graph root is rotated
- the backend is ready to be opened again and rebuilt from scratch

### Requirement: Storage generation sidecar

The SQLite-backed graph persistence under `{configPath}/graph` SHALL persist a storage-generation sidecar compatible with the shared `code-graph:graph-store` stale-detection contract.

A sidecar such as `graph/storage.epoch` is an acceptable realization.

On `open()`, the adapter MUST make the current generation observable to the owning provider. On destructive recreation, the adapter MUST rotate that generation so older open providers can detect that they are stale and must be reopened.

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
consumers MUST depend on `code-graph:graph-store` instead of this spec.

### Requirement: Persisted node storage

The SQLite schema SHALL persist the logical node kinds required by the abstract graph model:

- `File` nodes for indexed source files, including persisted source content used for symbol snippet extraction
- `Symbol` nodes for extracted code symbols
- `Spec` nodes for indexed specification documents
- **`Document`** nodes for textual non-code resources
- `Meta` records for store-level metadata

The `File` table SHALL include the source content needed to derive symbol snippets from file-backed context.

The `Document` table SHALL include columns for `path` (PK), `configRelativePath`, `contentHash`, `content`, and `workspace`.

### Requirement: Persisted relation storage

The SQLite schema SHALL persist the relation families required by the abstract graph model:

- `IMPORTS`
- `DEFINES`
- `CALLS`
- `EXPORTS`
- `DEPENDS_ON`
- `COVERS_FILE`
- `COVERS_SYMBOL`
- `EXTENDS`
- `IMPLEMENTS`
- `OVERRIDES`

The adapter MAY represent relation storage with a single relation table, per-type tables, or another SQLite-appropriate layout, provided the observable `GraphStore` query semantics remain preserved.

`COVERS_SYMBOL` entries MUST preserve relation metadata so symbol-level implementation links can surface `stale` state consistently after reload.

### Requirement: SQLite full-text search

`SQLiteGraphStore` SHALL implement symbol, spec, and document search using SQLite full-text search (FTS5).

The adapter MUST:

- provide full-text search over `Document` content and paths
- keep SQLite FTS candidate generation in place for `searchSymbols()`, `searchSpecs()`, and `searchDocuments()` using the existing `MATCH` query path
- sanitize and join multi-token queries using `OR` logic for broad discovery
- expand raw query tokens with the shared specd/code-aware lexical policy before applying identity-aware ranking
- supplement the FTS candidate set with identity-derived candidates when FTS tokenization alone would miss a strong identity hit required by the abstract contract
- compute identity-aware ranking in SQL with explicit ordering columns rather than relying on BM25 weights alone
- prioritize **exact canonical identity matches** (Spec ID, Symbol Name/ID, Document Path) by boosting results where the query matches the primary identity column exactly
- prioritize **strong non-exact identity matches** ahead of generic content-only matches, including:
  - symbol declared-name equality when comment/body-only hits would otherwise rank higher
  - spec-id prefix, suffix, substring, and real component matches
  - document canonical-path or config-relative-path prefix, suffix, substring, and real component matches
- count how many expanded query tokens match the selected identity fields and use that token coverage to rank candidates that satisfy more of the query intent above candidates satisfying fewer identity tokens
- use BM25 ranking for remaining textual matches across searchable columns after identity preference is applied
- sanitize and join multi-token queries using `OR` logic for broad discovery
- derive match-aware snippets and the corresponding 1-based line range from persisted file source content or FTS matches

Observable SQLite ordering semantics MUST hold:

- exact canonical identity matches rank first
- identity-oriented non-exact hits rank ahead of body-only/comment-only/content-only hits
- exact token identity matches outrank prefix token matches
- prefix token matches outrank suffix token matches
- suffix token matches outrank arbitrary substring token matches
- real identity-component matches outrank arbitrary substring-only hits on the same identity field
- candidates matching more expanded identity tokens outrank candidates matching fewer expanded identity tokens when generic text relevance is otherwise competing
- generic term frequency in spec/document body content MUST NOT outrank a stronger spec-id, symbol-name, or document-path match for the same query intent

The SQLite FTS schema MUST include:

- **`symbol_fts`** virtual table covering `Symbol.name` and `Symbol.comment`
- **`spec_fts`** virtual table covering `Spec.title`, `Spec.description`, and `Spec.content`
- **`document_fts`** virtual table covering `Document.path` and `Document.content`

The implementation MAY use stemming, weighted BM25, identity boost unions, or other SQLite-supported ranking/indexing options, provided the abstract graph-store contract remains satisfied.

SQLite identity-aware ranking MUST be expressed through explicit SQL ordering logic over the discovered candidate set, such as computed rank columns or `CASE`-based ordering. Candidate discovery MAY combine FTS `MATCH` results with identity-derived candidates, but it MUST NOT replace FTS retrieval with plain whole-query `LIKE` filtering only.

Persisted `File` content used for snippet extraction SHALL NOT, by itself, become a separate full-text searchable file category in this change.

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
  are defined here, not in `code-graph:graph-store`
- All SQLite scratch files and persisted database artifacts are rooted under
  `configPath`
- Storage-agnostic use cases and CLI commands MUST NOT depend on this spec unless they
  truly require SQLite-specific behavior

## Spec Dependencies

- [`code-graph:graph-store`](../graph-store/spec.md) — abstract
  graph-store contract implemented by this adapter
- [`core:config`](../../../core/config/spec.md) — `configPath` and
  derived graph/temp directories
- [`code-graph:symbol-model`](../symbol-model/spec.md) — persisted node
  and relation concepts
- [`code-graph:workspace-integration`](../workspace-integration/spec.md)
  — workspace-prefixed file and spec identity rules
