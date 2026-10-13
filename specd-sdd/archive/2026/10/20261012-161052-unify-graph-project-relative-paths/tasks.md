# Tasks: unify-graph-project-relative-paths

## 1. SDK Projection Utilities

- [x] 1.1 Implement project-relative path projection utilities
      `packages/sdk/src/orchestration/project-relative-path.ts`: `toProjectRelativePath` and `splitWorkspaceIdentity` — pure projection functions mapping canonical graph paths to project-relative paths
      Approach: Implement Windows-safe workspace identity parsing and project-relative resolution using `config.projectRoot` and `workspace.codeRoot`
      (Req: Pure path projection)
- [x] 1.2 Export projection utilities from SDK entrypoints
      `packages/sdk/src/orchestration/index.ts` and `packages/sdk/src/index.ts`: export `toProjectRelativePath` and `splitWorkspaceIdentity`
      Approach: Add named exports to public SDK API
      (Req: Pure path projection)

## 2. SDK Graph Query Orchestrators

- [x] 2.1 Implement `runGraphSearch` in `@specd/sdk`
      `packages/sdk/src/orchestration/run-graph-search.ts`: `runGraphSearch` — orchestrates provider lifecycle and projects search hits, declarations, logical targets, files, and documents to `projectRelativePath`
      Approach: Use `withOpenGraphProvider(ctx, ...)` when provider is omitted; project all canonical locations to `projectRelativePath` and omit `configRelativePath`
      (Req: runGraphSearch orchestration, Req: Elimination of legacy path properties)
- [x] 2.2 Implement `runGraphHotspots` in `@specd/sdk`
      `packages/sdk/src/orchestration/run-graph-hotspots.ts`: `runGraphHotspots` — orchestrates provider lifecycle and projects hotspot symbol locations to `projectRelativePath`
      Approach: Call `provider.computeHotspots(...)`, map entries to include `projectRelativePath` and derived `workspace`, and omit `displayPath`
      (Req: runGraphHotspots orchestration, Req: Elimination of displayPath)
- [x] 2.3 Implement `runGraphImpact` in `@specd/sdk`
      `packages/sdk/src/orchestration/run-graph-impact.ts`: `runGraphImpact` — orchestrates provider lifecycle, resolves selectors, and projects impact results to `projectRelativePath`
      Approach: Handle single-file, multi-file (`projectRelativeTargets`), symbol, and spec impact; project all affected paths to `projectRelativePath` and omit `displayPath` / `displayTargets`
      (Req: runGraphImpact orchestration, Req: Elimination of displayPath and displayTargets)
- [x] 2.4 Re-export orchestrators from SDK entrypoints
      `packages/sdk/src/orchestration/index.ts` and `packages/sdk/src/index.ts`: export `runGraphSearch`, `runGraphHotspots`, `runGraphImpact`, and their input/result types
      Approach: Add named exports to orchestration barrel and root index
      (Req: runGraphSearch orchestration, Req: runGraphHotspots orchestration, Req: runGraphImpact orchestration)

## 3. SDK Automated Unit Tests

- [x] 3.1 Unit tests for SDK path projection utilities
      `packages/sdk/test/orchestration/project-relative-path.spec.ts`: test `toProjectRelativePath` and `splitWorkspaceIdentity`
      Approach: Test root workspaces, nested workspaces, Windows drive letters, and invalid identities
      (Req: Pure path projection)
- [x] 3.2 Unit tests for `runGraphSearch`
      `packages/sdk/test/orchestration/run-graph-search.spec.ts`: test search orchestration
      Approach: Test transient provider lifecycle, open provider pass-through, projected `projectRelativePath` on symbols/files/documents, and absence of `configRelativePath`
      (Req: runGraphSearch orchestration, Req: Elimination of legacy path properties)
- [x] 3.3 Unit tests for `runGraphHotspots`
      `packages/sdk/test/orchestration/run-graph-hotspots.spec.ts`: test hotspots orchestration
      Approach: Test transient provider lifecycle, open provider pass-through, projected `projectRelativePath` on entries, and absence of `displayPath`
      (Req: runGraphHotspots orchestration, Req: Elimination of displayPath)
- [x] 3.4 Unit tests for `runGraphImpact`
      `packages/sdk/test/orchestration/run-graph-impact.spec.ts`: test impact orchestration
      Approach: Test single-file, multi-file (`projectRelativeTargets`), symbol, and spec impact with projected paths and absence of `displayPath`
      (Req: runGraphImpact orchestration, Req: Elimination of displayPath and displayTargets)

## 4. CLI Presentation Layer Refactoring

- [x] 4.1 Update `resolve-impact-file-selectors.ts` to import SDK utilities
      `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`: replace local `toGraphDisplayPath` and `splitWorkspaceIdentity` with `@specd/sdk` imports
      Approach: Remove duplicated projection logic and delegate to SDK
      (Req: Pure display-path projection)
- [x] 4.2 Refactor `specd graph search` command to delegate to `runGraphSearch`
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch` and action handler
      Approach: Delegate search execution to `runGraphSearch(hostContext, input)`; update text renderer and structured output emitter; update Commander `addHelpText` schema documentation
      (Req: Output format, Req: Command signature)
- [x] 4.3 Refactor `specd graph hotspots` command to delegate to `runGraphHotspots`
      `packages/cli/src/commands/graph/hotspots.ts`: `registerGraphHotspots` and action handler
      Approach: Delegate hotspots computation to `runGraphHotspots(hostContext, input)`; update text renderer and structured output emitter; update Commander `addHelpText` schema documentation
      (Req: Output format, Req: CLI reference documentation)
- [x] 4.4 Refactor `specd graph impact` command to delegate to `runGraphImpact`
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpact` and action handler
      Approach: Delegate impact analysis to `runGraphImpact(hostContext, input)`; update text renderer and structured output emitter; update Commander `addHelpText` schema documentation
      (Req: Output format, Req: Pure display-path projection)

## 5. Documentation Updates

- [x] 5.1 Update CLI reference documentation for graph commands
      `docs/cli/graph.md`: update structured JSON and TOON schema descriptions and examples
      Approach: Document `projectRelativePath` and `projectRelativeTargets` across search, hotspots, and impact, removing legacy fields
      (Req: CLI reference documentation)
- [x] 5.2 Update Code Graph guide documentation
      `docs/guide/code-graph.md`: update guide sections documenting output shapes and SDK orchestration
      Approach: Clarify canonical identities (`workspace:path`) versus `projectRelativePath`, and document SDK orchestration use cases
      (Req: CLI reference documentation)

## 6. CLI Integration Tests & Verification

- [x] 6.1 Update graph search command tests
      `packages/cli/test/commands/graph-search.spec.ts`: update test assertions for JSON/TOON output
      Approach: Assert presence of `projectRelativePath` on symbols, files, and documents; assert absence of `configRelativePath`
      (Req: Output format)
- [x] 6.2 Update graph hotspots command tests
      `packages/cli/test/commands/graph-hotspots.spec.ts`: update test assertions for JSON/TOON output
      Approach: Assert presence of `projectRelativePath` on entries; assert absence of `displayPath`
      (Req: Output format)
- [x] 6.3 Update graph impact command tests
      `packages/cli/test/commands/graph-impact.spec.ts`: update test assertions for JSON/TOON output
      Approach: Assert presence of `projectRelativePath` and `projectRelativeTargets`; assert absence of `displayPath` and `displayTargets`
      (Req: Output format)
- [x] 6.4 Execute full test suite and verify clean builds
      Run vitest across affected packages (`pnpm --filter @specd/sdk test` and `pnpm --filter @specd/cli test`)
      Approach: Verify 100% of unit and integration tests pass cleanly with 0 errors
      (Req: Output format)

## 7. Code Graph Schema v14 & Domain Native Paths (ADR-0028)

- [x] 7.1 Bump SQLite schema to version 14 and update DDL in `schema.ts`
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: `SQLITE_SCHEMA_VERSION`, `SQLITE_SCHEMA_DDL` — replace `config_relative_path` with `project_relative_path` in `files` and `documents`; add `project_relative_path TEXT NOT NULL DEFAULT ''` to `symbols`
      Approach: Bump version to 14, update table definitions in DDL constant
      (Req: Reference schema upgrade, Req: Persisted node storage)
- [x] 7.2 Update `SymbolNode` domain value object
      `packages/code-graph/src/domain/value-objects/symbol-node.ts`: `SymbolNode` — add `readonly projectRelativePath: string`
      Approach: Add property to interface and update any factories / type guards
      (Req: Symbol node)
- [x] 7.3 Update `FileNode` and `DocumentNode` domain value objects
      `packages/code-graph/src/domain/value-objects/file-node.ts` & `document-node.ts`: `FileNode`, `DocumentNode` — replace `configRelativePath` with `readonly projectRelativePath: string`
      Approach: Rename property, remove `configRelativePath`
      (Req: File node, Req: DocumentNode properties)
- [x] 7.4 Update `LogicalDeclaration` location interface
      `packages/code-graph/src/domain/value-objects/logical-symbol.ts`: `LogicalDeclaration.location` — ensure `projectRelativePath: string` is present
      Approach: Update location type definition
      (Req: Logical symbol and canonical reference model)
- [x] 7.5 Update indexer discovery & extraction pipeline
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `indexProjectGraph` — calculate `projectRelativePath` relative to `projectRoot` and populate on all `FileNode`, `DocumentNode`, and `SymbolNode` instances
      Approach: Pass `projectRoot` to discovery mapper, compute `relative(config.projectRoot, diskPath)`, and assign to file, doc, and symbol nodes
      (Req: Project-relative file lookup, Req: Persisted node storage)
- [x] 7.6 Update SQLite database bulk insertion statements and queries
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: prepared statements (`insertFileStmt`, `insertDocumentStmt`, `insertSymbolStmt`) and search/lookup queries
      Approach: Bind `project_relative_path` on insert and select it directly in symbol, file, and document queries with zero joins
      (Req: Persisted node storage, Req: Reference schema upgrade)
- [x] 7.7 Update SQLite store version verification and rebuild handling
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: schema version check
      Approach: Ensure schema versions <= 13 reject read with `GraphSchemaIncompatibleError` and trigger rebuild on `graph index`
      (Req: Reference schema upgrade)

## 8. SDK Helpers Simplification & Pass-Through

- [x] 8.1 Simplify `runGraphSearch` to pass through native `projectRelativePath`
      `packages/sdk/src/orchestration/run-graph-search.ts`: `runGraphSearch` — consume native `projectRelativePath` emitted by `code-graph` without manual projection
      Approach: Remove redundant in-memory path rewriting, preserving native code-graph properties
      (Req: runGraphSearch orchestration)
- [x] 8.2 Simplify `runGraphHotspots` to pass through native `projectRelativePath`
      `packages/sdk/src/orchestration/run-graph-hotspots.ts`: `runGraphHotspots` — consume native `projectRelativePath` on `SymbolNode`
      Approach: Directly forward `symbol.projectRelativePath`
      (Req: runGraphHotspots orchestration)
- [x] 8.3 Simplify `runGraphImpact` to pass through native `projectRelativePath`
      `packages/sdk/src/orchestration/run-graph-impact.ts`: `runGraphImpact` — consume native `projectRelativePath` on target and affected nodes
      Approach: Pass through native graph properties while resolving polymorphic input selectors
      (Req: runGraphImpact orchestration)

## 9. Verification & Code Graph Tests

- [x] 9.1 Update `@specd/code-graph` unit and integration tests
      `packages/code-graph/test/`: `sqlite-graph-store.spec.ts`, `index-code-graph.spec.ts`, `symbol-model.spec.ts`
      Approach: Verify schema version 14, denormalized `project_relative_path`, zero-join symbol lookups, and rebuild on incompatible schema
      (Req: Reference schema upgrade, Req: Persisted node storage)
- [x] 9.2 Update `@specd/sdk` and `@specd/cli` tests for native graph paths
      `packages/sdk/test/orchestration/`, `packages/cli/test/commands/`
      Approach: Assert all tests pass with code-graph native `projectRelativePath`
      (Req: Output format)
- [x] 9.3 Force re-index code graph and verify database schema v14
      Run `node packages/cli/dist/index.js graph index --force --format toon`
      Approach: Verify SQLite database at `.specd/graph/graph.sqlite` successfully initializes schema version 14 and stores `project_relative_path` in `files`, `documents`, and `symbols`
      (Req: Reference schema upgrade)

## 10. Compliance Audit Remediation & Test Parity

- [x] 10.1 Implement public export route impact in `@specd/sdk`
      `packages/sdk/src/orchestration/run-graph-impact.ts`: Add `export` and `from`/`surface` to `RunGraphImpactInput`. Implement public export route resolution (`resolveSymbolReference`, `getExactPublicBinding`) and execution (`analyzePublicBindingImpact`). Project public surface to `projectRelativeSurface` and affected files/symbols to `projectRelativePath`.
      Approach: Support export route impact in SDK orchestration
      (Req: runGraphImpact orchestration)
- [x] 10.2 Delegate CLI public export impact to `runGraphImpact`
      `packages/cli/src/commands/graph/impact.ts`: Refactor `handlePublicExportImpact` to delegate directly to `runGraphImpact(hostContext, { export, from })`, eliminating duplicated provider queries and raw canonical paths in text and JSON output.
      Approach: Delegate public export impact to SDK orchestrator
      (Req: Output format, Req: Pure display-path projection)
- [x] 10.3 Align parameter options and aliases in `runGraphSearch` and `runGraphHotspots`
      `packages/sdk/src/orchestration/run-graph-search.ts`: Add `exactFile`, `filePattern`, and `includeSnippet` to `RunGraphSearchInput`, forwarding `exactFile` to `provider.search(...)`.
      `packages/sdk/src/orchestration/run-graph-hotspots.ts`: Add `filePath` alias to `RunGraphHotspotsInput` and defensive fallback path projection.
      Approach: Add missing options and aliases to SDK input types
      (Req: runGraphSearch orchestration, Req: runGraphHotspots orchestration)
- [x] 10.4 Expand `@specd/sdk` unit tests
      `packages/sdk/test/orchestration/`: Add test cases for option forwarding, parameter aliases, transient provider lifecycles, and public export route impact in `run-graph-impact.spec.ts`, `run-graph-search.spec.ts`, and `run-graph-hotspots.spec.ts`.
      Approach: Achieve comprehensive test coverage for SDK orchestrators
      (Req: runGraphSearch orchestration, Req: runGraphHotspots orchestration, Req: runGraphImpact orchestration)
- [x] 10.5 Expand `@specd/cli` tests for document search and symbol impact
      `packages/cli/test/commands/graph-search.spec.ts`: Add tests for document search results in JSON and text mode.
      `packages/cli/test/commands/graph-impact.spec.ts`: Add tests for `--symbol ... --format json` asserting `projectRelativePath` presence and `displayPath` absence, and public export impact.
      Approach: Test document search and symbol impact in CLI test suite
      (Req: Output format)
- [x] 10.6 Expand `@specd/code-graph` unit tests
      `packages/code-graph/test/`: Test `FileNode` equality with differing `projectRelativePath`, `FileNode` with parent `..` segments, forward schema version 15 rejection in `sqlite-graph-store.spec.ts`, and absolute selector normalization in `resolve-graph-selector.spec.ts`.
      Approach: Cover all edge-case scenarios from spec deltas
      (Req: File node, Req: Reference schema upgrade, Req: Project-relative file lookup)

## 11. Compliance Audit Remediation & Parity

- [x] 11.1 Fix snippet projection on `includeSnippet` alias in `runGraphSearch`
      `packages/sdk/src/orchestration/run-graph-search.ts`: `runGraphSearch` — replace `input.snippet` with `includeSnippet` in symbol hits, file matches, specs, and documents output mappings
      Approach: Check `includeSnippet && h.snippet !== undefined` across lines 309, 325, 339, and 349 so callers passing `{ includeSnippet: true }` receive snippet previews
      (Req: runGraphSearch orchestration)
- [x] 11.2 Unit tests for `includeSnippet` output projection in `@specd/sdk`
      `packages/sdk/test/orchestration/run-graph-search.spec.ts`: test `includeSnippet: true` output retention
      Approach: Assert `snippet` property is present on returned symbol hits, files, specs, and documents when calling with `{ includeSnippet: true }`
      (Req: runGraphSearch orchestration)
- [x] 11.3 Missing negative and outcome unit tests in `run-graph-impact.spec.ts`
      `packages/sdk/test/orchestration/run-graph-impact.spec.ts`: test symbol `not_found`, symbol `ambiguous`, missing spec (`GraphSpecNotFoundError`), and invalid selector errors (`GraphSelectorError`)
      Approach: Assert returned structured object shapes for non-throwing outcomes and error throwing for invalid selector combinations
      (Req: runGraphImpact orchestration)
- [x] 11.4 Missing edge-case CLI integration tests
      `packages/cli/test/commands/graph-search.spec.ts` and `graph-hotspots.spec.ts`: test `--spec-content` rejection in text mode and `No hotspots found.` empty text output
      Approach: Assert stderr and exit code 1 for `--spec-content` with text format; assert `No hotspots found.` text output when provider returns 0 hotspots
      (Req: Output format)
