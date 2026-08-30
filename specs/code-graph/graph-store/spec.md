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

`GraphStore.open()` SHALL remain an explicit parameterless lifecycle operation. It
MUST NOT clear or recreate storage implicitly. When the adapter detects corruption
or a schema incompatibility that cannot be opened safely, it MUST reject with a
typed recoverable storage-open error; all other failures retain their own error
identity.

Open prepares the concrete backend for reads and writes and MAY perform native
loading, binding resolution, schema preparation, or generation checks.

`close()` MUST be idempotent and leave the store observably closed, including after
a partial open failure. Callers can therefore decide whether a typed recovery is
authorized without retaining a live database handle.

### Requirement: Store recreation

`recreate()` SHALL be a physical recovery operation for storage that is corrupt,
incompatible, or otherwise unusable. It MUST require the store to be closed and
reject an open-store invocation with a typed precondition error. On success it
removes/replaces backend persistence and rotates the storage generation while
leaving the store closed; a caller must later call `open()` explicitly.

`clear()` is distinct: it operates on an opened healthy store, removes only logical
indexed contents, preserves the physical database and storage generation, and is
the operation used by a forced full reindex.

Host-facing callers MUST NOT rely on backend filenames, WAL files, or direct store
mechanics; provider and SDK contracts determine when recovery is authorized.

### Requirement: Complete logical clear

`GraphStore.clear()` SHALL leave the opened physical store ready for a complete logical reindex without rotating its storage generation. It MUST remove every persisted artifact whose presence or content can influence whether a discovered input is skipped or how the next graph generation is derived.

The cleared state MUST contain no file, document, physical symbol, logical symbol, declaration, binding, reference fact, spec node, graph relation, indexed-input observation, index-coverage record, freshness latch, derivation fingerprint, VCS ref, or search-index entry from the prior logical generation.

Concrete backends MAY retain physical schema objects and backend metadata that cannot affect indexing decisions or graph queries. All `GraphStore` implementations MUST expose equivalent post-clear behavior.

### Requirement: Storage generation tracking

Every persisted `GraphStore` backend SHALL maintain a storage-generation marker that lets already-open providers detect when another process has destructively replaced the underlying graph storage.

At minimum:

- the backend SHALL persist a generation marker within the graph storage root
- destructive recreation SHALL rotate that generation marker
- the backend SHALL expose enough behavior for the owning provider to cache the current generation at `open()` time and compare it later before serving reads

The abstract contract does not require a specific file format, but a sidecar such as `graph/storage.epoch` is a valid realization.

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

### Requirement: Batched symbol traversal reads

`GraphStore` SHALL expose storage-neutral batch queries for traversal:

- `getSymbolsByIds(symbolIds: readonly string[]): Promise<SymbolNode[]>`
  retrieves every existing requested symbol.
- `getIncomingSymbolRelations(symbolIds: readonly string[], relationTypes: readonly RelationType[]): Promise<Relation[]>`
  retrieves relations whose target is one of the requested symbols and whose type
  is requested.
- `getOutgoingSymbolRelations(symbolIds: readonly string[], relationTypes: readonly RelationType[]): Promise<Relation[]>`
  retrieves relations whose source is one of the requested symbols and whose type
  is requested.

These operations MUST support `CALLS`, `CONSTRUCTS`, `USES_TYPE`,
`EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`. Inputs SHALL be deduplicated
without changing observable meaning. Unknown symbol ids SHALL be omitted.
Results MUST be deterministic across backends: symbols ordered by requested id
order and relations ordered by source, type, then target. Empty symbol-id or
relation-type input MUST return an empty array without backend work.

A backend MUST execute each logical batch without requiring one storage call per
symbol or per relation type. Physical parameter chunking is permitted when it is
transparent to the result.

### Requirement: Exact batch node retrieval

`GraphStore` SHALL expose storage-neutral exact batch node lookups that mirror the
`getSymbolsByIds` contract for the other primary node families:

- `getFilesByPaths(paths: readonly string[]): Promise<FileNode[]>`
  retrieves every existing requested file.
- `getDocumentsByPaths(paths: readonly string[]): Promise<DocumentNode[]>`
  retrieves every existing requested document.
- `getSpecsByIds(specIds: readonly string[]): Promise<SpecNode[]>`
  retrieves every existing requested spec.

Every exact batch node operation MUST:

- accept arbitrary input ordering;
- deduplicate repeated requested identities so each identity is returned once;
- preserve first-requested identity order in the result;
- omit identities that do not exist;
- return an empty array for empty input without backend work;
- execute each logical batch without one storage call per identity.

These operations complement the existing single-item APIs (`getFile`,
`getDocument`, `getSymbol`, `getSpec`) and complete-collection APIs
(`getAllFiles`, `getAllDocuments`, `getAllSpecs`), all of which remain available.
Exact batch retrieval MUST NOT be used to re-implement display-path derivation;
display paths are derivable from project/workspace configuration alone.

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

### Requirement: Reference and coverage persistence

`GraphStore` SHALL atomically persist and retrieve logical-symbol identity, contributing declarations, symbol spaces, member forms, public and local bindings, binding provenance, and per-file/package coverage facts. Distinct bindings and routes between the same ordinary relation endpoints MUST remain distinct.

Query methods SHALL support indexed lookup by structured workspace, surface, simple name, symbol space, owner, member form, declaration, public exported name, local scope, and coverage status. Rendered canonical ids SHALL remain unique external identities, but backends MUST NOT parse, case-fold, or substring-search their serialized form to implement selector resolution or semantic ranking. Batch queries SHALL preserve deterministic ordering across backends and MUST NOT require a complete graph scan per reference.

The Store SHALL expose one deterministic complete reference-fact snapshot for incremental hydration and one batched direct-affected-file query over importer, call, construct, type-use, extension, implementation, and override relations. These operations SHALL allow the indexer to retain unaffected facts and expand an affected closure without one query per symbol or relation.

Search SHALL index structured simple name, owner, symbol space, member form, public surface, and exported name fields. It SHALL group public bindings with their logical target while returning every binding independently and identifying which bindings matched the request.

Reverse coverage queries SHALL accept batches of canonical file paths and symbol ids and return all matching `COVERS_FILE` or `COVERS_SYMBOL` relations in deterministic source/type/target order. Empty batches SHALL return empty results without backend work. File-impact traversal MUST be able to retrieve coverage for its complete deduplicated blast radius without one call per resource.

### Requirement: Logical-symbol coverage endpoints

`COVERS_SYMBOL` SHALL link a canonical spec ID to a current logical symbol ID. A declaration-occurrence `SymbolNode.id` MUST NOT be the canonical target of newly projected symbol coverage.

Relation endpoint validation, bulk persistence, reverse-coverage indexes, statistics, and coverage query methods MUST recognize an existing logical symbol as a valid `COVERS_SYMBOL` target. They MUST reject a relation whose spec source or logical-symbol target does not exist in the committed generation.

Coverage queries SHALL preserve the logical target ID without requiring callers to know the declaration occurrence or backend schema used to represent it.

### Requirement: Source-content search candidates

`GraphStore` SHALL persist complete symbol construct and selection ranges and SHALL expose a backend-neutral source-content candidate query over persisted `FileNode.content`.

Candidate input SHALL carry the shared normalized complete query, raw terms, expanded terms, category limit, path/workspace filters, exclusions, and snippet preference. Candidate output SHALL identify the file, backend relevance, and enough content or precise occurrence evidence for Code Graph to verify and group exact matches without reading files from the live filesystem.

The Store SHALL use a substring-capable content index for queries of three or more characters and a defined bounded fallback for shorter queries. It MUST NOT scan and return every stored file to the application layer for ordinary searches. Store results are candidates only: cross-category merging, match provenance, symbol-aware suppression, final ranking, grouping, and post-suppression limits belong to the Code Graph application use case.

### Requirement: Incompatible store handling

A backend schema incompatible with the expected schema MUST reject ordinary reads and MUST NOT silently recreate an empty graph. The indexing repair path SHALL perform a destructive full rebuild, rotate the shared storage generation, and rebuild all search indexes before the store becomes readable.

Persisted graph data is derived cache state; no incremental migration is required when source re-extraction is necessary.

### Requirement: Indexed-input freshness persistence

`GraphStore` SHALL persist backend-neutral `IndexedInputObservation` records separately from semantic nodes. Each record SHALL identify its workspace, logical resource kind and id, filesystem or repository input kind, non-absolute logical locator, indexed content hash, optional observed mtime/size or repository revision, and monotonic stale flag.

Files and documents SHALL normally map to one observation. Aggregate specs SHALL map to every content-artifact, metadata, and persisted-state input that produced the node. Batch reads and compare-and-set mutations SHALL support marking inputs stale, refreshing equal-content observations, and atomically marking affected workspace and global latches without allowing an assessment started before reindexing to mutate new evidence.

The store SHALL persist one monotonic `knownStaleSinceLastIndex` latch per workspace and one aggregate latch. Only successful indexing SHALL clear stale input or latch state. Transient unknown assessments MUST NOT be persisted as stale.

### Requirement: Single-session bulk indexing

`GraphStore` SHALL expose a backend-neutral bulk indexing session that begins once, accepts bounded file, document, spec, symbol, semantic-fact, observation, and relation chunks, commits once, and rebuilds semantic and source-content search indexes once after commit.

Relation endpoint validation and hierarchy/method lookup SHALL have batch operations. Implementations MUST NOT issue existence or hierarchy queries shaped as one Store call per relation. Equivalent relations SHALL be deduplicated across chunks before persistence, and a failed session MUST NOT expose a partially committed generation.

### Requirement: Symbol Query Workspace Scope

`SymbolQuery` SHALL include an optional `workspace?: string` property.

When `workspace` is specified in `SymbolQuery`, `GraphStore.findSymbols(query)` MUST scope returned `SymbolNode` results directly to symbols whose file path begins with the exact, case-sensitive prefix `'<workspace>:'`, using a parameterized prefix comparison in which `%` and `_` are matched as literal characters (`s.filePath STARTS WITH '<workspace>:'`).

## Constraints

- `GraphStore` is an abstract class, not an interface — following the project's port convention
- All mutations are atomic at the file level — no partial updates
- `StoreNotOpenError` is thrown on any operation when the store is not open
- The abstract store contract does not prescribe a specific backend, physical schema, or filesystem layout
- Destructive reset behavior is modeled through `recreate()` as a backend capability owned by provider/indexing flows, not through caller-managed backend file deletion
- Persisted storage generation markers exist to support provider-owned stale detection across processes
- No dependency on `@specd/core` — error types extend `CodeGraphError`

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — shared graph vocabulary for files, symbols, specs, and documents
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — abstract-port and storage-boundary constraints
- [`code-graph:staleness-detection`](../staleness-detection/spec.md) — persisted derivation metadata and freshness reporting
- [`code-graph:document-model`](../document-model/spec.md) — document-node semantics and searchable textual resources

## ADRs

- [ADR-0025: Non-Blocking Worker-Thread SQLite Graph Store](../../../docs/adr/0025-nonblocking-worker-sqlite-graph-store.md) — exact batch node retrieval keeps traversal reads bounded on the worker-backed backend
