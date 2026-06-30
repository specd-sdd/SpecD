# Ladybug Graph Store

## Purpose

`GraphStore` is the storage contract for the code graph, but the concrete Ladybug-backed implementation has backend-specific behavior that should not leak into the abstract port spec. This spec defines the requirements that are specific to `LadybugGraphStore`: its physical schema, persistence layout, full-text indexing behavior, and bulk-load mechanics, while allowing it to coexist with other concrete graph-store backends behind the same abstract contract.

## Requirements

### Requirement: Ladybug-backed implementation

`LadybugGraphStore` SHALL implement the `GraphStore` contract using LadybugDB as the storage engine. It is an infrastructure adapter and owns all backend-specific concerns that are not part of the abstract `GraphStore` port.

Within a composition that supports multiple registered graph-store backends, the Ladybug adapter is identified by the backend id `ladybug`. It remains available as an explicitly selectable concrete backend even when another backend becomes the default.

The adapter MUST:

- open and close a Ladybug database connection safely
- execute the Ladybug-specific schema DDL on first use
- keep backend-specific schema version state
- translate the abstract graph-store operations into Ladybug queries and bulk-load operations

### Requirement: Config-derived persistence layout

`LadybugGraphStore` SHALL use the project-level `configPath` as the root for its persisted and temporary filesystem artifacts.

The adapter MUST derive:

- a graph persistence directory at `{configPath}/graph`
- a temporary scratch directory at `{configPath}/tmp`

The concrete database files, lock files, WAL files, and CSV scratch files owned by the Ladybug adapter SHALL live only under those derived directories. The adapter MUST create the required directories on demand.

### Requirement: Destructive recreation

`LadybugGraphStore` SHALL implement the abstract `GraphStore.recreate()` capability using Ladybug-specific persistence cleanup under the configured graph root.

When `recreate()` is invoked, the adapter MUST ensure that the next indexing run starts from an empty Ladybug backend without requiring callers to know any Ladybug-specific filenames. The implementation MAY close and reopen connections as needed, but the observable effect MUST be that:

- all persisted Ladybug graph data under `{configPath}/graph` is discarded
- any backend-owned companion artifacts such as lock or WAL files are also discarded when they belong to the same graph persistence root
- the backend is ready to be opened again and rebuilt from scratch

Callers such as `graph index --force` MUST depend on this abstract recreation behavior rather than deleting `.lbug`, `.wal`, `.lock`, or any other backend-specific artifacts directly.

### Requirement: Ladybug schema ownership

`LadybugGraphStore` SHALL own the Ladybug-specific persisted schema for files, symbols, specs, relations, and store metadata.

That schema MUST define:

- node tables for `File`, `Symbol`, `Spec`, and `Meta`
- relationship tables matching the persisted `RelationType` values used by the code graph, including `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`
- any derived or backend-specific storage columns required by the implementation, such as `searchName`

The physical schema is an implementation concern of the Ladybug adapter. Storage-agnostic consumers MUST depend on `code-graph:graph-store` instead of this spec.

### Requirement: Node tables

The Ladybug schema SHALL define the following node tables:

**File** — source files indexed from workspace code roots.

| Column      | Type   | Notes                                                         |
| ----------- | ------ | ------------------------------------------------------------- |
| path        | STRING | Primary key. `{workspace}:{relativePath}`.                    |
| language    | STRING | Language identifier (e.g. `typescript`).                      |
| contentHash | STRING | SHA-256 hash of file content.                                 |
| content     | STRING | Persisted file source content used to derive symbol snippets. |
| workspace   | STRING | Workspace name (e.g. `core`, `cli`).                          |

**Symbol** — code symbols extracted from files.

| Column     | Type   | Notes                                                                               |
| ---------- | ------ | ----------------------------------------------------------------------------------- |
| id         | STRING | Primary key. `{filePath}:{kind}:{name}:{line}`.                                     |
| name       | STRING | Symbol's declared name.                                                             |
| searchName | STRING | Expanded name for backend search. camelCase/snake_case/kebab-case split + original. |
| kind       | STRING | `SymbolKind` value.                                                                 |
| filePath   | STRING | References `File.path`.                                                             |
| line       | INT64  | 1-based line number.                                                                |
| col        | INT64  | 0-based column offset.                                                              |
| comment    | STRING | Raw preceding comment text, stored as empty string when absent.                     |

**Spec** — specification documents from workspace spec directories.

| Column      | Type   | Notes                                                                                                                          |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| specId      | STRING | Primary key. `{workspace}:{specPath}`.                                                                                         |
| path        | STRING | Spec path within the workspace.                                                                                                |
| title       | STRING | From spec metadata or fallback title policy.                                                                                   |
| description | STRING | From spec metadata.                                                                                                            |
| contentHash | STRING | SHA-256 hash of concatenated artifacts (excluding metadata artifact content when that is not part of searchable spec content). |
| content     | STRING | Concatenated artifact text for full-text search.                                                                               |
| workspace   | STRING | Workspace name.                                                                                                                |

**Document** — textual non-code resources.

| Column             | Type   | Notes                                      |
| ------------------ | ------ | ------------------------------------------ |
| path               | STRING | Primary key. `{workspace}:{relativePath}`. |
| configRelativePath | STRING | Path relative to specd.yaml.               |
| contentHash        | STRING | SHA-256 hash of content.                   |
| content            | STRING | Raw textual content.                       |
| workspace          | STRING | Workspace name (or `root`).                |

**Meta** — key-value metadata for the database itself.

| Column | Type   | Notes                               |
| ------ | ------ | ----------------------------------- |
| key    | STRING | Primary key (e.g. `lastIndexedAt`). |
| value  | STRING | Metadata value.                     |

### Requirement: Relationship tables

The Ladybug schema SHALL define relationship tables for the persisted relation types used by the code graph.

At minimum, the schema MUST persist:

| Relationship  | From   | To     | Populated by                                 |
| ------------- | ------ | ------ | -------------------------------------------- |
| IMPORTS       | File   | File   | Indexer analysis                             |
| DEFINES       | File   | Symbol | Indexer analysis                             |
| CALLS         | Symbol | Symbol | Indexer analysis                             |
| EXPORTS       | File   | Symbol | Indexer analysis                             |
| DEPENDS_ON    | Spec   | Spec   | Spec indexing                                |
| COVERS_FILE   | Spec   | File   | Archived file-level implementation linkage   |
| COVERS_SYMBOL | Spec   | Symbol | Archived symbol-level implementation linkage |
| EXTENDS       | Symbol | Symbol | Indexer analysis                             |
| IMPLEMENTS    | Symbol | Symbol | Indexer analysis                             |
| OVERRIDES     | Symbol | Symbol | Indexer analysis                             |

The schema MUST provide persisted `COVERS_FILE` and `COVERS_SYMBOL` relation families so the backend can support requirement-aware impact and lookup. `COVERS_SYMBOL` relations MUST preserve edge metadata so symbol-level implementation links can surface `stale` state after reload.

Relationship tables have no persisted edge properties unless a requirement explicitly adds them. `COVERS_SYMBOL` is that explicit case and MUST retain metadata required by the abstract relation contract.

### Requirement: Full-text search implementation

`LadybugGraphStore` SHALL implement symbol, spec, and document search using Ladybug's full-text search facilities.

The adapter MUST:

- create the Ladybug FTS indexes needed to satisfy the abstract `GraphStore.searchSymbols()`, `GraphStore.searchSpecs()`, and `GraphStore.searchDocuments()` contract
- index symbols using both the stored symbol name and the backend-specific expanded search text used for compound-name matching
- index spec title, description, and full content for spec search
- index document paths and full textual content
- keep the existing Ladybug discovery paths in place:
  - `QUERY_FTS_INDEX`-based discovery for symbols and specs
  - manual document candidate discovery for documents
- join multiple search tokens using the `OR` operator in the sanitized FTS query so that results matching any of the terms are returned (discovery mode)
- expand raw query tokens with the shared specd/code-aware lexical policy before applying identity-aware ranking
- supplement the backend-native candidate set with identity-derived candidates when the native tokenization path would otherwise miss a strong identity hit required by the abstract contract
- prioritize **exact canonical identity matches** during search by applying a score boost to nodes where the query exactly matches the primary identity column
- prioritize **strong non-exact identity matches** ahead of generic content-only matches, including:
  - symbol declared-name equality when comment-only hits would otherwise rank higher
  - spec-id prefix, suffix, substring, and real component matches
  - document canonical-path or config-relative-path prefix, suffix, substring, and real component matches
- rerank the discovered candidate set using backend-local ranking logic after candidate retrieval rather than replacing candidate generation with whole-query string matching
- count how many expanded query tokens match the selected identity fields and use that token coverage to rank candidates that satisfy more of the query intent above candidates satisfying fewer identity tokens
- return results ordered from highest to lowest relevance after identity preference is applied
- rebuild or recreate FTS indexes when required by the backend after bulk data changes
- derive match-aware snippets and the corresponding 1-based line range from persisted file source content or FTS matches

Observable Ladybug ordering semantics MUST hold:

- exact canonical identity matches rank first
- identity-oriented non-exact hits rank ahead of body-only/comment-only/content-only hits
- exact token identity matches outrank prefix token matches
- prefix token matches outrank suffix token matches
- suffix token matches outrank arbitrary substring token matches
- real identity-component matches outrank arbitrary substring-only hits on the same identity field
- candidates matching more expanded identity tokens outrank candidates matching fewer expanded identity tokens when generic text relevance is otherwise competing
- generic term frequency in spec/document body content MUST NOT outrank a stronger spec-id, symbol-name, or document-path match for the same query intent

The Ladybug FTS schema MUST include:

- **`symbol_fts`** — covering `Symbol.searchName` and `Symbol.comment`
- **`spec_fts`** — covering `Spec.title`, `Spec.description`, and `Spec.content`
- **`document_fts`** — covering `Document.content`, `Document.path`, and any backend-maintained alternate path search field needed to preserve document identity preference

The implementation MAY use stemming, weighted ranking, identity boost unions, or other backend-supported ranking/indexing options, provided the abstract graph-store contract remains satisfied.

Persisted `File` content used for snippet extraction SHALL NOT, by itself, become a separate full-text searchable file category in this change.

### Requirement: Schema versioning

`LadybugGraphStore` SHALL track a backend-specific schema version for its persisted Ladybug schema.

When the adapter opens a database:

1. it executes the current Ladybug schema definition
2. it verifies or records the current schema version in persisted metadata
3. it prepares any required FTS indexes

If the persisted Ladybug schema version is incompatible with the expected version, the implementation MAY require a destructive rebuild rather than attempting incremental migration.

There is no requirement that Ladybug schema upgrades be incremental. A force rebuild is an acceptable recovery strategy when the implementation cannot migrate safely.

### Requirement: Bulk loading and scratch files

`LadybugGraphStore` SHALL support efficient bulk loading for large indexing runs.

The adapter MAY materialize bulk-load scratch artifacts such as CSV files under `{configPath}/tmp`. When it does:

- scratch files MUST be scoped to the current indexing run
- scratch files MUST be cleaned up after successful completion
- scratch files SHOULD be cleaned up after failure when the process remains alive long enough to do so

The adapter MAY use backend-specific import flags or batching strategies to keep Ladybug bulk-load operations stable, provided the observable `GraphStore` contract is preserved.

### Requirement: Concrete database files

The Ladybug-backed graph persistence under `{configPath}/graph` SHALL own the concrete Ladybug database files required by the implementation.

The adapter MAY create backend-specific companion files such as lock or WAL files next to the primary database file. Those files are part of the Ladybug implementation detail and are not part of the abstract `GraphStore` contract.

### Requirement: Persisted metadata keys

`LadybugGraphStore` SHALL persist store-level metadata needed by the abstract graph-store contract, including the values surfaced through `GraphStatistics` such as `lastIndexedAt` and `lastIndexedRef`.

Backend-specific metadata storage details remain internal to the adapter.

### Requirement: Prepared statement usage

`LadybugGraphStore` SHALL use LadybugDB's prepared statement API for all Cypher queries
that accept user-supplied or externally-derived parameter values.

The adapter MUST:

- use `conn.prepare(statement)` and `conn.execute(preparedStatement, params)` with `$param`
  bindings for all queries where node properties, relation endpoints, or metadata values
  come from function arguments or external data
- pass parameter values as a `Record<string, LbugValue>` object rather than interpolating
  them into the Cypher query string
- avoid manual string escaping functions for values that can be bound through prepared
  statement parameters

The adapter MAY continue to use direct `conn.query()` for DDL statements, DML with
compile-time constant values (such as `RelationType` enum values used as relationship
labels), COPY commands with internally generated file paths, and backend-specific
administrative queries where no external values are involved.

## Constraints

- `LadybugGraphStore` is an infrastructure adapter, not part of the abstract graph-store contract
- `ladybug` is the stable backend id used to select this adapter from a multi-backend graph-store registry
- Ladybug-specific file layout, FTS behavior, schema shape, and schema-version handling are defined here, not in `code-graph:graph-store`
- All Ladybug scratch files and persisted database artifacts are rooted under `configPath`
- Node table layout, relationship tables, and FTS index shape defined here are Ladybug-specific and MUST NOT be treated as a portable graph-store schema
- Storage-agnostic use cases and CLI commands MUST NOT depend on this spec unless they truly require Ladybug-specific behavior

## Spec Dependencies

- [`code-graph:graph-store`](../graph-store/spec.md) — abstract graph-store contract implemented by this adapter
- [`core:config`](../../../core/config/spec.md) — `configPath` and derived graph/temp directories
- [`code-graph:symbol-model`](../symbol-model/spec.md) — persisted node and relation concepts
- [`code-graph:workspace-integration`](../workspace-integration/spec.md) — workspace-prefixed file and spec identity rules
