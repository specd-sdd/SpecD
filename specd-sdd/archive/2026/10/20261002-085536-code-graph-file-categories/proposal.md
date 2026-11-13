# Proposal: code-graph-file-categories

## Motivation

In SpecD's codebase intelligence engine (`code-graph`), every discovered file that is not explicitly blacklisted via `excludePaths` is indexed as an undifferentiated source file. In modern modular and polyglot codebases, test files (`*.spec.ts`, `*_test.go`, `test/**`, etc.) and auxiliary files (fixtures, mocks, scripts) heavily import domain, application, and infrastructure modules for environment setup, assertion mocks, and test harness assembly.

Treating these files identically to production source code fundamentally distorts graph-driven workflows:

1. **Artificial Blast-Radius and Risk Inflation:** In `specd graph impact`, every incoming edge (`CALLS`, `CONSTRUCTS`, `USES_TYPE`, `IMPORTS`) from unit tests is treated as a production dependent. A core utility function imported across 60 unit tests receives a computed `riskLevel` of `CRITICAL` or `HIGH`, completely obscuring the fact that it may have only 1 production caller.
2. **Transitive Bridge Contamination:** In bidirectional traversals (`--direction both`) or transitive dependency walks, a test file that imports both `ModuleA` and `ModuleB` acts as an artificial relational bridge, causing BFS traversals to falsely report that changes to `ModuleA` impact `ModuleB`.
3. **Hotspot Score Distortion:** The `computeHotspots` scoring algorithm weights same-workspace callers ($3\times$), cross-workspace callers ($5\times$), and file importers ($1\times$). Heavily tested methods get disproportionately high scores, and test helpers or test files themselves frequently occupy top hotspot positions.
4. **Search Surface Pollution:** In `specd graph search`, BM25 keyword matching returns mocks, test stubs, test fixtures, and test suites alongside production declarations.

Excluding these files completely via `excludePaths` is unacceptable because they would never be indexed in SQLite: test-to-code traceability, spec verification links (`COVERS_FILE`, `COVERS_SYMBOL`), and the ability to query test dependencies on demand would be entirely lost. We need a first-class categorization model that indexes test and auxiliary files but isolates them from default calculations and results, providing explicit visibility notices and granular inclusion/filtering flags.

## Current behaviour

Currently, file discovery and SQLite persistence recognize only a binary distinction between indexed files and completely excluded files:

- **File Discovery & Storage:** `IndexProjectGraph` traverses workspace directories. Files matching `graph.excludePaths` or `.gitignore` are discarded before reaching language adapters. Files that pass are parsed, assigned a `FileNode`, and stored in the SQLite `files` table without any semantic role designation.
- **Relational Storage:** The SQLite `files` table has schema:
  `CREATE TABLE files (path TEXT PRIMARY KEY, config_relative_path TEXT NOT NULL DEFAULT '', language TEXT NOT NULL, content_hash TEXT NOT NULL, workspace TEXT NOT NULL, embedding BLOB, content TEXT);`
  There is no column or index indicating whether a file represents production code, test code, or auxiliary fixtures.
- **Traversal & Impact Analysis:**
  - `analyzeImpact` and `analyzeFileImpact` invoke `GraphStore.queryImpactFrontier`.
  - In `SQLiteGraphDatabase.queryImpactFrontierDirection`, SQL queries join `symbols n ON n.id = endpoint` and `files f ON f.path = n.file_path`.
  - The query filters solely on `f.workspace` and `n.kind`. Every incoming relation from any indexed file is admitted into the frontier.
  - The risk level is computed by `computeRiskLevel(directDependents, indirectDependents, transitiveDependents)`. Because test files contribute dozens of callers, risk calculations are skewed upwards.
- **Hotspot Calculation:**
  - `computeHotspots` queries `GraphStore.getAllSymbols()` and aggregates caller counts. Callers located in test files are counted with the same weight as callers in production modules.
- **Search:**
  - `SQLiteGraphDatabase.findSymbols` searches the SQLite FTS index without filtering on file semantics, returning test doubles and test helpers.

## Proposed solution

Introduce a three-tier semantic category model for all indexed files in the code graph:

1. **`source`** (default): Production code. Only `source` files contribute to production blast radius, risk level calculations, and default hotspot rankings.
2. **`test`**: Test and verification files. Fully parsed and indexed in SQLite (AST, symbols, relations preserved), but excluded from default calculations and default outputs.
3. **`ignored`**: Auxiliary files (fixtures, static mocks, dev/scratch scripts, benchmark helpers). Fully indexed in SQLite, but excluded from default calculations and default outputs.

### Technical Architecture & Core Mechanisms

#### 1. Language-Agnostic Configuration Model

Classification is configured via `graph.testPaths` and `graph.ignorePaths` in `specd.yaml` at both project-wide (`SpecdGraphConfig`) and workspace (`SpecdWorkspaceGraphConfig`) levels.

- **Syntax:** Gitignore-compatible glob patterns (supporting `*`, `**`, and `!` negation).
- **Default Patterns:** Built-in language-agnostic conventions apply automatically when not overridden:
  - `testPaths`: `['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`
  - `ignorePaths`: `[]` (empty by default; configured explicitly for fixtures/mocks/scripts).
- **Precedence & Merge Semantics:**
  - An absolute exclusion (`excludePaths`) takes absolute precedence (file is never indexed).
  - Next, if a file path matches `ignorePaths`, it is classified as `ignored`.
  - Next, if a file path matches `testPaths`, it is classified as `test`.
  - Otherwise, the file is classified as `source`.
  - Project-global patterns and workspace-local patterns are additive.

#### 2. Domain & SQLite Schema Modifications

- **Domain Value Object:**

  ```typescript
  export type FileCategory = 'source' | 'test' | 'ignored'
  export const FILE_CATEGORIES: readonly FileCategory[] = ['source', 'test', 'ignored']

  export interface FileNode {
    readonly path: string
    readonly configRelativePath: string
    readonly language: string
    readonly contentHash: string
    readonly workspace: string
    readonly category: FileCategory
    readonly embedding?: Float32Array | undefined
    readonly content?: string | undefined
  }
  ```

- **SQLite Physical Schema:**
  Update `SQLITE_SCHEMA_DDL` in `packages/code-graph/src/infrastructure/sqlite/schema.ts`:
  ```sql
  ALTER TABLE files ADD COLUMN category TEXT NOT NULL DEFAULT 'source';
  CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
  ```
- **Incremental Indexing & Rebuilds:**
  `SQLITE_SCHEMA_VERSION` is incremented. File insertion in `SQLiteGraphDatabase.upsertFile` and `bulkLoad` persists `file.category`.

#### 3. Storage-Level Frontier Filtering (`GraphStore`)

Extend `ImpactResultFilter` and `ImpactFrontierQuery`:

```typescript
export interface ImpactResultFilter {
  readonly types?: readonly ImpactResultType[]
  readonly kinds?: readonly SymbolKind[]
  readonly workspaces?: readonly string[]
  readonly excludeWorkspaces?: readonly string[]
  readonly categories?: readonly FileCategory[] // Defaults to ['source'] when omitted
  readonly includeTests?: boolean // Convenience: adds 'test' to allowed categories
  readonly includeIgnored?: boolean // Convenience: adds 'ignored' to allowed categories
}
```

In `SQLiteGraphDatabase.queryImpactFrontierDirection`:

- When traversing relations, the SQL join condition incorporates category admission:
  ```sql
  JOIN files f ON f.path = n.file_path
  WHERE ... AND f.category IN (${admittedCategories.map(() => '?').join(', ')})
  ```
- Frontier expansion prunes edges leading to non-admitted categories, completely halting BFS traversal through test files during upstream and bidirectional walks. This prevents test files from acting as transitive contamination bridges.

#### 4. Algorithmic Impact & Risk Calculation (`code-graph:traversal`)

- **Metric Isolation:**
  `directDependents`, `indirectDependents`, and `transitiveDependents` are computed solely from admitted category nodes (`source` by default).
- **Risk Level Determination:**
  `riskLevel` is evaluated via `computeRiskLevel` strictly on `source` category dependents. A production function called by 1 production module and 50 unit tests evaluates to `LOW` risk rather than `CRITICAL`.
- **Omission Accounting:**
  `ImpactResult` returns an `omittedCounts` record:
  ```typescript
  export interface ImpactResult {
    readonly target: string
    readonly directDependents: number
    readonly indirectDependents: number
    readonly transitiveDependents: number
    readonly riskLevel: RiskLevel
    readonly affectedFiles: readonly string[]
    readonly affectedSymbols: readonly AffectedSymbol[]
    readonly affectedSpecs: readonly string[]
    readonly affectedProcesses: readonly string[]
    readonly omittedCounts: {
      readonly tests: number
      readonly ignored: number
    }
  }
  ```
  If the target of the impact query itself is a `test` or `ignored` file (e.g. `specd graph impact --file "test/my.spec.ts"`), downstream analysis of that file's dependencies proceeds because the target was explicitly anchored.

#### 5. Hotspot Scoring Isolation (`code-graph:hotspots`)

Extend `HotspotOptions`:

```typescript
export interface HotspotOptions {
  readonly categories?: readonly FileCategory[]
  readonly includeTests?: boolean
  readonly includeIgnored?: boolean
  // ... existing options (workspace, kinds, filePath, limit, minScore, minRisk)
}
```

- In `computeHotspots`:
  - Incoming caller edges (`CALLS`, `CONSTRUCTS`, `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`, `USES_TYPE`) are counted only if the calling symbol resides in an admitted file category (`source` by default).
  - File `IMPORTS` counts only count importing files belonging to an admitted category.
  - Symbols belonging to non-admitted categories are excluded from candidate ranking.
  - Returns `omittedCounts: { tests: number, ignored: number }`.

#### 6. Search Filtering (`cli:graph-search` & `code-graph`)

In `SQLiteGraphDatabase.findSymbols` and full-text search:

- Add category filtering to symbol search queries.
- Default query joins `files f ON f.path = s.file_path WHERE f.category = 'source'`.
- Supports `--category <categories>` (accepting comma-separated values like `--category source,test` or `--category test`), `--include-tests`, `--include-ignored`, and `--all`.
- Redundant `--tests` alias is removed in favor of the uniform `--category test`.

#### 7. CLI User Experience & Visibility Notices

All graph commands (`impact`, `hotspots`, `search`) expose uniform flags:

- `--include-tests`: Include `test` category files alongside `source`.
- `--include-ignored`: Include `ignored` category files.
- `--all`: Include all categories (`source`, `test`, `ignored`).
- `--category <categories>`: Restrict results strictly to the specified category or comma-separated list of categories (e.g. `source,test`, `test`, `ignored`).
- **Visible Notice:**
  When `omittedCounts` indicates that results were filtered out, the CLI prints a conspicuous notice at the conclusion of output:
  - Text mode:
    `ℹ Excluded from results: 14 test files, 2 ignored files. Use --include-tests, --include-ignored, or --all to view them.`
  - Structured mode (`toon` / `json`):
    Includes `omittedCounts: { tests: 14, ignored: 2 }` in the output object, ensuring AI agents and tooling can programmatically detect pruning and re-query with widened scopes.

## Specs affected

### New specs

None.

### Modified specs

- `core:config`: Add project-level and workspace-level configuration for `graph.testPaths` and `graph.ignorePaths` (gitignore-compatible glob patterns) with language-agnostic defaults.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: Update physical SQLite schema (`category` column and index), extend `FileNode`, and update `ImpactResultFilter` / `ImpactFrontierQuery` contracts to support category-aware filtering.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: Prune non-admitted categories during BFS traversal in `queryImpactFrontier`, isolate `riskLevel` computation to `source` dependents, and track omitted item counts in `ImpactResult`.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:hotspots`: Filter incoming caller and importer metrics by file category in `computeHotspots`, prune non-admitted symbols from rankings, and report omitted counts.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: Add `--include-tests`, `--include-ignored`, `--all`, and `--category` flags (supporting comma-separated multi-category values); format and display omitted item notices in human and machine formats.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-hotspots`: Add `--include-tests`, `--include-ignored`, `--all`, and `--category` flags (supporting comma-separated multi-category values); format and display omitted item notices.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-search`: Add `--include-tests`, `--include-ignored`, `--all`, and `--category` flags (supporting comma-separated multi-category values; removing redundant `--tests`); format and display omitted item notices.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

### Affected Code Areas & Components

1. **`@specd/core`**:
   - `packages/core/src/application/specd-config.ts`: Add `testPaths?: readonly string[]` and `ignorePaths?: readonly string[]` to `SpecdGraphConfig` and `SpecdWorkspaceGraphConfig`.
   - `packages/core/src/application/ports/config-schema.ts`: Define Zod schemas for `testPaths` and `ignorePaths`.
   - `packages/core/src/infrastructure/fs/config-loader.ts`: Parse, normalize, and merge project and workspace path rules.
2. **`@specd/code-graph`**:
   - `packages/code-graph/src/domain/value-objects/file-node.ts`: Define `FileCategory`, update `FileNode` interface and `createFileNode` factory.
   - `packages/code-graph/src/domain/value-objects/impact-result.ts`: Extend `ImpactResultFilter` and `ImpactResult` with category fields and `omittedCounts`.
   - `packages/code-graph/src/infrastructure/sqlite/schema.ts`: Increment `SQLITE_SCHEMA_VERSION`, add `category` column to `files` table, and create index `idx_files_category`.
   - `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: Update `queryImpactFrontierDirection`, `findSymbols`, `getAllSymbols`, and `upsertFile` to filter and persist categories.
   - `packages/code-graph/src/domain/services/analyze-impact.ts` & `analyze-file-impact.ts`: Confine BFS expansion and risk determination to `source` dependents; aggregate omitted counts.
   - `packages/code-graph/src/domain/services/find-hotspots.ts`: Filter caller/importer counts and candidate rankings by category.
3. **`@specd/cli`**:
   - `packages/cli/src/commands/graph/impact.ts`: Add CLI options (`--include-tests`, `--include-ignored`, `--all`, `--category`) with comma-separated list support and format omission notifications.
   - `packages/cli/src/commands/graph/hotspots.ts`: Add CLI options (`--include-tests`, `--include-ignored`, `--all`, `--category`) with comma-separated list support and omission notifications.
   - `packages/cli/src/commands/graph/search.ts`: Add CLI options (`--include-tests`, `--include-ignored`, `--all`, `--category`) with comma-separated list support and omission notifications, removing redundant `--tests`.

### Blast Radius & Risk Assessment

- `@specd/core`: Non-breaking, purely additive configuration properties.
- `@specd/code-graph`: Adding a column with `DEFAULT 'source'` ensures existing database reads remain compatible while incremental re-indexing populates categories. Traversal queries gain significant speedups during large BFS operations by discarding test subgraphs early in SQL.
- `@specd/cli`: Flags are additive and unified. Output contracts in JSON/TOON add non-breaking fields (`omittedCounts`).

## Technical context

- **Alternatives Evaluated:**
  - _Hard exclusion (`excludePaths`):_ Discarded because excluding files prevents AST parsing and graph insertion, making it impossible to query test coverage or inspect test dependencies on demand.
  - _Single boolean `is_ignored`:_ Discarded because `test` files and auxiliary `ignored` files serve completely different purposes. Tests are verification assets that developers frequently want to inspect or correlate with code, whereas ignored files are passive auxiliary assets.
  - _Language-specific hardcoding:_ Discarded to maintain SpecD's language-agnostic architecture. Patterns must remain glob-based and configurable in `specd.yaml`.
- **Architectural Decisions:**
  - _Database Indexing:_ The `category` column on `files` is indexed in SQLite (`idx_files_category`). Traversal queries join `files` and filter on `category` directly in SQL rather than loading candidate nodes into Node.js heap memory, ensuring zero latency degradation.
  - _Omission Transparency:_ Both human-readable CLI outputs and machine-readable JSON/TOON formats must contain explicit signals when items are omitted, ensuring AI agents understand that results were pruned and know how to expand scope.
  - _Comma-Separated Category Filtering:_ The `--category` flag supports single values or comma-separated lists (e.g. `--category source,test`), aligning with `--kind` and `--type`. Redundant aliases like `--tests` are omitted to keep the CLI clean and orthogonal.

## Open questions

None. All architectural requirements, naming conventions, and behavior policies were discussed and agreed upon during discovery.
