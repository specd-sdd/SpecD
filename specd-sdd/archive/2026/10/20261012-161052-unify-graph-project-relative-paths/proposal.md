# Proposal: unify-graph-project-relative-paths

## Motivation

When consuming structured outputs (`json` and `toon`) from Code Graph commands (`graph search`, `graph hotspots`, and `graph impact`), developers, AI agents, and host adapters (such as CLI, MCP, and IDE extensions) face inconsistent and unnavigable path representations. Symbol search results emit only canonical workspace identities (`cli:src/commands/graph/search.ts`), with no path relative to the project root (`projectRoot`), preventing direct filesystem reads without bespoke workspace root lookup logic. Furthermore, existing commands alternate arbitrarily between `configRelativePath`, `displayPath`, and canonical paths.

Replacing these legacy, fragmented field names with a single, unified `projectRelativePath` across all graph queries—persisted and owned directly inside `@specd/code-graph` (backed by zero-join denormalization in SQLite schema v14 per ADR-0028), forwarded through host-agnostic `@specd/sdk` orchestrators, and presented cleanly by `@specd/cli` without backward-compatibility technical debt—ensures a consistent, performant, and cohesive contract across the entire system.

## Current behaviour

1. **`specd graph search --symbols` (JSON/TOON):** Emits `symbol.filePath`, `declaration.location.filePath`, and `logicalTarget.surface` strictly as canonical graph paths (`<workspace>:<workspaceRelativePath>`, e.g., `cli:src/commands/graph/search.ts`). No repository/project root relative path is exposed or persisted for symbols.
2. **`specd graph search --files` and `--documents` (JSON/TOON):** Exposes `path` (canonical) and `configRelativePath` (`packages/cli/...`), using misleading "config" terminology when referencing source code and markdown documents.
3. **`specd graph hotspots` (JSON/TOON):** Exposes `symbol.filePath` (canonical) and introduces `displayPath` (`packages/core/...`), deviating from the field names used in search.
4. **`specd graph impact` (JSON/TOON):** Exposes `canonicalPath` and `displayPath` for targets, while replacing `symbol.filePath` in affected symbols and affected files with project-relative strings without uniform property naming.
5. **Database Schema & Domain Asymmetry:**
   - In SQLite schema version 13, `files` and `documents` have `config_relative_path`, but `symbols` has no project-relative path column.
   - Performing SQL-level joins between `symbols` and `files` on textual workspace paths (`s.file_path = f.path`) across 35,000+ symbols adds unnecessary query latency to hotspot rankings and symbol queries.
6. **CLI Presentation vs SDK Orchestration:**
   - Command hosts (CLI, MCP) need high-level orchestrators (`runGraphSearch`, `runGraphHotspots`, `runGraphImpact`) to manage provider lifecycles and polymorphic input selectors, but the path data itself should originate natively from the code-graph store rather than being patched via host-level in-memory string projections.

## Proposed solution

1. **Native `projectRelativePath` in `@specd/code-graph` & SQLite Schema v14 (ADR-0028):**
   - Bump SQLite schema version to `14`.
   - Rename `config_relative_path` to `project_relative_path` in `files` and `documents` tables.
   - Add `project_relative_path TEXT NOT NULL` to the `symbols` table, denormalized at index time from the owning file/workspace configuration.
   - Because file re-indexing deletes and re-inserts all symbols for that file atomically (`DELETE FROM symbols WHERE file_path = ?`), denormalization carries zero drift risk and guarantees **zero-join query performance** across tens of thousands of symbols.
   - Update domain models: `SymbolNode`, `FileNode`, and `DocumentNode` expose `readonly projectRelativePath: string`.
   - Update `LogicalDeclaration.location` to expose `projectRelativePath`.
   - Graph indexer populates `projectRelativePath` on all file, document, and symbol nodes.
2. **Host-Agnostic SDK Orchestration (`@specd/sdk/src/orchestration/`):**
   - Provide host-agnostic orchestration use cases in `@specd/sdk`:
     - `runGraphSearch(ctx, input)`: executes search via provider supporting all options, emitting native `projectRelativePath` across all categories.
     - `runGraphHotspots(ctx, input)`: executes hotspots ranking via provider supporting all options, emitting native `projectRelativePath` for all hot symbols.
     - `runGraphImpact(ctx, input)`: executes impact analysis via provider across all target types (file, symbol, spec, export), resolving input selectors and emitting native `projectRelativePath` across targets and affected nodes.
   - Eliminates in-memory path projection hacks; the SDK simply passes through the rich, native graph domain data.
3. **Unify strictly around `projectRelativePath` (no backward compatibility):**
   - Establish `projectRelativePath` (relative to `projectRoot`) as the sole, authoritative repository path across all Code Graph structured outputs (`json` and `toon`).
   - Remove legacy field names (`configRelativePath`, `displayPath`, and `displayTargets`) completely without backward-compatibility aliases.
   - Incompatible SQLite schemas trigger a clean, destructive rebuild on next graph index (standard SpecD schema upgrade policy).
4. **Refactor `@specd/cli` as Thin Presenter:**
   - `packages/cli/src/commands/graph/{search,hotspots,impact}.ts` consume SDK orchestration functions directly.
   - CLI commands handle Commander argument parsing, formatting (`text`, `json`, `toon`), and terminal rendering.
5. **Update CLI Help Texts and Documentation Architecture:**
   - Update `--help` schema documentation in CLI commands.
   - Document user/agent workflows in `docs/cli/graph.md` and `docs/guide/code-graph.md`.
   - Document programmatic SDK orchestrators in `docs/sdk/index.md`.

## Specs affected

### New specs

- `sdk:run-graph-search`: Orchestrates graph search across symbols, files, specs, and documents, exposing native `projectRelativePath` and omitting `configRelativePath`.
  - Depends on: `core:config`, `sdk:host-context`, `sdk:with-open-graph-provider`, `code-graph:composition`, `code-graph:document-model`
- `sdk:run-graph-hotspots`: Orchestrates hotspot rankings, exposing native `projectRelativePath` and omitting `displayPath`.
  - Depends on: `core:config`, `sdk:host-context`, `sdk:with-open-graph-provider`, `code-graph:composition`, `code-graph:hotspots`
- `sdk:run-graph-impact`: Orchestrates file, symbol, and spec impact analysis, resolving input selectors and exposing native `projectRelativePath` while omitting `displayPath` and `displayTargets`.
  - Depends on: `core:config`, `sdk:host-context`, `sdk:with-open-graph-provider`, `code-graph:traversal`, `code-graph:workspace-integration`

### Modified specs

- `code-graph:symbol-model`: Update `SymbolNode` and `FileNode` domain specifications to require `projectRelativePath` and remove `configRelativePath`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:document-model`: Update `DocumentNode` domain specification to require `projectRelativePath` and remove `configRelativePath`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:workspace-integration`: Update workspace integration requirements and indexer pipeline to compute and persist `projectRelativePath` across files, documents, and symbols.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: Update schema version to 14, define `project_relative_path` across `files`, `documents`, and `symbols` tables, and require zero-join symbol retrieval.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-search`: Update structured output specifications (JSON/TOON) to require `projectRelativePath` across hits, declarations, and surfaces, delegating orchestration to `sdk:run-graph-search`.
  - Depends on (added): `sdk:run-graph-search`
  - Depends on (removed): none
- `cli:graph-hotspots`: Update structured output specifications (JSON/TOON) to require `projectRelativePath` alongside canonical identifiers, delegating orchestration to `sdk:run-graph-hotspots`.
  - Depends on (added): `sdk:run-graph-hotspots`
  - Depends on (removed): none
- `cli:graph-impact`: Update structured output specifications (JSON/TOON) to require `projectRelativePath` alongside canonical selectors, delegating orchestration to `sdk:run-graph-impact`.
  - Depends on (added): `sdk:run-graph-impact`
  - Depends on (removed): none

## Impact

- **Code Graph Engine (`packages/code-graph`):**
  - Schema upgrade to version 14 in `schema.ts`.
  - `SymbolNode`, `FileNode`, `DocumentNode`, and `LogicalDeclaration` updated with `projectRelativePath`.
  - `index-code-graph.ts` computes and propagates `projectRelativePath` to all nodes during index extraction.
  - `sqlite-graph-database.ts` bulk inserts, prepared statements, and queries updated to store and read `project_relative_path`.
- **SDK Layer (`packages/sdk`):**
  - Orchestration modules in `src/orchestration/run-graph-search.ts`, `run-graph-hotspots.ts`, and `run-graph-impact.ts` pass through native `projectRelativePath`.
  - Exposed via public SDK barrel `src/index.ts`.
- **CLI Presentation Layer (`packages/cli`):**
  - `packages/cli/src/commands/graph/{search,hotspots,impact}.ts` consume SDK orchestration functions directly.
- **Documentation & Architecture:**
  - ADR-0028 documents denormalization rationale.
  - End-user guides updated in `docs/cli/graph.md` and `docs/guide/code-graph.md`.
  - Integrator docs updated in `docs/sdk/index.md`.

## Technical context

- **Root Anchor:** In SpecD, `projectRoot` is the authoritative anchor representing the repository root containing `specd.yaml`.
- **ADR-0028 Rationale:** Denormalizing `project_relative_path` into `symbols` eliminates join overhead in query-intensive loops across 35k+ symbols while maintaining atomicity because files re-index their symbols in a single transaction.
- **Breaking Change / Zero Aliases:**
  - `configRelativePath`, `displayPath`, and `displayTargets` are fully eliminated without backward-compatibility aliases.
- **Architectural Boundary:**
  - Graph domain math and storage live in `@specd/code-graph`.
  - Host lifecycle and orchestration helpers live in `@specd/sdk`.
  - Presentation and argument parsing live in `@specd/cli`.

## Open questions

None. The architectural shift to SQLite schema v14 denormalization (ADR-0028) and SDK helper simplification was evaluated, agreed upon, and documented.
