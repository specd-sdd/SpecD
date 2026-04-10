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

The physical schema is an implementation concern of the Ladybug adapter. Storage-agnostic consumers MUST depend on `code-graph:code-graph/graph-store` instead of this spec.

### Requirement: Node tables

The Ladybug schema SHALL define the following node tables:

**File** — source files indexed from workspace code roots.

| Column      | Type   | Notes                                      |
| ----------- | ------ | ------------------------------------------ |
| path        | STRING | Primary key. `{workspace}:{relativePath}`. |
| language    | STRING | Language identifier (e.g. `typescript`).   |
| contentHash | STRING | SHA-256 hash of file content.              |
| workspace   | STRING | Workspace name (e.g. `core`, `cli`).       |

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

**Meta** — key-value metadata for the database itself.

| Column | Type   | Notes                               |
| ------ | ------ | ----------------------------------- |
| key    | STRING | Primary key (e.g. `lastIndexedAt`). |
| value  | STRING | Metadata value.                     |

### Requirement: Relationship tables

The Ladybug schema SHALL define relationship tables for the persisted relation types used by the code graph.

At minimum, the schema MUST persist:

| Relationship | From   | To     | Populated by                      |
| ------------ | ------ | ------ | --------------------------------- |
| IMPORTS      | File   | File   | Indexer analysis                  |
| DEFINES      | File   | Symbol | Indexer analysis                  |
| CALLS        | Symbol | Symbol | Indexer analysis                  |
| EXPORTS      | File   | Symbol | Indexer analysis                  |
| DEPENDS_ON   | Spec   | Spec   | Spec indexing                     |
| COVERS       | Spec   | File   | Reserved for spec-to-code linkage |
| EXTENDS      | Symbol | Symbol | Indexer analysis                  |
| IMPLEMENTS   | Symbol | Symbol | Indexer analysis                  |
| OVERRIDES    | Symbol | Symbol | Indexer analysis                  |

The schema MUST provide a persisted `COVERS` relation family so the backend can support spec-to-code linkage when the package activates that behavior. The existence of the relation family is part of the abstract graph model; the Ladybug-specific concern here is only how it is materialized physically.

Relationship tables have no persisted edge properties unless a future implementation-specific requirement adds them explicitly.

### Requirement: Full-text search implementation

`LadybugGraphStore` SHALL implement symbol and spec search using Ladybug's full-text search facilities.

The adapter MUST:

- create the Ladybug FTS indexes needed to satisfy the abstract `GraphStore.searchSymbols()` and `GraphStore.searchSpecs()` contract
- index symbols using both the stored symbol name and the backend-specific expanded search text used for compound-name matching
- index spec title, description, and full content for spec search
- rebuild or recreate FTS indexes when required by the backend after bulk data changes

The relevance scores returned through the abstract store contract MAY be backend-specific, but results SHALL be ordered from highest to lowest relevance.

The Ladybug FTS schema MUST include:

- **`symbol_fts`** — covering `Symbol.searchName` and `Symbol.comment`
- **`spec_fts`** — covering `Spec.title`, `Spec.description`, and `Spec.content`

The implementation MAY use stemming or other backend-supported ranking/indexing options, provided the abstract graph-store contract remains satisfied.

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

## Constraints

- `LadybugGraphStore` is an infrastructure adapter, not part of the abstract graph-store contract
- `ladybug` is the stable backend id used to select this adapter from a multi-backend graph-store registry
- Ladybug-specific file layout, FTS behavior, schema shape, and schema-version handling are defined here, not in `code-graph:code-graph/graph-store`
- All Ladybug scratch files and persisted database artifacts are rooted under `configPath`
- Node table layout, relationship tables, and FTS index shape defined here are Ladybug-specific and MUST NOT be treated as a portable graph-store schema
- Storage-agnostic use cases and CLI commands MUST NOT depend on this spec unless they truly require Ladybug-specific behavior

## Spec Dependencies

- [`code-graph:code-graph/graph-store`](../graph-store/spec.md) — abstract graph-store contract implemented by this adapter
- [`core:core/config`](../../../core/config/spec.md) — `configPath` and derived graph/temp directories
- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — persisted node and relation concepts
- [`code-graph:code-graph/workspace-integration`](../workspace-integration/spec.md) — workspace-prefixed file and spec identity rules
