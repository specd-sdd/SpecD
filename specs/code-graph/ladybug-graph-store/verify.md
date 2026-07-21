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

### Requirement: Storage generation sidecar

#### Scenario: Ladybug exposes generation changes through the sidecar

- **GIVEN** a Ladybug-backed graph root using a sidecar such as `graph/storage.epoch`
- **WHEN** the store is opened before and after a destructive recreate
- **THEN** the owning provider can observe that the generation changed

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

#### Scenario: File table persists source content for symbol snippets

- **WHEN** a source file is persisted by `LadybugGraphStore`
- **THEN** the physical `File` table includes source content sufficient to derive symbol snippets from file-backed context

### Requirement: Relationship tables

#### Scenario: COVERS_FILE and COVERS_SYMBOL are materialized in the schema

- **WHEN** the Ladybug schema is initialized for a fresh graph database
- **THEN** persisted `COVERS_FILE` and `COVERS_SYMBOL` relation families exist alongside the active code-graph relation families
- **AND** the backend is ready to store both file-level and symbol-level spec coverage

#### Scenario: COVERS_SYMBOL metadata survives Ladybug persistence

- **GIVEN** a persisted `COVERS_SYMBOL` relation with metadata `{ "stale": true }`
- **WHEN** the relation is loaded through abstract graph-store queries
- **THEN** the metadata still marks the relation as stale

### Requirement: Full-text search implementation

#### Scenario: Search indexes are rebuilt after bulk data changes

- **GIVEN** the backend has inserted symbols and specs through bulk-loading operations
- **WHEN** `rebuildFtsIndexes()` is invoked
- **THEN** Ladybug search indexes are recreated so subsequent abstract search queries see the new data

#### Scenario: Multi-token search uses OR logic for discovery

- **GIVEN** symbols "effectiveStatus" and "findBlockingParent" exist in different files
- **WHEN** `searchSymbols({ query: 'effectiveStatus findBlockingParent' })` is called
- **THEN** both symbols are returned in the results
- **AND** the Ladybug FTS query uses the `OR` operator between tokens

#### Scenario: Ranking prioritizes multiple matches for precision

- **GIVEN** symbol A contains "status", symbol B contains "effective status"
- **WHEN** `searchSymbols({ query: 'effective status' })` is called
- **THEN** symbol B has a higher relevance score than symbol A
- **AND** symbol B appears first in the results

#### Scenario: Symbol result derives snippet from file content even for comment-driven hit

- **GIVEN** a symbol search hit is returned because of matched comment text
- **WHEN** `searchSymbols(...)` returns the symbol
- **THEN** the result snippet is derived from persisted file source content at the symbol location

#### Scenario: Exact identity matches boosted in Ladybug FTS

- **GIVEN** a document with path `root:package.json`
- **WHEN** searching for `root:package.json` in the Ladybug backend
- **THEN** that document is the first result returned

#### Scenario: Persisted file content does not create Ladybug file search category

- **GIVEN** Ladybug persists file source content for snippet extraction
- **WHEN** search APIs are used through the current graph-store contract
- **THEN** there is still no separate file full-text result category introduced by this change

#### Scenario: Spec-id segment outranks content-only hit in Ladybug

- **GIVEN** a spec with ID `default:_global/architecture`
- **AND** another spec contains `architecture` more times only in its body content
- **WHEN** `searchSpecs({ query: 'architecture' })` is called on the Ladybug backend
- **THEN** `default:_global/architecture` is ranked ahead of the body-only hit

#### Scenario: Symbol declared name outranks comment-only hit in Ladybug

- **GIVEN** one symbol is named `SearchSpecs`
- **AND** another symbol contains `search specs` only in comment text
- **WHEN** `searchSymbols({ query: 'SearchSpecs' })` is called on the Ladybug backend
- **THEN** the declared-name hit is ranked ahead of the comment-only hit

#### Scenario: Alternate document path identity outranks body-only hit in Ladybug

- **GIVEN** a document whose canonical path or backend-maintained alternate path identity contains `graph-search`
- **AND** another document contains `graph search` only in body text
- **WHEN** `searchDocuments({ query: 'graph-search' })` is called on the Ladybug backend
- **THEN** the document-path hit is ranked ahead of the body-only hit

#### Scenario: Ladybug expands specd-shaped tokens before reranking

- **GIVEN** a spec with ID `core:change`
- **AND** another spec mentions `core change` only in body content
- **WHEN** `searchSpecs({ query: 'core:change' })` is called on the Ladybug backend
- **THEN** the backend treats `core:change`, `core`, and `change` as usable identity-ranking tokens
- **AND** the spec-id hit is ranked ahead of the body-only hit

#### Scenario: Ladybug expands CamelCase tokens before reranking

- **GIVEN** a symbol named `ArchiveChange`
- **AND** another symbol contains `archive change` only in comment text
- **WHEN** `searchSymbols({ query: 'ArchiveChange' })` is called on the Ladybug backend
- **THEN** the backend treats `archivechange`, `archive`, and `change` as usable identity-ranking tokens
- **AND** the declared-name hit is ranked ahead of the comment-only hit

#### Scenario: Ladybug exact token match outranks prefix token match

- **GIVEN** one candidate identity matches token `change` exactly
- **AND** another candidate identity matches `change` only by prefix
- **WHEN** `searchSymbols({ query: 'change' })` is called on the Ladybug backend
- **THEN** the exact-token hit is ranked ahead of the prefix-only hit

#### Scenario: Ladybug prefix token match outranks suffix token match

- **GIVEN** one candidate identity matches token `repo` by prefix
- **AND** another candidate identity matches `repo` only by suffix
- **WHEN** `searchSymbols({ query: 'repo' })` is called on the Ladybug backend
- **THEN** the prefix-token hit is ranked ahead of the suffix-only hit

#### Scenario: Ladybug suffix token match outranks arbitrary substring token match

- **GIVEN** one candidate identity matches token `repository` by suffix
- **AND** another candidate identity matches `repository` only as an arbitrary substring
- **WHEN** `searchDocuments({ query: 'repository' })` is called on the Ladybug backend
- **THEN** the suffix-token hit is ranked ahead of the arbitrary-substring hit

#### Scenario: Ladybug real component match outranks arbitrary substring match

- **GIVEN** one spec ID is `core:change`
- **AND** another spec ID contains substring `core` only inside a larger token such as `score`
- **WHEN** `searchSpecs({ query: 'core' })` is called on the Ladybug backend
- **THEN** the real component match is ranked ahead of the arbitrary-substring hit

#### Scenario: Ladybug supplements native discovery for a strong suffix identity hit

- **GIVEN** one symbol identity matches token `change` by suffix
- **AND** Ladybug native tokenization alone would not surface that symbol through `QUERY_FTS_INDEX`
- **WHEN** `searchSymbols({ query: 'change' })` is called on the Ladybug backend
- **THEN** the backend still returns that symbol as a candidate
- **AND** it is ordered by the same identity-strength ladder instead of being omitted for lack of native tokenizer coverage

#### Scenario: Ladybug discovers document and spec identity hits outside FTS tokenization

- **GIVEN** a document and a spec whose canonical identities are missed by backend tokenization
- **WHEN** Ladybug searches their path or spec-id suffix/component
- **THEN** document search uses `document_fts` plus identity candidates
- **AND** spec search supplements FTS candidates before ranking

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

### Requirement: Prepared statement usage

#### Scenario: User-supplied values are bound via prepared statement parameters

- **GIVEN** `LadybugGraphStore` is open and ready for queries
- **WHEN** `getFile('core:src/index.ts')` is called
- **THEN** the Cypher query uses `conn.prepare()` with `$path` parameter binding
- **AND** the path value is passed through `conn.execute(stmt, { path: 'core:src/index.ts' })`
- **AND** no string interpolation of the path value occurs in the Cypher query

#### Scenario: Relation type labels remain as compile-time constants

- **GIVEN** `LadybugGraphStore` is executing a traversal query
- **WHEN** `getCallers(symbolId)` builds a Cypher query with `CALLS|CONSTRUCTS|USES_TYPE` labels
- **THEN** the relationship type labels MAY be interpolated directly from `RelationType` enum values
- **AND** user-supplied values within the same query are still bound via `$param`

#### Scenario: DDL and COPY queries may use direct conn.query

- **GIVEN** `LadybugGraphStore` is executing schema DDL or a bulk COPY command
- **WHEN** the query contains no user-supplied parameter values
- **THEN** `conn.query()` MAY be used directly without prepared statements
