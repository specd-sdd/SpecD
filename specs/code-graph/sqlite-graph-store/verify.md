# Verification: SQLite Graph Store

## Requirements

### Requirement: SQLite-backed implementation

#### Scenario: Backend initialization stays inside the adapter

- **WHEN** `SQLiteGraphStore.open()` is called through the abstract `GraphStore`
  lifecycle
- **THEN** the adapter initializes its persistent worker, SQLite-specific connection, and schema state
  before serving queries
- **AND** storage-agnostic callers do not need to know any SQLite DDL or query details

#### Scenario: Host event loop remains responsive during long-running SQLite operation

- **GIVEN** a SQLite operation is executing within the worker thread
- **WHEN** an unrelated timer or microtask is scheduled on the host event loop
- **THEN** the host timer/microtask executes and completes without waiting for the SQLite operation to finish

### Requirement: Worker-backed non-blocking execution

#### Scenario: Single persistent worker per open store lifecycle

- **WHEN** `SQLiteGraphStore.open()` is invoked
- **THEN** exactly one persistent worker thread is spawned and initialized
- **AND** subsequent store operations reuse the running worker thread without spawning new workers
- **AND** `SQLiteGraphStore.close()` cleanly terminates the worker thread and connection

#### Scenario: Concurrent open and close calls share in-flight promises

- **GIVEN** multiple callers invoke `open()` or `close()` concurrently
- **WHEN** initialization or shutdown is in progress
- **THEN** all callers share and resolve the same in-flight Promise without duplicate worker spawns or race conditions

#### Scenario: Concurrent caller request correlation and FIFO execution

- **GIVEN** multiple asynchronous callers dispatch queries concurrently to an open `SQLiteGraphStore`
- **WHEN** the requests are processed serially by the worker execution queue in FIFO order
- **THEN** each caller receives its exact matching result correlated by monotonic request ID

#### Scenario: Bounded operation backpressure rejects on queue overflow

- **GIVEN** an open `SQLiteGraphStore` with a strictly validated positive capacity limit (`maxPendingOperations >= 1`)
- **WHEN** the number of outstanding pending requests reaches the capacity limit
- **THEN** new incoming requests reject immediately with `StoreOverloadError`
- **AND** existing in-flight requests continue processing normally

#### Scenario: Graceful close drains in-flight operations before terminating worker

- **GIVEN** an open `SQLiteGraphStore` with accepted pending operations
- **WHEN** `close()` is invoked
- **THEN** new incoming operations reject with `StoreNotOpenError`
- **AND** all previously accepted pending operations are drained to completion before the worker closes the SQLite database and terminates

#### Scenario: Recreate serializes exclusively against concurrent reads and writes

- **GIVEN** concurrent queries and a `recreate()` operation dispatched to the store
- **WHEN** the worker serial execution queue processes them in order
- **THEN** earlier queries complete before recreation, recreation finishes cleanly, and subsequent queries execute against the freshly recreated store without race conditions

#### Scenario: Serializable runtime descriptor loads custom module in worker

- **GIVEN** a `SqliteRuntimeDescriptor` specifying a custom `modulePath`
- **WHEN** `SQLiteGraphStore.open()` starts the worker
- **THEN** the worker dynamically loads the specified SQLite module inside its execution context without requiring function-valued loaders across IPC

#### Scenario: Deterministic error propagation on unexpected worker termination and manual recovery

- **GIVEN** an open `SQLiteGraphStore` with in-flight and pending operations
- **WHEN** the worker thread crashes or is terminated unexpectedly
- **THEN** all outstanding Promises reject immediately with `StoreWorkerError`
- **AND** the store transitions to `faulted` state
- **AND** manual recovery is achieved by calling `close()` followed by `open()`

#### Scenario: close() called while open() is in-flight does not expose open state

- **GIVEN** `open()` has been called but has not yet received the worker ACK
- **WHEN** `close()` is called concurrently
- **THEN** `close()` waits for the in-flight `open()` promise before proceeding
- **AND** `open()` does NOT transition the store to `'open'` state
- **AND** the store completes shutdown and reaches `'closed'` state without ever
  being observable in the `'open'` state

#### Scenario: Drain timeout forces worker termination and rejects stuck requests

- **GIVEN** an open `SQLiteGraphStore` with a pending request that will not complete
- **WHEN** `close()` is called and the drain timeout expires
- **THEN** the `close` RPC is NOT sent to the worker
- **AND** all remaining pending requests reject with `StoreWorkerError`
- **AND** forced worker termination (`worker.terminate()`) is initiated
- **AND** the store reaches `'closed'` state after the forced termination concludes

#### Scenario: Worker crash during opening leaves deterministic faulted state

- **GIVEN** `open()` has been called but the worker exits before sending the `open` ACK
- **WHEN** the unexpected worker exit is detected
- **THEN** the store transitions to `'faulted'` state (not `'closed'`)
- **AND** the `open()` promise rejects with a `StoreWorkerError`
- **AND** callers can recover by calling `close()` followed by `open()`

#### Scenario: closePromise is always cleared after open() fails during concurrent close()

- **GIVEN** `open()` is in-flight and `close()` is called concurrently
- **WHEN** the `open()` operation fails (e.g. worker crashes during startup)
- **THEN** `close()` settles without hanging
- **AND** a subsequent `close()` call executes the correct recovery path (not the
  stale in-flight promise)
- **AND** a subsequent `open()` + `close()` cycle succeeds without error

#### Scenario: close() gives up graceful shutdown and force-terminates when worker ignores the close RPC

- **GIVEN** an open store whose worker responds to `open` but deliberately ignores `close`
- **WHEN** `close(N)` is called (N milliseconds)
- **THEN** graceful shutdown gives up at approximately N milliseconds
- **AND** forced worker termination is initiated and awaited to conclusion
- **AND** the store reaches `'closed'` state

#### Scenario: Bulk session staging rejects writes while a commit or rollback is in flight

- **GIVEN** an active `IndexWriteSession` with a `commit()` or `rollback()` already invoked
- **WHEN** another write, removal, commit, or rollback is attempted concurrently
- **THEN** the concurrent operation rejects with a session-state error
- **AND** the original commit or rollback completes unaffected

#### Scenario: Staging cannot resurrect a committed or rolled-back session

- **GIVEN** a bulk index session that has been committed, rolled back, closed, or recreated
- **WHEN** a subsequent staging RPC targets the same session id
- **THEN** the staging operation rejects and does not create a new worker-side session

#### Scenario: Reference-facts chunks staged in one session are merged, not replaced

- **GIVEN** two `writeReferenceFacts()` calls against the same `IndexWriteSession`
- **WHEN** the session is committed
- **THEN** reference facts from both chunks are persisted together

#### Scenario: Bulk session staging works under maxPendingOperations = 1

- **GIVEN** an open `SQLiteGraphStore` configured with `maxPendingOperations: 1`
- **WHEN** a full bulk session performs begin, staging, and commit
- **THEN** no `StoreOverloadError` is raised because the begin RPC is shared and awaited
  rather than dispatched fire-and-forget

#### Scenario: bulkLoad() stages chunked data instead of one giant payload

- **GIVEN** a large set of files, symbols, specs, and relations passed to `bulkLoad()`
- **WHEN** the bulk load commits
- **THEN** entities are staged in bounded chunks and committed atomically in one
  worker transaction without a single complete-graph structured-clone message

#### Scenario: Progress callback exceptions are isolated silently

- **GIVEN** a bulk index operation registered with an `onProgress` handler that throws an Error
- **WHEN** progress stage events are emitted by the worker
- **THEN** the progress handler exception is isolated silently
- **AND** the bulk index operation completes successfully without unhandled rejections

#### Scenario: SpecNotFoundError preserves specId across worker error serialization roundtrip

- **GIVEN** a `SpecNotFoundError` for spec `"core:specs/auth.spec.md"` thrown in worker
- **WHEN** the error payload is serialized and deserialized on the host
- **THEN** the reconstructed error is an instance of `SpecNotFoundError`
- **AND** `error.specId` matches `"core:specs/auth.spec.md"`

#### Scenario: Closed store recreate executes non-blocking async filesystem cleanup

- **GIVEN** a closed `SQLiteGraphStore`
- **WHEN** `recreate()` is invoked
- **THEN** `rm` and `rotateStorageGenerationAsync` execute asynchronously on host
- **AND** no worker thread is spawned
- **AND** subsequent store `open()` starts with a fresh schema without residual WAL/SHM files

#### Scenario: Chunked bulk sessions are invalidated on store close, worker crash, or recreate

- **GIVEN** an active `IndexWriteSession` created via `beginBulkIndexSession()`
- **WHEN** the store is closed, the worker crashes, or `recreate()` is called
- **THEN** subsequent calls to `session.writeFiles()`, `session.commit()`, or `session.rollback()` reject with `StoreNotOpenError`

### Requirement: Worker-efficient batch reads

#### Scenario: Logical batch crosses the worker boundary once

- **GIVEN** a batch contains several symbol ids and several supported relation types
- **WHEN** symbols, incoming relations, or outgoing relations are requested
- **THEN** each logical batch is sent as one worker RPC
- **AND** the worker executes set-based lookup rather than one RPC per symbol or relation type

#### Scenario: Large batches are chunked transparently inside the worker

- **GIVEN** a batch exceeds SQLite's safe parameter count
- **WHEN** the worker executes the batch query
- **THEN** it divides the query into deterministic bounded SQL parameter chunks
- **AND** the merged result preserves the abstract contract's deterministic order
- **AND** no valid requested symbol or relation is lost or duplicated

#### Scenario: Empty batch avoids worker and SQLite work

- **WHEN** a batch symbol query has no symbol ids or a relation query has no ids or relation types
- **THEN** it returns an empty array without dispatching a worker RPC or executing SQL

### Requirement: Worker-backed exact batch node lookups

#### Scenario: Exact batch node lookup crosses the worker boundary once

- **GIVEN** many file paths, document paths, spec ids, or symbol ids are requested together
- **WHEN** `getFilesByPaths`, `getDocumentsByPaths`, `getSpecsByIds`, or `getSymbolsByIds` is invoked
- **THEN** the whole logical batch is sent as one typed worker RPC
- **AND** the worker executes one set-based query rather than one RPC per node

#### Scenario: Large exact batch is chunked transparently inside the worker

- **GIVEN** an exact batch exceeds SQLite's safe parameter count
- **WHEN** the worker executes the batch query
- **THEN** it divides the query into deterministic bounded SQL parameter chunks
- **AND** the merged result deduplicates repeated identities, omits unknown identities,
  and preserves first requested-identity order

#### Scenario: Empty exact batch avoids worker and SQLite work

- **WHEN** an exact batch node query has no paths, ids, or spec ids
- **THEN** it returns an empty array without dispatching a worker RPC or executing SQL

### Requirement: Config-derived persistence layout

#### Scenario: Graph and tmp directories are derived from configPath

- **GIVEN** project config resolves `configPath` to `/repo/.specd/config`
- **WHEN** `SQLiteGraphStore.open()` or a backend-owned indexing operation needs
  filesystem storage
- **THEN** persistent SQLite files are created only under `/repo/.specd/config/graph`
- **AND** scratch artifacts are created only under `/repo/.specd/config/tmp`

### Requirement: Default backend role

#### Scenario: SQLite is the sole built-in default backend

- **GIVEN** no external graph-store factories are supplied
- **WHEN** provider composition is created without an explicit `graphStoreId`
- **THEN** `sqlite` is selected
- **AND** no other backend id is registered

#### Scenario: SQLite satisfies current Code Graph consumers directly

- **WHEN** indexing, references, coverage, search, stats, traversal, impact, and hotspot flows run through the default backend
- **THEN** they satisfy their current graph contracts through `SQLiteGraphStore`
- **AND** their assertions rely only on the current SQLite-backed contract

#### Scenario: Re-index is the recovery boundary

- **GIVEN** persisted graph data is absent or incompatible after changing backend ownership
- **WHEN** the user performs a full graph re-index
- **THEN** SQLite rebuilds the graph from source and specs without a compatibility-migration path

### Requirement: Destructive recreation

#### Scenario: Recreate discards SQLite-owned graph files under the graph root

- **GIVEN** SQLite persistence already exists under `{configPath}/graph`
- **WHEN** `SQLiteGraphStore.recreate()` is invoked through the abstract force-reset
  path
- **THEN** the previously persisted SQLite graph state is discarded
- **AND** any SQLite-owned companion artifacts in the same graph root are discarded
  with it
- **AND** callers do not target SQLite filenames directly

### Requirement: Storage generation sidecar

#### Scenario: SQLite exposes generation changes through the sidecar

- **GIVEN** a SQLite-backed graph root using a sidecar such as `graph/storage.epoch`
- **WHEN** the store is opened before and after a destructive recreate
- **THEN** the owning provider can observe that the generation changed

### Requirement: SQLite schema ownership

#### Scenario: Physical schema remains backend-specific

- **WHEN** storage-agnostic use cases depend on `GraphStore`
- **THEN** they rely only on abstract node and relation semantics
- **AND** SQLite table names, virtual tables, indexes, and storage columns remain
  internal to `SQLiteGraphStore`

### Requirement: Persisted node storage

#### Scenario: Logical node kinds survive backend-specific layout choices

- **WHEN** files, symbols, specs, and metadata are persisted by `SQLiteGraphStore`
- **THEN** the abstract graph-store queries can retrieve the expected logical node kinds
- **AND** callers do not need to know whether SQLite uses one table per kind or another internal layout

#### Scenario: File node persistence includes source content for symbol snippets

- **WHEN** a source file is persisted by `SQLiteGraphStore`
- **THEN** the persisted file record includes source content sufficient to derive symbol snippets from file-backed context
- **AND** symbol preview extraction does not require a separate persisted snippet field per symbol

### Requirement: Persisted relation storage

#### Scenario: All required relation families are stored

- **WHEN** the SQLite schema is initialized for a fresh graph database
- **THEN** persisted storage exists for `IMPORTS`, `DEFINES`, `CALLS`, `CONSTRUCTS`,
  `USES_TYPE`, `EXPORTS`, `DEPENDS_ON`, `COVERS_FILE`, `COVERS_SYMBOL`, `EXTENDS`,
  `IMPLEMENTS`, and `OVERRIDES`

#### Scenario: COVERS_SYMBOL metadata survives SQLite persistence

- **GIVEN** a persisted `COVERS_SYMBOL` relation with metadata `{ "stale": true }`
- **WHEN** the relation is loaded through abstract graph-store queries
- **THEN** the metadata still marks the relation as stale

### Requirement: SQLite full-text search

#### Scenario: Symbol and spec search use SQLite full-text search

- **GIVEN** symbols and specs have been indexed into SQLite
- **WHEN** abstract search methods are called
- **THEN** results come back in descending relevance order from SQLite-backed full-text search structures

#### Scenario: Multi-token search uses OR logic for discovery

- **GIVEN** symbols "effectiveStatus" and "findBlockingParent" exist in different files
- **WHEN** `searchSymbols({ query: 'effectiveStatus findBlockingParent' })` is called
- **THEN** both symbols are returned in the results
- **AND** the FTS5 MATCH clause uses the `OR` operator between tokens

#### Scenario: BM25 ranking prioritizes multiple matches for precision

- **GIVEN** symbol A contains "status", symbol B contains "effective status"
- **WHEN** `searchSymbols({ query: 'effective status' })` is called
- **THEN** symbol B has a higher relevance score than symbol A
- **AND** symbol B appears first in the results

#### Scenario: Symbol result derives snippet from file content even for comment-driven hit

- **GIVEN** a symbol search hit is returned because of matched comment text
- **WHEN** `searchSymbols(...)` returns the symbol
- **THEN** the result snippet is derived from persisted file source content at the symbol location

#### Scenario: FTS structures can be refreshed after bulk writes

- **GIVEN** the backend has inserted symbols and specs through bulk-loading operations
- **WHEN** `rebuildFtsIndexes()` is invoked
- **THEN** subsequent abstract search queries see the newly indexed data

#### Scenario: Queries with hyphens do not crash FTS5

- **GIVEN** symbols and specs have been indexed into SQLite
- **WHEN** `searchSymbols({ query: 'pending-parent-artifact-review' })` is called
- **THEN** no `SqliteError` is thrown
- **AND** results matching the literal search term are returned

#### Scenario: Queries with FTS5 operators are treated as literal text

- **GIVEN** symbols and specs have been indexed into SQLite
- **WHEN** `searchSpecs({ query: 'AND OR NOT' })` is called
- **THEN** the query does not perform boolean logic
- **AND** results matching the literal terms are returned

#### Scenario: Exact identity matches boosted in SQLite FTS

- **GIVEN** a spec with ID `core:change`
- **WHEN** searching for `core:change` in the SQLite backend
- **THEN** that spec is the first result returned

#### Scenario: Persisted file content does not create SQLite file search category

- **GIVEN** SQLite persists file source content for snippet extraction
- **WHEN** search APIs are used through the current graph-store contract
- **THEN** there is still no separate file full-text result category introduced by this change

#### Scenario: Spec-id segment outranks content-only hit in SQLite

- **GIVEN** a spec with ID `default:_global/architecture`
- **AND** another spec contains `architecture` more times only in its body content
- **WHEN** `searchSpecs({ query: 'architecture' })` is called on the SQLite backend
- **THEN** `default:_global/architecture` is ranked ahead of the body-only hit

#### Scenario: Symbol declared name outranks comment-only hit in SQLite

- **GIVEN** one symbol is named `SearchSpecs`
- **AND** another symbol contains `search specs` only in comment text
- **WHEN** `searchSymbols({ query: 'SearchSpecs' })` is called on the SQLite backend
- **THEN** the declared-name hit is ranked ahead of the comment-only hit

#### Scenario: Config-relative document path participates in identity ranking

- **GIVEN** a document whose canonical path or `configRelativePath` contains `docs/cli/graph-search.md`
- **AND** another document mentions `graph search` only in body text
- **WHEN** `searchDocuments({ query: 'graph-search' })` is called on the SQLite backend
- **THEN** the document-path hit is ranked ahead of the body-only hit

#### Scenario: SQLite expands specd-shaped tokens before identity ranking

- **GIVEN** a spec with ID `core:change`
- **AND** another spec mentions `core change` only in body content
- **WHEN** `searchSpecs({ query: 'core:change' })` is called on the SQLite backend
- **THEN** the backend treats `core:change`, `core`, and `change` as usable identity-ranking tokens
- **AND** the spec-id hit is ranked ahead of the body-only hit

#### Scenario: SQLite expands CamelCase tokens before identity ranking

- **GIVEN** a symbol named `ArchiveChange`
- **AND** another symbol contains `archive change` only in comment text
- **WHEN** `searchSymbols({ query: 'ArchiveChange' })` is called on the SQLite backend
- **THEN** the backend treats `archivechange`, `archive`, and `change` as usable identity-ranking tokens
- **AND** the declared-name hit is ranked ahead of the comment-only hit

#### Scenario: SQLite exact token match outranks prefix token match

- **GIVEN** one candidate identity matches token `change` exactly
- **AND** another candidate identity matches `change` only by prefix
- **WHEN** `searchSymbols({ query: 'change' })` is called on the SQLite backend
- **THEN** the exact-token hit is ranked ahead of the prefix-only hit

#### Scenario: SQLite prefix token match outranks suffix token match

- **GIVEN** one candidate identity matches token `repo` by prefix
- **AND** another candidate identity matches `repo` only by suffix
- **WHEN** `searchSymbols({ query: 'repo' })` is called on the SQLite backend
- **THEN** the prefix-token hit is ranked ahead of the suffix-only hit

#### Scenario: SQLite suffix token match outranks arbitrary substring token match

- **GIVEN** one candidate identity matches token `repository` by suffix
- **AND** another candidate identity matches `repository` only as an arbitrary substring
- **WHEN** `searchDocuments({ query: 'repository' })` is called on the SQLite backend
- **THEN** the suffix-token hit is ranked ahead of the arbitrary-substring hit

#### Scenario: SQLite real component match outranks arbitrary substring match

- **GIVEN** one spec ID is `core:change`
- **AND** another spec ID contains substring `core` only inside a larger token such as `score`
- **WHEN** `searchSpecs({ query: 'core' })` is called on the SQLite backend
- **THEN** the real component match is ranked ahead of the arbitrary-substring hit

#### Scenario: SQLite supplements FTS discovery for a strong suffix identity hit

- **GIVEN** one symbol identity matches token `change` by suffix
- **AND** SQLite FTS tokenization alone would not surface that symbol through the default `MATCH` candidate set
- **WHEN** `searchSymbols({ query: 'change' })` is called on the SQLite backend
- **THEN** the backend still returns that symbol as a candidate
- **AND** it is ordered by the same identity-strength ladder instead of being omitted for lack of FTS coverage

### Requirement: Transactional mutation model

#### Scenario: File upsert is all-or-nothing

- **WHEN** `upsertFile()` is invoked
- **THEN** the complete file-level graph replacement executes within a single worker-side transaction
- **AND** if an error occurs during replacement, previous graph state remains intact

#### Scenario: Bulk indexing batch is all-or-nothing

- **WHEN** a bulk index commit payload is transferred to the worker
- **THEN** the batch commits atomically within a single worker transaction without intermediate host RPC round-trips

### Requirement: Bulk indexing support

#### Scenario: Large indexing runs use backend-specific batching safely

- **WHEN** a repository is indexed in bulk through `SQLiteGraphStore`
- **THEN** the staged payload is committed atomically in the worker
- **AND** serializable progress events are received and forwarded to the caller's progress callback

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

### Requirement: Reference schema upgrade

#### Scenario: SQLite old schema rebuilds safely

- **GIVEN** schema version 8 and the reference schema expects 9
- **WHEN** normal read and then graph index are attempted
- **THEN** read rejects without empty recreation
- **AND** index rotates generation, rebuilds fields/FTS, and opens the new version

#### Scenario: SQLite source search preserves occurrence and range semantics

- **GIVEN** source content, construct ranges, and selection ranges were bulk indexed
- **WHEN** full, raw, expanded, and short source queries are executed with filters
- **THEN** SQLite returns bounded substring candidates equivalent to the abstract Store contract
- **AND** ranges round-trip without converting half-open coordinates

#### Scenario: SQLite semantic queries use structured indexes

- **GIVEN** logical symbols and bindings with canonical ids containing overlapping serialized components
- **WHEN** exact-name, owner/member, surface/export, case-precedence, and ambiguity queries run
- **THEN** SQLite resolves them through indexed structured columns without parsing or substring-ranking canonical ids
- **AND** provider-visible canonical ids remain unchanged

#### Scenario: SQLite batches reverse coverage and rebuilds FTS once

- **WHEN** a bulk generation containing coverage and source content commits
- **THEN** reverse file/symbol coverage is queryable in batches
- **AND** semantic and source-content FTS structures are rebuilt once after commit
