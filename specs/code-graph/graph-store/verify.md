# Verification: Graph Store

## Requirements

### Requirement: GraphStore port

#### Scenario: GraphStore is an abstract class

- **WHEN** a concrete implementation of `GraphStore` is instantiated
- **THEN** it receives `storagePath` as a constructor parameter
- **AND** it is defined in `domain/ports/` following hexagonal architecture

### Requirement: Connection lifecycle

#### Scenario: Operation before open throws

- **WHEN** `getFile()` is called on a `GraphStore` that has not been opened
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Operation after close throws

- **GIVEN** a `GraphStore` that was opened and then closed
- **WHEN** `upsertFile()` is called
- **THEN** `StoreNotOpenError` is thrown

#### Scenario: Open prepares the concrete backend before queries run

- **WHEN** `open()` resolves for a concrete `GraphStore` implementation
- **THEN** subsequent reads and writes can proceed through the abstract contract
- **AND** any schema initialization, index preparation, or migration work remains hidden behind the backend

### Requirement: Minimum graph semantics

#### Scenario: Backend preserves canonical and config-relative file identity

- **WHEN** indexing and query features use the abstract `GraphStore`
- **THEN** file nodes retain both canonical workspace-prefixed `path` values and `configRelativePath` values needed for CLI lookup
- **AND** storage-agnostic consumers do not depend on backend-specific column or label names

#### Scenario: Backend persists file source content for preview extraction

- **WHEN** a backend advertises conformance to `GraphStore`
- **THEN** persisted file nodes carry source content sufficient to derive symbol snippets from file-backed context
- **AND** consumers do not need per-symbol persisted snippet blobs to render symbol previews

#### Scenario: Backend persists scoped-binding dependency relations

- **WHEN** a backend advertises conformance to `GraphStore`
- **THEN** its persisted relation model includes `CALLS`, `CONSTRUCTS`, and `USES_TYPE`
- **AND** these relations remain queryable through the abstract dependency methods

#### Scenario: Backend persists derivation metadata

- **WHEN** a graph has been indexed successfully
- **THEN** the store can persist and later return `lastIndexedAt`, `lastIndexedRef`, and the graph fingerprint

#### Scenario: Backend persists spec coverage relation families

- **WHEN** a backend advertises conformance to `GraphStore`
- **THEN** its persisted relation model includes `COVERS_FILE` and `COVERS_SYMBOL`
- **AND** these relations remain queryable through the abstract coverage methods

#### Scenario: Symbol coverage metadata survives round-trip

- **GIVEN** a `COVERS_SYMBOL` relation with metadata `{ "stale": true }`
- **WHEN** it is persisted and loaded back through the abstract `GraphStore`
- **THEN** the returned relation preserves that metadata without backend-specific decoding

### Requirement: Store recreation

#### Scenario: Recreate drops prior persisted graph state

- **GIVEN** a backend with previously indexed files, symbols, specs, and relations
- **WHEN** `recreate()` is called through the abstract `GraphStore` contract
- **THEN** the prior persisted graph state is discarded
- **AND** the backend is ready for a fresh indexing run

#### Scenario: Callers do not manage backend files directly

- **WHEN** a caller needs a destructive reset before indexing
- **THEN** it uses `GraphStore.recreate()`
- **AND** it does not need to know backend-specific database files, lock files, WAL files, or schema artifacts

### Requirement: Storage generation tracking

#### Scenario: Recreate rotates the persisted storage generation

- **GIVEN** a persisted graph store with an existing storage-generation marker
- **WHEN** `recreate()` completes
- **THEN** the next opened provider observes a different storage generation
- **AND** previously opened providers can detect that they are stale

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

- **GIVEN** a spec `core:change` with 2 `DEPENDS_ON` relations in the store
- **WHEN** `upsertSpec()` is called with 3 new `DEPENDS_ON` relations
- **THEN** the store contains exactly 3 `DEPENDS_ON` relations for that spec

#### Scenario: Remove spec cleans up all relations

- **GIVEN** a spec `core:config` that is both a source and target of `DEPENDS_ON` relations
- **WHEN** `removeSpec('core:config')` is called
- **THEN** the `SpecNode` and all `DEPENDS_ON` relations where it appears as source or target are removed

### Requirement: Search with primary-identity prioritization

#### Scenario: Symbol search matches normalized compound names

- **GIVEN** symbols `createUser`, `deleteUser`, and `listOrders` are indexed
- **WHEN** `searchSymbols({ query: 'user' })` is called
- **THEN** `createUser` and `deleteUser` are returned ahead of unrelated symbols

#### Scenario: Symbol search includes comments

- **GIVEN** a symbol with comment text containing `Validates the user's authentication token`
- **WHEN** `searchSymbols({ query: 'authentication token' })` is called
- **THEN** that symbol is returned

#### Scenario: Symbol search result includes file-backed snippet

- **GIVEN** a matching symbol with a persisted source file and recorded location
- **WHEN** `searchSymbols(...)` returns that symbol
- **THEN** the result includes a `snippet` preview derived from persisted file source content around the symbol location

#### Scenario: Spec search matches description and content

- **GIVEN** a spec whose description mentions `adapter parsing`
- **AND** another spec whose content contains `lifecycle state transition`
- **WHEN** the corresponding queries are issued through `searchSpecs`
- **THEN** the matching spec is returned in each case with a relevance score

#### Scenario: Spec search result includes snippet

- **WHEN** `searchSpecs(...)` returns a matching spec
- **THEN** each result includes a `snippet` preview explaining the hit

#### Scenario: Exact Spec ID match is prioritized first

- **GIVEN** a spec with ID `core:change`
- **AND** a search query `core:change`
- **WHEN** the spec search is executed
- **THEN** the spec `core:change` appears as the first result

#### Scenario: Exact Document Path match is prioritized first

- **GIVEN** a document with path `root:package.json`
- **AND** a search query `root:package.json`
- **WHEN** the document search is executed
- **THEN** the document `root:package.json` appears as the first result

#### Scenario: Filters are applied before limiting results

- **GIVEN** more than 20 matching symbols exist across multiple workspaces
- **WHEN** `searchSymbols({ query: 'hook', workspace: 'core', limit: 5 })` is called
- **THEN** only workspace `core` contributes candidates
- **AND** at most 5 filtered results are returned

#### Scenario: Search indexes can be rebuilt explicitly

- **GIVEN** a backend whose search indexes are not auto-maintained during bulk writes
- **WHEN** `rebuildFtsIndexes()` is called after bulk data changes
- **THEN** subsequent abstract search queries see the new symbols and specs

#### Scenario: Persisted file content does not introduce file search surface

- **GIVEN** a backend persists file source content for symbol snippet extraction
- **WHEN** consumers use the abstract search contract
- **THEN** the contract exposes search across symbols, specs, and documents only
- **AND** no separate file full-text search category is implied by persisted file content

#### Scenario: Spec-id segment outranks content-only hit

- **GIVEN** a spec with ID `default:_global/architecture`
- **AND** another spec contains `architecture` repeatedly only in its body content
- **WHEN** `searchSpecs({ query: 'architecture' })` is executed
- **THEN** the spec-id hit appears ahead of the content-only hit

#### Scenario: Symbol declared name outranks comment-only hit

- **GIVEN** a symbol whose declared name is `SearchSpecs`
- **AND** another symbol contains `search specs` only in its comment text
- **WHEN** `searchSymbols({ query: 'SearchSpecs' })` is executed
- **THEN** the declared-name hit appears ahead of the comment-only hit

#### Scenario: Document path component outranks body-only hit

- **GIVEN** a document whose canonical path contains `graph-search`
- **AND** another document contains `graph search` only in its body content
- **WHEN** `searchDocuments({ query: 'graph-search' })` is executed
- **THEN** the path-identity hit appears ahead of the body-only hit

#### Scenario: Search expands specd-shaped tokens before identity ranking

- **GIVEN** a spec with ID `core:change`
- **AND** another spec mentions `core change` only in body content
- **WHEN** `searchSpecs({ query: 'core:change' })` is executed
- **THEN** the backend may use tokens including `core:change`, `core`, and `change`
- **AND** the spec-id hit appears ahead of the body-only hit

#### Scenario: Strong identity hit may be discovered outside backend-native FTS tokenization

- **GIVEN** a backend whose native tokenizer does not surface every suffix or substring identity hit through its default full-text candidate set
- **AND** one candidate still has the strongest observable identity evidence required by this contract
- **WHEN** `searchSymbols(...)`, `searchSpecs(...)`, or `searchDocuments(...)` is executed
- **THEN** that strong identity hit is still returned
- **AND** it is ordered according to the required identity-strength ladder rather than being dropped for lack of native tokenizer coverage

#### Scenario: Search expands CamelCase tokens before identity ranking

- **GIVEN** a symbol named `ArchiveChange`
- **AND** another symbol contains `archive change` only in comment text
- **WHEN** `searchSymbols({ query: 'ArchiveChange' })` is executed
- **THEN** the backend may use tokens including `archivechange`, `archive`, and `change`
- **AND** the declared-name hit appears ahead of the comment-only hit

#### Scenario: Exact token match outranks prefix token match

- **GIVEN** one candidate identity matches token `change` exactly
- **AND** another candidate identity matches `change` only by prefix
- **WHEN** `searchSymbols({ query: 'change' })` is executed
- **THEN** the exact-token hit appears ahead of the prefix-only hit

#### Scenario: Prefix token match outranks suffix token match

- **GIVEN** one candidate identity matches token `repo` by prefix
- **AND** another candidate identity matches `repo` only by suffix
- **WHEN** `searchSymbols({ query: 'repo' })` is executed
- **THEN** the prefix-token hit appears ahead of the suffix-only hit

#### Scenario: Suffix token match outranks arbitrary substring token match

- **GIVEN** one candidate identity matches token `repository` by suffix
- **AND** another candidate identity matches `repository` only as an arbitrary substring
- **WHEN** `searchDocuments({ query: 'repository' })` is executed
- **THEN** the suffix-token hit appears ahead of the arbitrary-substring hit

#### Scenario: Real identity component outranks arbitrary substring match

- **GIVEN** one spec ID is `core:change`
- **AND** another spec ID contains substring `core` only inside a larger token such as `score`
- **WHEN** `searchSpecs({ query: 'core' })` is executed
- **THEN** the real component match appears ahead of the arbitrary-substring hit

### Requirement: Query methods

#### Scenario: findFilesByConfigRelativePath returns exact matches

- **GIVEN** indexed files `core:src/index.ts` with `configRelativePath` `packages/core/src/index.ts`
- **AND** `cli:src/index.ts` with `configRelativePath` `packages/cli/src/index.ts`
- **WHEN** `findFilesByConfigRelativePath('packages/core/src/index.ts')` is called
- **THEN** only the `core:src/index.ts` file node is returned

#### Scenario: findFilesByConfigRelativePath may return multiple canonical files

- **GIVEN** two indexed files from different workspaces share the same `configRelativePath`
- **WHEN** `findFilesByConfigRelativePath('src/index.ts')` is called
- **THEN** both canonical file nodes are returned so the caller can raise an ambiguity error

#### Scenario: getCallers includes USES_TYPE and CONSTRUCTS dependents

- **GIVEN** symbol `TemplateExpander` has one incoming `CALLS`, one incoming `CONSTRUCTS`, and one incoming `USES_TYPE` relation
- **WHEN** `getCallers(TemplateExpander.id)` is called
- **THEN** all three dependency relations are returned

#### Scenario: getCallees includes USES_TYPE and CONSTRUCTS dependencies

- **GIVEN** symbol `createKernel` has outgoing `CALLS`, `CONSTRUCTS`, and `USES_TYPE` relations
- **WHEN** `getCallees(createKernel.id)` is called
- **THEN** all three dependency relations are returned

#### Scenario: getCoveredFiles returns spec file coverage

- **GIVEN** spec `core:change` covers files `core:src/change.ts` and `core:src/state.ts`
- **WHEN** `getCoveredFiles('core:change')` is called
- **THEN** both persisted `COVERS_FILE` relations are returned

#### Scenario: getCoveringSpecsForFile returns specs covering a file

- **GIVEN** file `core:src/change.ts` is covered by specs `core:change` and `core:change-manifest`
- **WHEN** `getCoveringSpecsForFile('core:src/change.ts')` is called
- **THEN** both `COVERS_FILE` relations are returned

#### Scenario: getCoveredSymbols returns spec symbol coverage

- **GIVEN** spec `core:change` covers symbol `core:Change.transition`
- **WHEN** `getCoveredSymbols('core:change')` is called
- **THEN** the persisted `COVERS_SYMBOL` relation is returned

#### Scenario: getCoveringSpecsForSymbol returns specs covering a symbol

- **GIVEN** symbol `core:Change.transition` is covered by spec `core:change`
- **WHEN** `getCoveringSpecsForSymbol('core:Change.transition')` is called
- **THEN** the persisted `COVERS_SYMBOL` relation is returned

### Requirement: Graph statistics

#### Scenario: Statistics include all expected fields

- **WHEN** `getStatistics()` is called on a populated store
- **THEN** the result includes `fileCount`, `symbolCount`, `specCount`, `relationCounts`, `languages`, `lastIndexedAt`, `lastIndexedRef`, and `graphFingerprint`

#### Scenario: graphFingerprint defaults to null

- **GIVEN** no derivation fingerprint has been stored yet
- **WHEN** `getStatistics()` is called
- **THEN** `graphFingerprint` is `null`

#### Scenario: Statistics include scoped-binding relation counts

- **GIVEN** the store contains persisted `CONSTRUCTS` and `USES_TYPE` relations
- **WHEN** `getStatistics()` is called
- **THEN** `relationCounts` includes counts for both relation types

#### Scenario: graphFingerprint reflects stored value

- **GIVEN** the graph fingerprint meta key has been set to `code-graph@0.2.0:workspaces:abc123`
- **WHEN** `getStatistics()` is called
- **THEN** `graphFingerprint` is `code-graph@0.2.0:workspaces:abc123`

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
