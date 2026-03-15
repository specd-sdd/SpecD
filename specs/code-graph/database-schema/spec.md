# Database Schema

## Purpose

The code graph persists files, symbols, specs, and their relationships in a LadybugDB embedded graph database. The schema defines the exact node tables, relationship tables, full-text search indexes, and versioning strategy. Having the schema specified ensures changes are deliberate and migration-aware.

## Requirements

### Requirement: Node tables

The database SHALL define the following node tables:

**File** — source files indexed from workspace code roots.

| Column      | Type   | Notes                                      |
| ----------- | ------ | ------------------------------------------ |
| path        | STRING | Primary key. `{workspace}/{relativePath}`. |
| language    | STRING | Language identifier (e.g. `typescript`).   |
| contentHash | STRING | SHA-256 hash of file content.              |
| workspace   | STRING | Workspace name (e.g. `core`, `cli`).       |

**Symbol** — code symbols extracted from files.

| Column   | Type   | Notes                                           |
| -------- | ------ | ----------------------------------------------- |
| id       | STRING | Primary key. `{filePath}:{kind}:{name}:{line}`. |
| name     | STRING | Symbol's declared name.                         |
| kind     | STRING | `SymbolKind` value.                             |
| filePath | STRING | References `File.path`.                         |
| line     | INT64  | 1-based line number.                            |
| col      | INT64  | 0-based column offset.                          |
| comment  | STRING | Raw preceding comment text, or empty string.    |

**Spec** — specification documents from workspace spec directories.

| Column      | Type   | Notes                                                                                                                                                         |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| specId      | STRING | Primary key. `{workspace}:{specPath}`.                                                                                                                        |
| path        | STRING | Spec path within the workspace.                                                                                                                               |
| title       | STRING | From `.specd-metadata.yaml` `title` field.                                                                                                                    |
| description | STRING | From `.specd-metadata.yaml` `description` field.                                                                                                              |
| contentHash | STRING | SHA-256 hash of concatenated artifacts (excluding `.specd-metadata.yaml`).                                                                                    |
| content     | STRING | Concatenated artifact text for full-text search. `spec.md` first if present, then remaining artifacts in alphabetical order. Excludes `.specd-metadata.yaml`. |
| workspace   | STRING | Workspace name.                                                                                                                                               |

**Meta** — key-value metadata for the database itself.

| Column | Type   | Notes                             |
| ------ | ------ | --------------------------------- |
| key    | STRING | Primary key (e.g. `lastIndexed`). |
| value  | STRING | Metadata value.                   |

### Requirement: Relationship tables

The database SHALL define the following relationship tables:

| Relationship | From   | To     | Populated by        |
| ------------ | ------ | ------ | ------------------- |
| IMPORTS      | File   | File   | Indexer Pass 2      |
| DEFINES      | File   | Symbol | Indexer Pass 1      |
| CALLS        | Symbol | Symbol | Indexer Pass 2      |
| EXPORTS      | File   | Symbol | Indexer Pass 1      |
| DEPENDS_ON   | Spec   | Spec   | Spec indexing phase |
| COVERS       | Spec   | File   | Deferred to v2+     |

Relationships have no properties — they are pure edges.

### Requirement: Full-text search indexes

The database SHALL create FTS indexes after schema initialization:

**`symbol_fts`** — on the `Symbol` table, covering `name` and `comment` columns. Enables keyword search across symbol names and their documentation comments.

**`spec_fts`** — on the `Spec` table, covering `title`, `description`, and `content` columns. Enables keyword search across spec documentation.

Both indexes use the `porter` stemmer for English-language stemming. Indexes are created using `CREATE_FTS_INDEX` and queried using `QUERY_FTS_INDEX`, which returns results ranked by BM25 score.

FTS indexes are created once during `open()` after schema DDL. If the index already exists, creation is skipped (idempotent).

### Requirement: Schema versioning

The schema SHALL be versioned with an integer `SCHEMA_VERSION` constant. The current version is **3**. When the database is opened:

1. Execute the DDL statements (all use `IF NOT EXISTS` — safe to re-run)
2. Create FTS indexes if they do not exist
3. Store the schema version in the `Meta` table

Schema version changes require a `--force` re-index to rebuild the database from scratch. There is no incremental migration between versions — the `.lbug` file is deleted and recreated.

### Requirement: Database file location

The database file SHALL be stored at `{storagePath}/.specd/code-graph.lbug`. The `storagePath` is the project root (derived from `SpecdConfig.projectRoot` or passed directly as `CodeGraphOptions.storagePath`). The `.specd/` directory is created automatically on first `open()` if it does not exist.

## Constraints

- All node table primary keys are STRING — no auto-increment
- `comment` on Symbol is stored as empty string (not NULL) when no comment exists, to enable FTS indexing
- `content` on Spec may be large (full spec text) — no size limit enforced
- FTS indexes are rebuilt on `--force` re-index (dropped with the database)
- Relationship tables have no properties — metadata is not persisted on edges
- The `COVERS` relationship table exists in the schema but is not populated until v2+

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — node types and field definitions
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` port and `LadybugGraphStore` adapter
- [`specs/code-graph/workspace-integration/spec.md`](../workspace-integration/spec.md) — workspace-prefixed paths and specId format
