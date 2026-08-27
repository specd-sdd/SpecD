# SQLite Graph Store

## Purpose

`GraphStore` is the storage contract for the code graph, but SQLite has backend-specific behavior that should not leak into the abstract port spec. This spec defines the requirements specific to `SQLiteGraphStore`: its physical schema, persistence layout, full-text search behavior, transaction model, and role as the sole built-in graph-store backend.

## Requirements

### Requirement: SQLite-backed implementation

`SQLiteGraphStore` SHALL implement the abstract `GraphStore` contract using
`better-sqlite3` as its SQLite engine while preserving the storage-neutral
semantics defined by `code-graph:graph-store`.

All synchronous SQLite queries, mutations, transactions, schema initialization,
full-text search, and backend-owned maintenance MUST execute inside a dedicated,
persistent Node.js Worker Thread (`node:worker_threads`) owned by the open store
instance. Synchronous SQLite work MUST NOT execute on the host event-loop thread.

The stable backend id SHALL remain `sqlite`. Runtime-specific native binding
resolution MUST be deferred until `open()`, and `close()` MUST remain
idempotent.

### Requirement: Worker-backed non-blocking execution

`SQLiteGraphStore` SHALL manage worker isolation and communication according
to these invariants:

1. Each open store owns exactly one persistent worker and one SQLite connection.
   Workers MUST NOT be created per operation or pooled. Concurrent `open()` or
   `close()` calls MUST share their respective in-flight lifecycle Promise.
2. The worker owns the `better-sqlite3` connection, prepared statements,
   transactions, schema work, FTS maintenance, and backend-owned filesystem work.
   Native handles and prepared statements MUST NOT cross the worker boundary.
3. Host and worker communicate through strongly typed, structured-cloneable
   request, result, error, and progress DTOs with monotonic correlation ids.
   Functions, native objects, and class instances MUST NOT cross the boundary.
4. The worker MUST process operations through an explicit FIFO serial queue so
   lifecycle, maintenance, reads, and mutations do not interleave.
5. The host client MUST validate `maxPendingOperations >= 1` and enforce a
   default limit of 256 outstanding operations. A request beyond the limit MUST
   reject immediately with `StoreOverloadError` without disturbing accepted work.
6. `close()` MUST reject new work, drain accepted operations within
   `drainTimeoutMs` (default 5 000 ms), request worker-side database closure,
   and force termination after the graceful deadline. Unsettled requests MUST
   reject with `StoreWorkerError`. The store MUST await forced termination but
   MUST NOT claim a hard wall-clock bound while native code is executing.
7. SQLite runtime configuration crossing the boundary MUST use a serializable
   `SqliteRuntimeDescriptor`. A custom `modulePath` MAY select a compatible
   runtime binding. Internal worker-path test overrides MUST NOT be public options.
8. Unexpected worker error or exit MUST fault the store and reject outstanding
   operations with `StoreWorkerError`. Recovery is explicit `close()` then
   `open()`; the store MUST NOT silently restart.
9. If `close()` begins while `open()` is pending, shutdown MUST own the final
   lifecycle state and `open()` MUST NOT subsequently publish `open`.
10. Bulk indexing MUST use a worker-side session identified by `sessionId`.
    Only session start creates state; staging, commit, and rollback against a
    missing or finalized session MUST reject. Host sessions MUST enforce explicit
    active, committing, rolling-back, and finished states and bind to the current
    store lifecycle generation.
11. Progress callbacks are observational. Callback failures MUST be isolated and
    MUST NOT abort the worker operation or transaction.
12. Closed-store recreation MUST use non-blocking host filesystem APIs for cleanup
    and storage-generation rotation.

### Requirement: Worker-efficient batch reads

SQLite SHALL implement the batch symbol and relation queries defined by
`GraphStore` as set-based worker operations. One batch call MUST cross the
worker boundary as one RPC rather than one RPC per symbol or relation type.

Batch symbol lookup SHALL use set-based predicates. Incoming and outgoing
relation lookup SHALL query all requested symbol ids and relation types together.
Large input sets MUST be divided into deterministic bounded SQL parameter chunks
inside the worker so SQLite parameter limits cannot make a valid graph traversal
fail. Results MUST preserve the deterministic ordering and empty-input semantics
of the abstract contract.

### Requirement: Worker-backed exact batch node lookups

SQLite SHALL implement the exact batch node lookups defined by `GraphStore`
(`getFilesByPaths`, `getDocumentsByPaths`, `getSpecsByIds`, and the existing
`getSymbolsByIds`) as set-based worker operations. Each logical batch MUST cross
the worker boundary once as one typed RPC and MUST NOT issue one RPC per node.

File, document, spec, and symbol lookups SHALL use set-based predicates
(`path IN (...)`, `id IN (...)`). Large input sets MUST be divided into
deterministic bounded SQL parameter chunks inside the worker. Results MUST
deduplicate repeated identities, omit unknown identities, preserve first
requested-identity order, and return an empty array for empty input without RPC.

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

The built-in code-graph composition SHALL register `sqlite` as its sole built-in backend and SHALL select it when no explicit `graphStoreId` is provided.

SQLite MUST satisfy the current `GraphStore` contract and all code-graph consumer requirements directly, including:

- durable persistence of file, document, symbol, spec, relation, and metadata state
- atomic mutation semantics required by the abstract `GraphStore` contract
- full-text and identity-aware search required by symbol, file, spec, and document discovery
- bulk indexing and full re-index operations
- structured query support for traversal, references, coverage, impact, hotspots, search, and statistics

SQLite defines its own storage layout, query behavior, and output contract. If an existing graph cannot be read after a backend change, a full SQLite re-index is the supported recovery path.

### Requirement: Destructive recreation

`SQLiteGraphStore.recreate()` SHALL implement physical recovery only after the
SQLite worker and database are closed. It MUST reject while open, remove the graph
persistence directory including SQLite companion files, rotate the storage
generation, and return with no worker or database handle reopened.

SQLite open validation SHALL translate only known corruption and non-migratable
schema conditions to the abstract typed recoverable storage-open error after closing
any partial database resources. Permission, configuration, native-runtime, and
unrelated I/O errors MUST propagate without recreation authority.

A healthy forced reindex SHALL use the existing opened-store logical clear path and
MUST NOT implement force by closing, deleting, reopening, or re-closing SQLite.

### Requirement: SQLite logical clear parity

The SQLite implementation of `clear()` SHALL execute one atomic logical-generation reset while the worker remains open. The transaction MUST remove physical graph rows, specs, relations, indexed-input observations, index-coverage rows, logical symbols and declarations, public and local bindings, reference and resolution facts, freshness latches, derivation metadata, and full-text index contents that belong to the cleared generation.

After commit, an indexing run MUST NOT observe a content hash, semantic row, or coverage record from the cleared generation as authority to skip a discovered input. Failure during clear MUST roll back to the previously committed logical generation.

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

The SQLite schema SHALL persist every relation family required by the abstract
graph model:

- `IMPORTS`
- `DEFINES`
- `CALLS`
- `CONSTRUCTS`
- `USES_TYPE`
- `EXPORTS`
- `DEPENDS_ON`
- `COVERS_FILE`
- `COVERS_SYMBOL`
- `EXTENDS`
- `IMPLEMENTS`
- `OVERRIDES`

The adapter MAY choose a SQLite-appropriate physical layout, provided all
observable `GraphStore` semantics remain preserved. `COVERS_SYMBOL` entries
MUST preserve relation metadata so stale symbol-level links survive reload.

### Requirement: SQLite logical coverage integrity

SQLite bulk relation validation SHALL treat a logical-symbol row as the required target endpoint for `COVERS_SYMBOL`. A physical declaration-occurrence symbol row alone MUST NOT satisfy that endpoint contract for newly projected coverage.

The same committed transaction SHALL persist logical symbols before validating and inserting their coverage relations. Valid logical coverage MUST survive relation deduplication, reverse-coverage indexing, statistics, worker serialization, and subsequent abstract `GraphStore` reads with its target ID and metadata unchanged.

A `COVERS_SYMBOL` relation with a missing spec source or missing logical-symbol target SHALL be rejected from the committed relation set and reported through the indexing diagnostic contract rather than being silently accepted or retargeted.

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

`SQLiteGraphStore` SHALL execute SQLite transactions entirely inside the worker
to preserve the atomic mutation semantics required by `GraphStore`.

A transaction MUST NOT span multiple host/worker round trips. Each atomic
mutation, including `upsertFile()`, `removeFile()`, `upsertSpec()`,
`removeSpec()`, and bulk commit, MUST execute as one self-contained worker
operation. Failure MUST preserve the previously committed graph state.

### Requirement: Bulk indexing support

`SQLiteGraphStore` SHALL support efficient bulk indexing for large repositories.

Bulk data MUST be staged to a worker-side session in bounded chunks rather than
transferred as one repository-sized structured-clone payload. Commit MUST make
the complete session visible atomically in one SQLite transaction. Reference-fact
chunks MUST merge with earlier chunks from the same session.

The worker MUST emit serializable progress stages for cleanup, files, documents,
symbols, specs, reference facts, observations, relations, and search indexes.
The host SHALL forward them to the optional observational callback.

Prepared statements, temporary tables, and bounded SQL chunks MAY be used to keep
the run stable. Any scratch artifacts MUST remain under `{configPath}/tmp`.

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

### Requirement: Reference schema upgrade

SQLite SHALL persist the logical-symbol, declaration, member, symbol-space,
binding, provenance, coverage, construct-range, and selection-range fields
required by `GraphStore`. Structured lookup columns SHALL be indexed; serialized
canonical ids MUST NOT be parsed or substring-ranked to implement semantic lookup.
Canonical ids remain unique external identities; backend-local integer row keys
MAY be used for physical joins when provider-visible ids do not change.

SQLite SHALL maintain the substring-capable source-content index and bounded
short-query fallback required by the abstract store. Reverse coverage and new
traversal batch reads SHALL use set-based predicates and deterministic ordering.

The backend SHALL track reference schema version `9`. A later schema-affecting
change SHALL increment the version exactly once. Incompatible data MUST reject
ordinary reads; `graph index` SHALL rebuild destructively, rotate
`storage.epoch`, and rebuild search indexes before readiness.

Indexed-input observations, freshness latches, VCS evidence, and compact
unchanged-file facts SHALL remain persisted. One indexing run SHALL use one
transaction, set-based endpoint validation, bounded writes, one commit, and one
semantic/content index rebuild.

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

## ADRs

- [ADR-0025: Non-Blocking Worker-Thread SQLite Graph Store](../../../docs/adr/0025-nonblocking-worker-sqlite-graph-store.md) — the built-in SQLite backend executes on a persistent worker thread
