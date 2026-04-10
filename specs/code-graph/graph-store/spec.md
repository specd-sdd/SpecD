# Graph Store

## Purpose

The code graph needs durable persistence that supports atomic file-level updates and efficient graph queries without loading the entire graph into memory. This spec defines the abstract `GraphStore` contract that indexing, traversal, and CLI features depend on, without prescribing any particular storage engine or physical schema.

## Requirements

### Requirement: GraphStore port

`GraphStore` SHALL be an abstract class with a `storagePath` constructor parameter specifying the filesystem root allocated to the concrete graph-store implementation. It defines the contract for all graph persistence operations. Concrete implementations own the physical schema, file layout, and backend-specific storage details.

The port follows the project's hexagonal architecture: it is defined in `domain/ports/`, and concrete adapters live in `infrastructure/`.

### Requirement: Minimum graph semantics

Every `GraphStore` implementation SHALL support the code-graph package's minimum persisted semantics, regardless of its backend-specific physical schema or file layout.

At minimum, the abstract store contract MUST support:

- file nodes carrying the `FileNode` data needed by indexing, traversal, and CLI queries
- symbol nodes carrying the `SymbolNode` data needed by indexing, traversal, and CLI queries
- spec nodes carrying the `SpecNode` data needed by spec indexing and search
- persisted relations for the relation families used by the package: `IMPORTS`, `DEFINES`, `CALLS`, `EXPORTS`, `DEPENDS_ON`, `COVERS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- store-level metadata sufficient to satisfy abstract statistics and staleness-facing fields such as `lastIndexedAt` and `lastIndexedRef`

`COVERS` is the abstract relation family reserved for linking specs to code artifacts. A backend MAY leave it unpopulated until the package introduces the corresponding indexing and query behavior, but the relation family itself belongs to the abstract graph model rather than to any one backend.

Backends MAY represent those concepts differently internally, but they MUST preserve the observable semantics exposed by the `GraphStore` API. Storage-agnostic consumers MUST rely on these abstract semantics rather than any backend-specific table, label, or index shape.

### Requirement: Connection lifecycle

`GraphStore` SHALL expose explicit `open(): Promise<void>` and `close(): Promise<void>` methods. All query and mutation methods MUST throw `StoreNotOpenError` (extending `CodeGraphError`) if called before `open()` or after `close()`.

The `open()` method prepares the concrete backend for read/write operations. The `close()` method flushes pending writes and releases resources. Any backend-specific schema initialization, migrations, or index preparation remain implementation concerns.

### Requirement: Store recreation

`GraphStore` SHALL provide `recreate(): Promise<void>` as the abstract destructive reset operation for backends that need to drop and rebuild their persisted graph state.

`recreate()` is stronger than `clear()`: it resets the backend's persisted storage layout rather than merely deleting graph rows from an already-open store. Callers such as `graph index --force` MUST use this abstract capability instead of deleting backend-specific files or directories directly.

The concrete backend owns how recreation is performed. A backend MAY delete files, recreate directories, rebuild schemas, reopen connections, or combine those steps, provided the observable result is the same:

- all previously indexed graph data is gone
- the persisted backend state is ready for a fresh indexing run
- callers do not need to know backend-specific filenames, lockfiles, WAL files, or schema artifacts

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
- **`getExtenders(symbolId: string): Promise<Relation[]>`** — all `EXTENDS` relations where `target` matches
- **`getExtendedTargets(symbolId: string): Promise<Relation[]>`** — all `EXTENDS` relations where `source` matches
- **`getImplementors(symbolId: string): Promise<Relation[]>`** — all `IMPLEMENTS` relations where `target` matches
- **`getImplementedTargets(symbolId: string): Promise<Relation[]>`** — all `IMPLEMENTS` relations where `source` matches
- **`getOverriders(symbolId: string): Promise<Relation[]>`** — all `OVERRIDES` relations where `target` matches
- **`getOverriddenTargets(symbolId: string): Promise<Relation[]>`** — all `OVERRIDES` relations where `source` matches
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
- **`relationCounts`** — a `Record<RelationType, number>` with counts per relation type, including `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- **`languages`** — array of distinct language identifiers across all files
- **`lastIndexedAt`** — ISO 8601 timestamp of the most recent `upsertFile` call
- **`lastIndexedRef`** — VCS ref (commit hash, changeset ID) at the time of the last index, or `null` if no ref was stored. This value is persisted as a meta key alongside `lastIndexedAt` and is read-only from the statistics interface.

### Requirement: Spec upsert and removal

`GraphStore` SHALL provide:

- **`upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void>`** — atomically replaces all data for a spec node. Removes existing `DEPENDS_ON` relations where this spec is the source and replaces them with the provided relations.
- **`removeSpec(specId: string): Promise<void>`** — removes the `SpecNode` and all `DEPENDS_ON` relations where it appears as source or target.

These follow the same atomic pattern as `upsertFile()` and `removeFile()`.

### Requirement: Full-text search

`GraphStore` SHALL provide:

- **`searchSymbols(options: SearchOptions): Promise<Array<{ symbol: SymbolNode; score: number }>>`** — search symbols using normalized search text and symbol comments, returning results ranked by relevance in descending order
- **`searchSpecs(options: SearchOptions): Promise<Array<{ spec: SpecNode; score: number }>>`** — search spec title, description, and content, returning results ranked by relevance in descending order
- **`rebuildFtsIndexes(): Promise<void>`** — a store-maintenance hook used by implementations whose search indexes require explicit rebuilding after bulk data changes

`SearchOptions` is a value object with:

- **query** — the search query string (required)
- **limit** — maximum results to return (default 20)
- **kind** — filter symbols by `SymbolKind` (symbols only)
- **filePattern** — filter symbols by file path glob (supports `*` wildcards, case-insensitive; symbols only)
- **workspace** — filter results to a single workspace
- **excludePaths** — array of glob patterns to exclude by file path (supports `*` wildcards, case-insensitive)
- **excludeWorkspaces** — array of workspace names to exclude

All filters (kind, filePattern, workspace, excludePaths, excludeWorkspaces) are applied before the result limit. Score calculation and index-maintenance strategy are implementation concerns.

### Requirement: Bulk operations

`GraphStore` SHALL provide `clear(): Promise<void>` to remove all nodes and relations (full re-index), `getAllFiles(): Promise<FileNode[]>` to retrieve all file nodes, and `getAllSpecs(): Promise<SpecNode[]>` to retrieve all spec nodes (both for incremental diff computation).

## Constraints

- `GraphStore` is an abstract class, not an interface — following the project's port convention
- All mutations are atomic at the file level — no partial updates
- `StoreNotOpenError` is thrown on any operation when the store is not open
- The abstract store contract does not prescribe a specific backend, physical schema, or filesystem layout
- Destructive force-reset behavior is modeled through `recreate()`, not through caller-managed backend file deletion
- No dependency on `@specd/core` — error types extend `CodeGraphError`

## Spec Dependencies

- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `RelationType`, and hierarchy relation semantics
- [`default:_global/architecture`](../../_global/architecture/spec.md) — ports as abstract classes and adapters in infrastructure
- [`code-graph:code-graph/staleness-detection`](../staleness-detection/spec.md) — `lastIndexedRef` field definition and staleness semantics
