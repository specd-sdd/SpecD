# Design: unify-graph-project-relative-paths

## Overview

This change unifies the repository filesystem path contract across the SpecD platform around `projectRelativePath` (relative to `projectRoot`). It addresses three complementary layers:

1. **Native Code-Graph Domain & Storage Ownership (ADR-0028):** `@specd/code-graph` natively owns `projectRelativePath` across all graph node types (`FileNode`, `DocumentNode`, and `SymbolNode`). In SQLite schema version 14, `project_relative_path` is denormalized directly into the `symbols` table at index time. This delivers **zero-join** query execution across 35,000+ symbols in search, traversal, and hotspot calculations without runtime overhead.
2. **Host-Agnostic SDK Orchestration (`@specd/sdk`):** Provides first-class orchestration helpers (`runGraphSearch`, `runGraphHotspots`, and `runGraphImpact`) for tool hosts (CLI, MCP, IDE plugins). These helpers manage provider lifecycles and resolve polymorphic input selectors while passing through native `projectRelativePath` properties emitted by `@specd/code-graph`.
3. **Thin CLI Presentation (`@specd/cli`):** Refactors Code Graph commands to delegate execution to `@specd/sdk` and focus exclusively on Commander argument parsing, formatting (`text`, `json`, `toon`), and terminal rendering.
4. **Zero Backward Compatibility:** Legacy fields (`configRelativePath`, `displayPath`, and `displayTargets`) are completely removed without aliases or fallback wrappers.

## Affected areas

### 1. `@specd/code-graph` — Domain & SQLite Store Layer

- **Schema & DDL (`packages/code-graph/src/infrastructure/sqlite/schema.ts`):**
  - Bump `SQLITE_SCHEMA_VERSION = 14`.
  - Update `files` table: replace `config_relative_path` with `project_relative_path TEXT NOT NULL DEFAULT ''`.
  - Update `documents` table: replace `config_relative_path` with `project_relative_path TEXT NOT NULL DEFAULT ''`.
  - Update `symbols` table: add `project_relative_path TEXT NOT NULL DEFAULT ''`.
- **Domain Value Objects (`packages/code-graph/src/domain/`):**
  - `value-objects/symbol-node.ts`: Add `readonly projectRelativePath: string` to `SymbolNode`.
  - `value-objects/file-node.ts`: Replace `configRelativePath` with `readonly projectRelativePath: string` in `FileNode`.
  - `value-objects/document-node.ts`: Replace `configRelativePath` with `readonly projectRelativePath: string` in `DocumentNode`.
  - `value-objects/logical-symbol.ts`: Ensure `LogicalDeclaration.location` includes `readonly projectRelativePath: string`.
- **Indexing Pipeline (`packages/code-graph/src/application/use-cases/index-code-graph.ts`):**
  - Calculate `projectRelativePath` from `projectRoot` and workspace `codeRoot` during discovery.
  - Populate `projectRelativePath` on every `FileNode`, `DocumentNode`, and `SymbolNode` during extraction.
- **SQLite Database Adapter (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`):**
  - Update prepared statements: `insertFileStmt`, `insertDocumentStmt`, `insertSymbolStmt`.
  - Update bulk session staging, row mappers, and FTS indexing.
  - Update queries: `searchSymbols`, `searchDocuments`, `getSymbolsByIds`, `getFilesByPaths`, `getDocumentsByPaths`, `computeHotspots`.
  - Schema upgrade validation: reject schema <= 13 with `GraphSchemaIncompatibleError` (triggers destructive rebuild on `graph index`).

### 2. `@specd/sdk` — Orchestration Helpers

- **New orchestration modules (`packages/sdk/src/orchestration/`):**
  - `run-graph-search.ts`: Calls `provider.search()`, returns categorized results with native `projectRelativePath`.
  - `run-graph-hotspots.ts`: Calls `provider.hotspots()`, returns ranked entries with native `projectRelativePath`.
  - `run-graph-impact.ts`: Resolves polymorphic target selectors (file, symbol, spec, export), calls `provider.impact()`, and formats results with native `projectRelativePath`.
  - `project-relative-path.ts`: Shared path helper (`toProjectRelativePath`, `splitWorkspaceIdentity`) for host selector normalization.
- **Exports (`packages/sdk/src/index.ts` & `src/orchestration/index.ts`):**
  - Publicly re-export orchestration functions, input types, and result types.

### 3. `@specd/cli` — Presentation Layer

- **`packages/cli/src/commands/graph/search.ts`:** Delegate to `runGraphSearch`. Format tables/JSON/TOON using `projectRelativePath`.
- **`packages/cli/src/commands/graph/hotspots.ts`:** Delegate to `runGraphHotspots`. Format tables/JSON/TOON using `projectRelativePath`.
- **`packages/cli/src/commands/graph/impact.ts`:** Delegate to `runGraphImpact`. Format trees/JSON/TOON using `projectRelativePath`.

### 4. Documentation

- **`docs/adr/0028-denormalized-project-relative-paths-in-code-graph-sqlite-store.md`:** ADR documenting denormalization rationale.
- **`docs/cli/graph.md`:** User-facing CLI documentation with updated JSON/TOON schemas.
- **`docs/guide/code-graph.md`:** End-user and agent guide explaining canonical vs project-relative paths.
- **`docs/sdk/index.md`:** Technical reference for SDK integrators.

---

## Technical architecture & DDL

### SQLite Schema Version 14 DDL (`packages/code-graph/src/infrastructure/sqlite/schema.ts`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  project_relative_path TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  workspace TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'source',
  embedding BLOB,
  content TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  path TEXT PRIMARY KEY,
  project_relative_path TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  workspace TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  project_relative_path TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  line INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  selection_start_line INTEGER NOT NULL,
  selection_start_column INTEGER NOT NULL,
  selection_end_line INTEGER NOT NULL,
  selection_end_column INTEGER NOT NULL,
  comment TEXT,
  search_text TEXT NOT NULL,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);
```

### Zero-Join Query Optimization (ADR-0028)

Instead of querying symbol locations via a relational join:

```sql
-- Legacy / Normalized approach: requires string join across 35k+ rows
SELECT s.*, f.project_relative_path
FROM symbols s
JOIN files f ON s.file_path = f.path;
```

The v14 schema queries `symbols` directly with zero joins:

```sql
-- Zero-Join approach (ADR-0028):
SELECT id, name, kind, file_path, project_relative_path, line, column_number, ...
FROM symbols
WHERE name = ?;
```

Because file mutations delete and insert all file symbols atomically within a single transaction (`DELETE FROM symbols WHERE file_path = ?`), there is zero drift risk between `files.project_relative_path` and `symbols.project_relative_path`.

---

## Domain models

### `SymbolNode` (`packages/code-graph/src/domain/value-objects/symbol-node.ts`)

```ts
export interface SymbolNode {
  readonly id: string
  readonly name: string
  readonly kind: SymbolKind
  readonly filePath: string
  readonly projectRelativePath: string
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  readonly selectionRange: SourceRange
  readonly comment?: string
  readonly searchText?: string
}
```

### `FileNode` (`packages/code-graph/src/domain/value-objects/file-node.ts`)

```ts
export interface FileNode {
  readonly path: string
  readonly projectRelativePath: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
  readonly category?: FileCategory
  readonly embedding?: Float32Array
}
```

### `DocumentNode` (`packages/code-graph/src/domain/value-objects/document-node.ts`)

```ts
export interface DocumentNode {
  readonly path: string
  readonly projectRelativePath: string
  readonly contentHash: string
  readonly content: string
  readonly workspace: string
}
```

---

## SDK orchestration contract

### `runGraphSearch` (`packages/sdk/src/orchestration/run-graph-search.ts`)

Executes `provider.search(options)`. Emits structured categories (`symbols`, `files`, `specs`, `documents`) where every location exposes `projectRelativePath`. Accepts full search parameter options including `exactFile`, `filePattern` (alias for `file`), and `includeSnippet` (alias for `snippet`), forwarding `exactFile` and canonical filters to `provider.search(...)`.

### `runGraphHotspots` (`packages/sdk/src/orchestration/run-graph-hotspots.ts`)

Executes `provider.getHotspots(options)`. Emits ranked symbols with `projectRelativePath` directly populated from the underlying `SymbolNode` (with fallback to `toProjectRelativePath(config, filePath)` if omitted). Accepts both `file` and `filePath` aliases.

### `runGraphImpact` (`packages/sdk/src/orchestration/run-graph-impact.ts`)

Resolves polymorphic input selectors (file paths, symbol names, spec IDs, and public export routes via `export` and `from`/`surface`), executes the corresponding provider impact method (`analyzeFileImpact`, `analyzeFilesImpact`, `analyzeSymbolImpact`, `analyzeSpecImpact`, or `analyzePublicBindingImpact`), and emits results with `canonicalPath` and `projectRelativePath` across all target and affected entries (including `projectRelativeSurface` for public export routes). The CLI impact command delegates public export impact directly to `runGraphImpact`, eliminating duplicated provider queries and raw canonical paths.

---

## Testing strategy

### 1. Code-Graph Tests (`packages/code-graph/test/`)

- **Schema & Store (`sqlite-graph-store.spec.ts`):**
  - Verify SQLite schema version is 14.
  - Verify database recreation on schema incompatibility (versions <= 13 reject read and rebuild on index; version 15 forward incompatibility rejects).
  - Verify `files`, `documents`, and `symbols` store and retrieve `project_relative_path`.
  - Verify zero-join performance on symbol retrieval and hotspot ranking.
- **Domain & Indexer (`index-code-graph.spec.ts`, `symbol-model.spec.ts`, `file-node.spec.ts`):**
  - Verify indexer computes and assigns `projectRelativePath` to files, documents, and symbol nodes.
  - Verify `FileNode` equality using canonical `path` even when `projectRelativePath` differs.
  - Verify `FileNode` and `DocumentNode` with parent `..` segments.
- **Workspace Integration (`resolve-graph-selector.spec.ts`):**
  - Verify resolving absolute path selectors normalized to `projectRelativePath` against `projectRoot`.
  - Verify resolving paths containing parent segments (`../../`).

### 2. SDK Tests (`packages/sdk/test/orchestration/`)

- `run-graph-search.spec.ts`:
  - Verify search returns native `projectRelativePath` on symbols, files, and documents.
  - Verify option forwarding (`exactFile`, `kinds`, filters) and aliases (`filePattern`, `includeSnippet`).
  - Verify transient provider lifecycle (clean open/close) and caller-owned provider (not closed).
- `run-graph-hotspots.spec.ts`:
  - Verify hotspots output includes `projectRelativePath` and derived `workspace`, and excludes `displayPath`.
  - Verify option forwarding and alias mapping (`filePath` to `file`).
  - Verify transient and caller-owned provider lifecycles.
- `run-graph-impact.spec.ts`:
  - Verify impact analysis returns `projectRelativePath` across targets and affected symbols/files.
  - Verify public export route impact analysis (`export` and `from`), returning `projectRelativeSurface` and projected affected files.
  - Verify spec impact analysis (`{ spec: 'core:config' }`).
  - Verify option forwarding (`direction`, `depth`, `filter`) and transient provider lifecycle.

### 3. CLI Integration Tests (`packages/cli/test/commands/`)

- `graph-search.spec.ts`:
  - Test `--format json` and `--format toon` output schemas.
  - Test document search results emitting `projectRelativePath` without `configRelativePath` in JSON mode, and text grouping under `Documents (`.
- `graph-hotspots.spec.ts`:
  - Test `--format json` and `--format toon` output schemas.
- `graph-impact.spec.ts`:
  - Test `--format json` and `--format toon` output schemas.
  - Test `--symbol ... --format json` asserting `projectRelativePath` presence and `displayPath` absence.
  - Test public export impact delegating to SDK and formatting affected paths as `projectRelativePath`.

---

## Documentation updates

- Update `docs/cli/graph.md` to document the unified `projectRelativePath` contract in CLI outputs.
- Update `docs/guide/code-graph.md` to explain how AI agents and users navigate paths.
- Update `docs/sdk/index.md` to document SDK orchestration helpers.

---

## Open questions

None. All architectural decisions (ADR-0028 denormalization, schema version 14, zero backward compatibility, SDK helper role, and public export delegation) have been reviewed and accepted.
