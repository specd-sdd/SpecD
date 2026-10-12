# Tasks: code-graph-file-categories

## 1. Core configuration & schema

- [x] 1.1 Add `testPaths` and `ignorePaths` to `SpecdGraphConfig` and `SpecdWorkspaceGraphConfig`
      `packages/core/src/application/specd-config.ts`: `SpecdGraphConfig`, `SpecdWorkspaceGraphConfig` — add `readonly testPaths?: readonly string[]` and `readonly ignorePaths?: readonly string[]`
      Approach: Add optional readonly string array fields to both interfaces so both project and workspace levels can declare glob rules.
      (Req: Requirement: Project-level graph configuration, Requirement: Workspace-level graph configuration)
- [x] 1.2 Add Zod schemas for graph path arrays in config schema port
      `packages/core/src/application/ports/config-schema.ts`: `specdGraphConfigSchema`, `specdWorkspaceGraphConfigSchema` — add `testPaths: z.array(z.string()).optional()` and `ignorePaths: z.array(z.string()).optional()`
      Approach: Extend schemas with optional string arrays, preserving strict schema validation.
      (Req: Requirement: Project-level graph configuration, Requirement: Workspace-level graph configuration)
- [x] 1.3 Implement default patterns and merge logic in `ConfigLoader`
      `packages/core/src/infrastructure/fs/config-loader.ts`: `ConfigLoader.load` — populate default `testPaths` (`['**/*.spec.*', '**/*.test.*', '**/test/**', '**/tests/**', '**/__tests__/**', '*_test.*']`) and `ignorePaths` (`[]`) when omitted at project level
      Approach: In `ConfigLoader`, apply default patterns when `config.graph?.testPaths` is undefined; merge workspace-level patterns additively with project-level patterns.
      (Req: Requirement: Project-level graph configuration, Requirement: Workspace-level graph configuration)
- [x] 1.4 Add unit tests for graph config loading and defaults
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: new describe block — verify `testPaths` defaults, explicit overrides, and workspace-level additions
      Approach: Test loading minimal config with omitted `graph.testPaths` (assert defaults applied), and loading config with explicit overrides.
      (Req: Requirement: Project-level graph configuration, Scenario: Project testPaths omitted defaults applied)

## 2. Code Graph domain & classification

- [x] 2.1 Add `FileCategory` type and update `FileNode`
      `packages/code-graph/src/domain/value-objects/file-node.ts`: `FileCategory`, `FILE_CATEGORIES`, `FileNode`, `createFileNode` — define `'source' | 'test' | 'ignored'` and update `FileNode` interface
      Approach: Export `FileCategory` type and `FILE_CATEGORIES` array. Add `readonly category: FileCategory` to `FileNode`. Update `createFileNode` to default `category` to `'source'` if omitted.
      (Req: Requirement: Minimum graph semantics, Scenario: Backend persists file category)
- [x] 2.2 Implement `classifyFileCategory` domain service
      `packages/code-graph/src/domain/services/classify-file-category.ts`: `classifyFileCategory` — implement glob pattern classification function
      Approach: Match path using `matchesExclude(relativePath, ignorePatterns)` -> `'ignored'`; then `matchesExclude(relativePath, testPatterns)` -> `'test'`; fallback to `'source'`.
      (Req: Requirement: Project-level graph configuration, Requirement: Minimum graph semantics)
- [x] 2.3 Add unit tests for `classifyFileCategory`
      `packages/code-graph/test/domain/services/classify-file-category.spec.ts`: new test file — verify language neutrality and priority order
      Approach: Test paths with `.spec.ts`, `_test.go`, `test/harness.py`, fixtures in `ignorePaths`, and production files. Assert precedence of `ignorePaths` over `testPaths`.
      (Req: Requirement: Project-level graph configuration)
- [x] 2.4 Update `OmittedCounts`, `ImpactResultFilter`, and `ImpactResult`
      `packages/code-graph/src/domain/value-objects/impact-result.ts`: `OmittedCounts`, `ImpactResultFilter`, `ImpactResult` — add category fields and `omittedCounts`
      Approach: Add `categories?: readonly FileCategory[]`, `includeTests?: boolean`, `includeIgnored?: boolean` to `ImpactResultFilter`. Add `omittedCounts: OmittedCounts` to `ImpactResult`.
      (Req: Requirement: Filtered impact results, Requirement: Impact analysis)
- [x] 2.5 Update `HotspotOptions` and `HotspotResult`
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `HotspotOptions`, `HotspotResult` — add category fields and `omittedCounts`
      Approach: Add `categories?: readonly FileCategory[]`, `includeTests?: boolean`, `includeIgnored?: boolean` to `HotspotOptions`. Add `omittedCounts: OmittedCounts` to `HotspotResult`.
      (Req: Requirement: Filtering, Requirement: Output)

## 3. SQLite persistence & indexing

- [x] 3.1 Update SQLite schema DDL and increment schema version
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION`, `SQLITE_SCHEMA_DDL` — increment version, add `category` column and `idx_files_category`
      Approach: Bump version constant. In DDL, append `category TEXT NOT NULL DEFAULT 'source'` to `files` table definition and `CREATE INDEX IF NOT EXISTS idx_files_category ON files(category)`.
      (Req: Requirement: Minimum graph semantics)
- [x] 3.2 Update `upsertFile` and `bulkLoad` in `SQLiteGraphDatabase`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `upsertFile`, `bulkLoad`, `rowToFileNode` — persist and hydrate `file.category`
      Approach: Bind `file.category` in INSERT statements into `files`. Read `row.category` in `rowToFileNode` mapping.
      (Req: Requirement: Minimum graph semantics, Scenario: Backend persists file category)
- [x] 3.3 Update file indexing to classify categories during discovery
      `packages/code-graph/src/application/use-cases/index-project-graph.ts`: `IndexProjectGraph` — categorize each discovered file with `classifyFileCategory`
      Approach: Pass effective `testPaths` and `ignorePaths` to file processing; call `classifyFileCategory` for each file before constructing `FileNode`.
      (Req: Requirement: Minimum graph semantics)
- [x] 3.4 Add integration tests for SQLite persistence of categories
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-database.spec.ts`: test `upsertFile` and `getFile` — verify `category` is saved and loaded
      Approach: Save `FileNode` with `category: 'test'`, retrieve it, and assert `category === 'test'`.
      (Req: Scenario: Backend persists file category)

## 4. Graph traversal & impact isolation

- [x] 4.1 Implement category filtering and frontier pruning in `queryImpactFrontierDirection`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `queryImpactFrontierDirection` — add category join and where condition, prune non-admitted files
      Approach: In the frontier expansion SQL query, `JOIN files f ON f.path = n.file_path WHERE f.category IN (${admittedPlaceholders})`. Accumulate excluded reached files in `omittedCounts`.
      (Req: Requirement: Filtered impact query contract, Scenario: Category filter excludes non-admitted categories in physical query)
- [x] 4.2 Isolate risk calculation and dependent metrics in `analyzeImpact`
      `packages/code-graph/src/domain/services/analyze-impact.ts`: `analyzeImpact` — calculate `directDependents`, `indirectDependents`, `transitiveDependents`, and `riskLevel` solely over admitted category nodes
      Approach: Pass admitted categories (defaulting to `['source']`) to frontier traversal; compute dependent counts and `computeRiskLevel` exclusively from admitted nodes; attach `omittedCounts`.
      (Req: Requirement: Impact analysis, Scenario: Test callers do not inflate risk level or dependents)
- [x] 4.3 Support anchored target exception in `analyzeImpact` and `analyzeFileImpact`
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`: `analyzeFileImpact` — allow downstream traversal when target is explicitly a test/ignored file
      Approach: When target file is in `test` or `ignored`, admit target as the root anchor and traverse downstream dependencies.
      (Req: Requirement: Impact analysis, Scenario: Anchored test target traverses dependencies)
- [x] 4.4 Add unit & integration tests for impact category pruning
      `packages/code-graph/test/domain/services/analyze-impact.spec.ts`: new tests — assert risk isolation, BFS pruning through test files, and `omittedCounts`
      Approach: Create graph with production target called by 1 production module and 20 test files. Assert `riskLevel === 'LOW'`, `directDependents === 1`, `omittedCounts.tests === 20`. Test that test files do not bridge unrelated modules.
      (Req: Scenario: Test callers do not inflate risk level or dependents, Scenario: Category filter prunes BFS traversal through test files)

## 5. Hotspot scoring isolation

- [x] 5.1 Filter caller and importer metrics by category in `computeHotspots`
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots` — count callers and importers only from admitted file categories
      Approach: Extract category from caller file path or join query; filter incoming callers to those where declaring file has admitted category (`source` by default). Filter `fileImporters` similarly.
      (Req: Requirement: Batch hotspot scoring, Requirement: Filtering)
- [x] 5.2 Exclude non-admitted category symbols from candidate ranking
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots` — omit symbols residing in test/ignored files from default rankings
      Approach: Filter candidate symbols by admitted categories before score calculation; record excluded files in `omittedCounts`.
      (Req: Requirement: Smart defaults with automatic removal, Requirement: Output)
- [x] 5.3 Add unit tests for hotspot category isolation
      `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`: new tests — verify test callers do not increase scores, and `--include-tests` includes them
      Approach: Assert symbol called only by test files has 0 callers under default options; assert caller points are counted when `includeTests: true`.
      (Req: Scenario: Callers in test files do not count toward hotspot scores by default, Scenario: Include tests in hotspot computation)

## 6. Search filtering

- [x] 6.1 Add category filtering to `findSymbols` in `SQLiteGraphDatabase`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `findSymbols` — filter by `f.category` when `query.categories` is present
      Approach: Add `JOIN files f ON f.path = s.file_path WHERE f.category IN (...)` to SQL query.
      (Req: Requirement: Query methods, Scenario: findSymbols filters by category)
- [x] 6.2 Update `SearchCodeGraph` use case with category filters and omission tracking
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `SearchCodeGraph` — filter symbols and source files by category, track `omittedCounts`
      Approach: Apply `categories` filter to symbol and source file searches (default `['source']`); record omitted match counts in search result.
      (Req: Requirement: Search with primary-identity prioritization)
- [x] 6.3 Add unit tests for search category filtering
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: test category filters and omission counts
      Approach: Query keyword matching test helper and production symbol. Assert only production symbol returned by default, and both returned with `includeTests: true`.
      (Req: Scenario: findSymbols filters by category)

## 7. CLI commands & visibility notices

- [x] 7.1 Implement `formatOmissionNotice` helper
      `packages/cli/src/commands/graph/format-omission-notice.ts`: `formatOmissionNotice` — format text notification string from `OmittedCounts`
      Approach: Return `undefined` if both counts are 0; otherwise format `ℹ Excluded from results: X test files, Y ignored files. Use --include-tests, --include-ignored, or --all to view them.`
      (Req: Requirement: Output format)
- [x] 7.2 Add category flags and notice rendering to `graph impact`
      `packages/cli/src/commands/graph/impact.ts`: `impactCommand` — register `--include-tests`, `--include-ignored`, `--all`, `--category`
      Approach: Validate `--category` argument; pass category filters to provider; render `formatOmissionNotice` in text mode and include `omittedCounts` in JSON/TOON.
      (Req: Requirement: Command signature, Requirement: Provider-owned impact result filters, Requirement: Output format)
- [x] 7.3 Add category flags and notice rendering to `graph hotspots`
      `packages/cli/src/commands/graph/hotspots.ts`: `hotspotsCommand` — register `--include-tests`, `--include-ignored`, `--all`, `--category`
      Approach: Register options; pass to `provider.getHotspots`; display omission notice in text mode; include `omittedCounts` in JSON/TOON.
      (Req: Requirement: Command signature, Requirement: Hotspot retrieval, Requirement: Output format)
- [x] 7.4 Add category flags and notice rendering to `graph search`
      `packages/cli/src/commands/graph/search.ts`: `searchCommand` — register `--tests`, `--include-tests`, `--include-ignored`, `--all`, `--category`
      Approach: Map `--tests` to `--category test`; pass to `SearchCodeGraph`; display omission notice in text mode; include `omittedCounts` in JSON/TOON.
      (Req: Requirement: Command signature, Requirement: Command signature (filters), Requirement: Output format)
- [x] 7.5 Add CLI command integration tests for flags and notices
      `packages/cli/test/commands/graph/impact.spec.ts`, `hotspots.spec.ts`, `search.spec.ts`: integration tests for new flags
      Approach: Run commands with mock provider; verify parsed flags reach provider; verify stdout text contains omission notice and JSON contains `omittedCounts`.
      (Req: Scenario: Omission notice displayed in text mode when tests are excluded, Scenario: Category flags passed to hotspots)

## 8. Documentation & verification

- [x] 8.1 Update `docs/cli/cli-reference.md`
      `docs/cli/cli-reference.md`: document new flags for `graph impact`, `graph hotspots`, `graph search`
      Approach: Document `--include-tests`, `--include-ignored`, `--all`, `--category`, and `--tests`, explaining default exclusions and omission notices.
      (Req: Requirement: Command signature, Requirement: CLI reference documentation)
- [x] 8.2 Update `docs/guide/code-graph.md`
      `docs/guide/code-graph.md`: document file categories (`source`, `test`, `ignored`), glob pattern configuration, and defaults
      Approach: Add a section explaining the three semantic categories, configuration in `specd.yaml`, default glob patterns, and traversal impact isolation.
      (Req: Requirement: Project-level graph configuration, Requirement: Workspace-level graph configuration)
- [x] 8.3 Full monorepo verification
      Monorepo root: run build, typecheck, lint, and test across all packages
      Approach: Run `pnpm build`, `pnpm typecheck`, and `pnpm test` ensuring zero regressions.
      (Req: All requirements)

## 9. Review & Follow-up Refinements: Comma-separated category & flag alignment

- [x] 9.1 Support comma-separated categories in CLI commands
      `packages/cli/src/commands/graph/impact.ts`, `hotspots.ts`, `search.ts`: parse comma-separated categories for `--category` (e.g. `source,test`), validate each category against `VALID_FILE_CATEGORIES`, and pass normalized `FileCategory[]` to provider.
      Approach: Split comma values using `parse-comma-values` or `.split(',')`, trim, deduplicate, and validate against `VALID_FILE_CATEGORIES`. Reject if any item is invalid.
      (Req: Requirement: Command signature, Requirement: Provider-owned impact result filters)
- [x] 9.2 Remove `--tests` option in favor of `--category test` in graph search
      `packages/cli/src/commands/graph/search.ts`: remove `.option('--tests', ...)` and `rawCategory` alias mapping.
      Approach: Remove `--tests` flag registration and references so users use standard `--category test`.
      (Req: Requirement: Command signature, Requirement: Command signature (filters))
- [x] 9.3 Harmonize CLI help text JSON schemas
      `packages/cli/src/commands/graph/impact.ts`, `hotspots.ts`, `search.ts`: ensure `addHelpText` JSON schemas document `omittedCounts` and align with specs.
      Approach: Update help text JSON output schemas in CLI commands to document `omittedCounts: { tests: number, ignored: number }`.
      (Req: Requirement: Output format, Requirement: Help schema)
- [x] 9.4 Update CLI tests for comma-separated categories and removed `--tests` alias
      `packages/cli/test/commands/graph-impact.spec.ts`, `graph-hotspots.spec.ts`, `graph-search.spec.ts`: add tests for comma-separated `--category "source,test"`, remove references to `--tests`, and test error handling for invalid comma lists.
      Approach: Assert provider receives `categories: ['source', 'test']` when `--category source,test` is passed.
      (Req: Scenario: Filter by comma-separated categories, Scenario: Category filter accepts comma-separated categories)
- [x] 9.5 Update documentation in `docs/cli/cli-reference.md`
      `docs/cli/cli-reference.md`: document comma-separated list support for `--category` across `impact`, `hotspots`, `search`, and remove `--tests` from the reference documentation.
      Approach: Update flag tables and examples in `cli-reference.md`.
      (Req: Requirement: CLI reference documentation)
- [x] 9.6 Full monorepo verification for follow-up refinements
      Monorepo root: run build, typecheck, and test across all packages.
      Approach: Run `pnpm build`, `pnpm typecheck`, and `pnpm test`.
      (Req: All requirements)
