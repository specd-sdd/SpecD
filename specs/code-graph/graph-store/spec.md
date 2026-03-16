# Graph Store

## Purpose

The code graph needs durable persistence that supports atomic file-level updates and efficient graph queries without loading the entire graph into memory. The graph store defines the persistence port and its LadybugDB adapter, providing the storage backbone for indexing, querying, and traversal operations.

## Requirements

### Requirement: GraphStore port

`GraphStore` SHALL be an abstract class with a `storagePath` constructor parameter specifying where the graph database is stored on disk. It defines the contract for all graph persistence operations. Concrete implementations provide the storage engine.

The port follows the project's hexagonal architecture: it is defined in `domain/ports/` (or `application/ports/` if it requires async operations), and adapters live in `infrastructure/`.

### Requirement: Connection lifecycle

`GraphStore` SHALL expose explicit `open(): Promise<void>` and `close(): Promise<void>` methods. All query and mutation methods MUST throw `StoreNotOpenError` (extending `CodeGraphError`) if called before `open()` or after `close()`. The `open()` method initializes the database connection and runs any pending schema migrations. The `close()` method flushes pending writes and releases resources.

### Requirement: Atomic file-level upsert

`GraphStore` SHALL provide `upsertFile(file: FileNode, symbols: SymbolNode[], relations: Relation[]): Promise<void>`. This operation MUST be atomic: it removes all existing symbols and relations for the given file path and replaces them with the provided data in a single transaction. If the transaction fails, the previous state for that file is preserved.

### Requirement: Additive relation insertion

`GraphStore` SHALL provide `addRelations(relations: Relation[]): Promise<void>`. This operation adds relations to the store without removing any existing data. It is used for cross-file relations (e.g. `CALLS` between symbols in different files) that must not be deleted when either file is re-upserted.

Unlike `upsertFile` which replaces all data for a file, `addRelations` is purely additive.

### Requirement: File removal

`GraphStore` SHALL provide `removeFile(filePath: string): Promise<void>`. This operation MUST atomically remove the `FileNode`, all `SymbolNode` entries with that `filePath`, and all `Relation` entries where the file or any of its symbols appear as `source` or `target`.

### Requirement: Query methods

`GraphStore` SHALL provide the following query methods:

- **`getFile(path: string): Promise<FileNode | undefined>`** — retrieve a file node by path
- **`getSymbol(id: string): Promise<SymbolNode | undefined>`** — retrieve a symbol by id
- **`getCallers(symbolId: string): Promise<Relation[]>`** — all `CALLS` relations where `target` matches
- **`getCallees(symbolId: string): Promise<Relation[]>`** — all `CALLS` relations where `source` matches
- **`getImporters(filePath: string): Promise<Relation[]>`** — all `IMPORTS` relations where `target` matches
- **`getImportees(filePath: string): Promise<Relation[]>`** — all `IMPORTS` relations where `source` matches
- **`getSpec(specId: string): Promise<SpecNode | undefined>`** — retrieve a spec node by id
- **`getSpecDependencies(specId: string): Promise<Relation[]>`** — all `DEPENDS_ON` relations where `source` matches
- **`getSpecDependents(specId: string): Promise<Relation[]>`** — all `DEPENDS_ON` relations where `target` matches
- **`findSymbols(query: SymbolQuery): Promise<SymbolNode[]>`** — search symbols by name pattern, kind, or file path

`SymbolQuery` is a value object with optional fields: `name` (glob or regex), `kind` (SymbolKind), `filePath` (exact match or glob), `comment` (substring match for full-text search within symbol comments), `caseSensitive` (boolean, defaults to `false` — when `false`, `name` and `comment` matching is case insensitive).

### Requirement: Graph statistics

`GraphStore` SHALL provide `getStatistics(): Promise<GraphStatistics>` returning:

- **`fileCount`** — total number of `FileNode` entries
- **`symbolCount`** — total number of `SymbolNode` entries
- **`specCount`** — total number of `SpecNode` entries
- **`relationCounts`** — a `Record<RelationType, number>` with counts per relation type
- **`languages`** — array of distinct language identifiers across all files
- **`lastIndexedAt`** — ISO 8601 timestamp of the most recent `upsertFile` call

### Requirement: LadybugDB adapter

The concrete `LadybugGraphStore` adapter SHALL use LadybugDB as the storage engine. It stores the graph in a single file at `{storagePath}/.specd/code-graph.lbug`. LadybugDB provides a Cypher-compatible query interface over a local file-based graph database.

The adapter MUST:

- Create the `.specd/` directory and database file on first `open()` if they do not exist
- Define a schema with node labels (`File`, `Symbol`, `Spec`) and relationship types matching `RelationType`. The `Symbol` node table includes a `comment STRING` column for storing the raw comment text and a `searchName STRING` column for FTS-optimized name search (computed from the symbol name using `expandSymbolName`).

- Use parameterized Cypher queries for all operations (no string interpolation of user data)
- Support schema migration: if the database schema version does not match the expected version, migrate on `open()`

The adapter uses CSV-based bulk loading (`COPY FROM`) for large datasets via the `bulkLoad()` method. Relations are loaded in batches of 500 to prevent LadybugDB from blocking. The `IGNORE_ERRORS=true` flag is used for relation COPY operations to silently skip rows referencing non-existent nodes (dangling imports to external files).

### Requirement: Spec upsert and removal

`GraphStore` SHALL provide:

- **`upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void>`** — atomically replaces all data for a spec node. Removes existing `DEPENDS_ON` relations where this spec is the source and replaces them with the provided relations.
- **`removeSpec(specId: string): Promise<void>`** — removes the `SpecNode` and all `DEPENDS_ON` relations where it appears as source or target.

These follow the same atomic pattern as `upsertFile` / `removeFile`.

The Spec node table includes:

- `specId STRING` — primary key
- `path STRING`
- `title STRING`
- `description STRING` — from `.specd-metadata.yaml`
- `contentHash STRING` — hash of concatenated artifacts (excluding `.specd-metadata.yaml`)
- `content STRING` — concatenated artifact text for full-text search
- `workspace STRING`

### Requirement: Full-text search

`GraphStore` SHALL provide:

- **`searchSymbols(query: string, limit?: number): Promise<Array<{ symbol: SymbolNode; score: number }>>`** — full-text search across `Symbol.searchName` and `Symbol.comment`. The `searchName` column contains the original symbol name plus camelCase/snake_case/kebab-case tokenized parts (e.g. `handleError` is indexed as `"handleError handle error"`), so searches for individual words within compound names match correctly. Returns results ranked by BM25 score descending.
- **`searchSpecs(query: string, limit?: number): Promise<Array<{ spec: SpecNode; score: number }>>`** — full-text search across `Spec.title`, `Spec.description`, and `Spec.content`. Returns results ranked by BM25 score descending.
- **`rebuildFtsIndexes(): Promise<void>`** — drops and recreates FTS indexes. Must be called after bulk data changes because LadybugDB FTS indexes are not automatically updated on insert.

Default limit is 20. The `LadybugGraphStore` implementation uses `QUERY_FTS_INDEX` with `k := 1000` internally and applies `ORDER BY score DESC LIMIT n` to get the true top-k results.

### Requirement: Bulk operations

`GraphStore` SHALL provide `clear(): Promise<void>` to remove all nodes and relations (full re-index), `getAllFiles(): Promise<FileNode[]>` to retrieve all file nodes, and `getAllSpecs(): Promise<SpecNode[]>` to retrieve all spec nodes (both for incremental diff computation).

## Constraints

- `GraphStore` is an abstract class, not an interface — following the project's port convention
- All mutations are atomic at the file level — no partial updates
- `StoreNotOpenError` is thrown on any operation when the store is not open
- The LadybugDB file path is always `{storagePath}/.specd/code-graph.lbug` — not configurable separately
- No dependency on `@specd/core` — error types extend `CodeGraphError`

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `RelationType`, `CodeGraphError`
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — ports as abstract classes, adapters in infrastructure
