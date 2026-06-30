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

- file nodes carrying the `FileNode` data needed by indexing, traversal, and CLI queries, including both canonical workspace-prefixed paths and config-relative file paths, and the full textual **content**
- symbol nodes carrying the `SymbolNode` data needed by indexing, traversal, and CLI queries
- spec nodes carrying the `SpecNode` data needed by spec indexing and search
- **document nodes** carrying the `DocumentNode` data (textual non-code resources)
- persisted relations for the relation families used by the package: `IMPORTS`, `DEFINES`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXPORTS`, `DEPENDS_ON`, `COVERS_FILE`, `COVERS_SYMBOL`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- store-level metadata sufficient to satisfy abstract statistics and derivation-freshness fields such as `lastIndexedAt`, `lastIndexedRef`, and the persisted graph fingerprint

`COVERS_FILE` and `COVERS_SYMBOL` are the abstract relation families used for requirement-aware graph linkage. `COVERS_FILE` links a spec to a covered implementation file. `COVERS_SYMBOL` links a spec to a covered implementation symbol and MAY carry `metadata.stale` when the archived symbol-level link no longer resolves to a live indexed symbol.

The `files` storage SHALL persist the full textual content of indexed source files to enable match-aware snippet extraction without re-reading from disk at query time.

The store MUST provide operations for upserting and removing `DocumentNode` entries, as well as searching them via full-text search.

The store SHALL support incremental indexing by matching `contentHash` values before updating node properties or relations.

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

- **`getFile(path: string): Promise<FileNode | undefined>`** — retrieve a file node by canonical workspace-prefixed path
- **`findFilesByConfigRelativePath(path: string): Promise<FileNode[]>`** — retrieve all file nodes whose `configRelativePath` exactly matches the given normalized config-relative path
- **`getSymbol(id: string): Promise<SymbolNode | undefined>`** — retrieve a symbol by id
- **`getCallers(symbolId: string): Promise<Relation[]>`** — all incoming symbol dependency relations where `target` matches. At minimum this includes `CALLS`, `CONSTRUCTS`, and `USES_TYPE`.
- **`getCallees(symbolId: string): Promise<Relation[]>`** — all outgoing symbol dependency relations where `source` matches. At minimum this includes `CALLS`, `CONSTRUCTS`, and `USES_TYPE`.
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
- **`getCoveredFiles(specId: string): Promise<Relation[]>`** — all `COVERS_FILE` relations where `source` matches
- **`getCoveringSpecsForFile(filePath: string): Promise<Relation[]>`** — all `COVERS_FILE` relations where `target` matches
- **`getCoveredSymbols(specId: string): Promise<Relation[]>`** — all `COVERS_SYMBOL` relations where `source` matches
- **`getCoveringSpecsForSymbol(symbolId: string): Promise<Relation[]>`** — all `COVERS_SYMBOL` relations where `target` matches
- **`findSymbols(query: SymbolQuery): Promise<SymbolNode[]>`** — search symbols by name pattern, kind, or file path

`SymbolQuery` is a value object with optional fields: `name` (glob or regex), `kinds` (array of `SymbolKind` for filtering by one or more kinds), `filePath` (exact match or glob), `comment` (substring match for full-text search within symbol comments), `caseSensitive` (boolean, defaults to `false` — when `false`, `name` and `comment` matching is case insensitive).

### Requirement: Graph statistics

`GraphStore` SHALL provide `getStatistics(): Promise<GraphStatistics>` returning:

- **`fileCount`** — total number of `FileNode` entries
- **`symbolCount`** — total number of `SymbolNode` entries
- **`specCount`** — total number of `SpecNode` entries
- **`relationCounts`** — a `Record<RelationType, number>` with counts per relation type, including `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- **`languages`** — array of distinct language identifiers across all files
- **`lastIndexedAt`** — ISO 8601 timestamp of the most recent `upsertFile` call
- **`lastIndexedRef`** — VCS ref (commit hash, changeset ID) at the time of the last index, or `null` if no ref was stored. This value is persisted as a meta key alongside `lastIndexedAt` and is read-only from the statistics interface.
- **`graphFingerprint`** — the persisted graph derivation fingerprint for the current store contents, or `null` if no fingerprint has been recorded yet

### Requirement: Spec upsert and removal

`GraphStore` SHALL provide:

- **`upsertSpec(spec: SpecNode, relations: Relation[]): Promise<void>`** — atomically replaces all data for a spec node. Removes existing `DEPENDS_ON` relations where this spec is the source and replaces them with the provided relations.
- **`removeSpec(specId: string): Promise<void>`** — removes the `SpecNode` and all `DEPENDS_ON` relations where it appears as source or target.

These follow the same atomic pattern as `upsertFile()` and `removeFile()`.

### Requirement: Search with primary-identity prioritization

`GraphStore` SHALL provide:

- **`searchSymbols(options: SearchOptions)`** — search symbols using normalized search text and symbol comments, returning results ranked by relevance in descending order
- **`searchSpecs(options: SearchOptions)`** — search spec title, description, and content, returning results ranked by relevance in descending order
- **`searchDocuments(options: SearchOptions)`** — search document paths and textual content, returning results ranked by relevance in descending order
- **`rebuildFtsIndexes(): Promise<void>`** — a store-maintenance hook used by implementations whose search indexes require explicit rebuilding after bulk data changes

Search results MUST return match-aware **snippets** and the corresponding 1-based **line range** (`startLine` to `endLine`) from the source content.

Primary identity fields are:

- **specs** — canonical `specId`
- **symbols** — declared symbol `name` and canonical symbol `id`
- **documents** — canonical `path`, and any persisted alternate path identity such as `configRelativePath` when the backend exposes it to search

Search ranking MUST prioritize primary-identity matches ahead of generic content-only matches, but MUST NOT narrow candidate retrieval to identity fields only. Generic text matching across the backend's searchable fields remains part of discovery.

Implementations MAY supplement their backend-native full-text candidate set with additional identity-derived candidates when the backend tokenizer would otherwise miss a strong identity hit required by this contract. Identity-aware logic may therefore affect both candidate coverage and final ordering, as long as generic text retrieval remains available.

Implementations MUST expand query tokens with a shared specd/code-aware lexical policy before applying identity-aware ranking. That expansion is lexical only — it does not classify user intent as “symbol”, “spec”, or “document”.

Required expansion behavior:

- preserve each normalized original token
- split on whitespace
- split useful specd/code separators such as `:`, `/`, `_`, `.`, and `-`
- split CamelCase and PascalCase boundaries

Examples:

- `core:change` expands to tokens including `core:change`, `core`, and `change`
- `ArchiveChange` expands to tokens including `archivechange`, `archive`, and `change`

Required observable ordering:

- **Exact canonical identity match** — prioritized first in its category.
- **Exact primary-name or alternate identity match** — prioritized ahead of body-only/comment-only/content-only matches.
- **Primary-identity prefix, suffix, or substring token match** — prioritized ahead of results whose relevance comes only from generic description, comment, or body-content frequency.
- **Structured identity component or path-component match** — prioritized ahead of arbitrary substring-only matches on the same identity field.

When a backend compares expanded query tokens against selected identity fields, token-strength MUST follow this order:

1. exact token match: `x`
2. prefix token match: `x%`
3. suffix token match: `%x`
4. substring token match: `%x%`

For structured identities such as spec ids and paths, a real component match (for example `core` in `core:change`) MUST rank above an arbitrary substring match (for example `core` in `score`).

When multiple expanded query tokens match the same candidate's selected identity fields, that higher token coverage MUST improve ranking ahead of candidates matching fewer identity tokens.

This means, for example:

- a spec whose `specId` contains the queried capability path MUST outrank unrelated specs that match only because the same word appears many times in their content
- a symbol whose declared name matches the query intent MUST outrank symbols that match only through attached comments
- a document whose path identity matches the query intent MUST outrank documents that match only through body text

`SearchOptions` is a value object with:

- **`query`** — the search query string (required)
- **`limit`** — maximum results to return (default `20`)
- **`kind`** — filter symbols by `SymbolKind` (symbols only)
- **`filePattern`** — filter symbols by file path glob (supports `*` wildcards, case-insensitive; symbols only)
- **`workspace`** — filter results to a single workspace
- **`excludePaths`** — array of glob patterns to exclude by file path (supports `*` wildcards, case-insensitive)
- **`excludeWorkspaces`** — array of workspace names to exclude

All filters (kind, filePattern, workspace, excludePaths, excludeWorkspaces) are applied before the result limit. Score calculation and index-maintenance strategy are implementation concerns.

Generic text matching (BM25 or equivalent) SHALL still participate in retrieval and SHALL rank the remaining hits after primary-identity preference is applied.

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

- [`code-graph:symbol-model`](../symbol-model/spec.md) — shared graph vocabulary for files, symbols, specs, and documents
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — abstract-port and storage-boundary constraints
- [`code-graph:staleness-detection`](../staleness-detection/spec.md) — persisted derivation metadata and freshness reporting
- [`code-graph:document-model`](../document-model/spec.md) — document-node semantics and searchable textual resources
