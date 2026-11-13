---
status: accepted
date: 2026-10-13
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0028: Denormalized Project-Relative Paths in Code Graph SQLite Store

## Context and Problem Statement

The SQLite Code Graph store (`@specd/code-graph`) previously maintained an asymmetric and legacy path representation across its relational model:

- The `files` and `documents` tables stored a legacy `config_relative_path` column (representing the path relative to the repository project root containing `specd.yaml`).
- The `symbols` table (as well as `logical_symbols`, `logical_declarations`, and `public_bindings`) stored only the canonical workspace identity `file_path` (`<workspace>:<relPath>`, e.g., `cli:src/commands/graph/search.ts`).

Downstream consumers—including human developers, AI coding assistants, and delivery hosts (`@specd/cli`, `@specd/mcp`, and IDE extensions)—require filesystem-navigable, repository-relative paths (`packages/core/src/...`) to open, read, and edit files directly without manual workspace mapping.

Because `symbols` lacked this path, previous versions attempted to bridge the gap either by ad-hoc string formatting in the CLI (`displayPath` in hotspots and impact) or by adding in-memory projection wrappers in `@specd/sdk`. This created unnecessary complexity and left `code-graph` internally asymmetric.

To provide `projectRelativePath` across all graph entities (`files`, `documents`, and `symbols`) directly in `@specd/code-graph`, we must decide how to store and resolve this path in the SQLite database without compromising query performance on large repositories with tens of thousands of symbols.

## Decision Drivers

- **Zero-Join Query Performance** — Code Graph is an interactive, read-heavy intelligence engine queried frequently by AI agents and CLI commands. High-volume operations (such as BM25 symbol search, FTS queries, and architectural hotspots ranking across 35,000+ symbols) must not suffer CPU overhead from joining tables on text columns.
- **Data Symmetry & Domain Cleanliness** — `SymbolNode`, `FileNode`, and `DocumentNode` should all provide `projectRelativePath` natively. No graph entity should be a second-class citizen requiring out-of-band resolution.
- **Relational Integrity via Atomic File Replacement** — In Code Graph, files are indexed atomically. When a file changes, all its local state and symbols are deleted (`DELETE FROM symbols WHERE file_path = ?`) and reinserted in batch chunks. Symbols are never updated independently of their containing file.
- **Ephemeral Cache Nature** — The SQLite database (`.specd/config/graph/sqlite.db`) is a local, disposable index cache, not a transactional financial database. Optimizing for read speed and simplicity outweighs micro-optimizations for disk storage normalization.
- **Host Agnosticism** — Delivery hosts (CLI, MCP, IDE extensions) should receive clean, complete `projectRelativePath` attributes directly from `CodeGraphProvider` without needing secondary path-projection layers.

## Considered Options

1. **Relational Normalization with Text-Based JOINs at Query Time**
   - Store `project_relative_path` only in `files`. Querying symbols requires `SELECT s.*, f.project_relative_path FROM symbols s JOIN files f ON s.file_path = f.path`.
   - _Rejected_: While theoretically normalized, `symbols.file_path` and `files.path` are text strings (e.g. `cli:src/commands/graph/search.ts`). Executing text-based joins across tens of thousands of symbol rows during hotspot calculations or symbol scans introduces unnecessary CPU overhead and complicates SQLite prepared queries and FTS ranking.

2. **Surrogate Integer Primary Keys (`file_id INTEGER PRIMARY KEY`) with Integer JOINs**
   - Introduce integer surrogate keys for `files`, store `file_id` on `symbols`, and join on 64-bit integers.
   - _Rejected_: Code Graph's domain model and relation edges (`relations`, `logical_symbols`, `public_bindings`) are designed around stable canonical string identities (`workspace:relPath`) that remain invariant across file updates and index runs. Introducing surrogate numeric IDs would require an invasive rewrite of all foreign keys, relation builders, and domain value objects across the entire code-graph package.

3. **Denormalization at Index Time (Store `project_relative_path` in `symbols`)** — _Chosen_
   - During indexing, the indexer already resolves each file's absolute path and its project-relative path (`relative(projectRoot, absPath)`).
   - When batch-inserting symbols into SQLite, the indexer inserts `project_relative_path` directly into the `symbols` table alongside `file_path`.
   - Queries reading symbols (`getSymbol`, `findSymbols`, `search`, `getHotspots`, `analyzeImpact`) perform single-table SELECTs with zero joins.

## Decision Outcome

Adopt **Option 3 (Denormalization at Index Time)**:

1. **SQLite Schema Version 14:**
   - In `files`: rename `config_relative_path` to `project_relative_path TEXT NOT NULL DEFAULT ''`.
   - In `documents`: rename `config_relative_path` to `project_relative_path TEXT NOT NULL DEFAULT ''`.
   - In `symbols`: add `project_relative_path TEXT NOT NULL DEFAULT ''`.
   - Legacy property `config_relative_path` is completely eliminated from the database schema.
2. **Domain Value Objects:**
   - `SymbolNode` exposes `readonly projectRelativePath: string`.
   - `FileNode` and `DocumentNode` expose `readonly projectRelativePath: string` (and drop `configRelativePath`).
   - `LogicalDeclaration.location` exposes `readonly projectRelativePath: string`.
3. **Indexing Session:**
   - `index-code-graph.ts` computes `projectRelativePath` once per file and applies it to `FileNode`, `DocumentNode`, and all extracted `SymbolNode` instances before bulk database insertion.
4. **Zero-Join Query Execution:**
   - All symbol queries read `project_relative_path` directly from the `symbols` table. No table joins are required.

## Pros and Cons of the Selected Option

### Pros

- **Maximum Read Performance:** Single-table reads with zero join latency for all symbol, file, and document queries.
- **Symmetric API Surface:** All graph nodes consistently expose both canonical `path` / `filePath` (`workspace:relPath`) and repository-relative `projectRelativePath`.
- **Zero Risk of Drift:** Because file re-indexing deletes and re-inserts all symbols for that file atomically, the denormalized path can never get out of sync.
- **Simpler SDK & Delivery Hosts:** `@specd/sdk` and delivery hosts (`@specd/cli`, `@specd/mcp`) receive fully resolved entities directly from `CodeGraphProvider` without manual path translation.

### Cons

- **Minor Storage Overhead:** Storing the relative path string in the `symbols` table adds approximately 2 MB of disk space in repositories with ~35,000 symbols. This is negligible for an ephemeral local cache in `.specd/config/graph/`.
- **Breaking Database Migration:** Requires incrementing `SQLITE_SCHEMA_VERSION` to 14, triggering a clean rebuild of the code graph on first execution after update.
