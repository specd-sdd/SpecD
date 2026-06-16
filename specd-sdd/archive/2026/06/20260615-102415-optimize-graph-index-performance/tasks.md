# Tasks: optimize-graph-index-performance

## 1. Discovery and Indexer Session

- [x] 1.1 Preserve binary filtering in discovery
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `discoverFiles`, `DEFAULT_BINARY_EXTENSIONS` — keep binary/non-source filtering as part of the new implementation baseline.
      Approach: Ensure the discovery path still excludes configured binary extensions before adapter selection or text decoding.
      (Req: Binary file filtering)
- [x] 1.2 Introduce `IndexSession` runtime contract
      `packages/code-graph/src/application/use-cases/index-code-graph.ts` and supporting modules — add the shared in-memory indexing session abstraction.
      Approach: Define a common API for registering files, file analyses, symbols, relations, and compact adapter state; keep run-local numeric IDs internal to the session.
      (Req: Shared indexing session)
- [x] 1.3 Implement `InMemoryIndexSession`
      `packages/code-graph/src/application/use-cases/` — implement the concrete session with common file/symbol/qualified-name/relation lookups and dedupe.
      Approach: Use bounded in-memory maps/sets for lookup-heavy operations without changing persisted graph-store identifiers or schemas, and include shared spec/document cross-lookups needed by later phases.
      (Req: Shared indexing session, Shared indexing lookups)

## 2. Unified Analysis Model

- [x] 2.1 Define compact runtime analysis value objects
      `packages/code-graph/src/domain/value-objects/` — add `FileAnalysisDraft`, `FileAnalysis`, `ParserState`, `AdapterSessionState`, and import/relation context types.
      Approach: Model only compact retained facts needed across passes; keep persisted graph entities unchanged and distinguish per-file parser state from run-scoped adapter cache state.
      (Req: File analysis model, Compact retained analysis state)
- [x] 2.2 Refine shared symbol/runtime lookup model
      `packages/code-graph/src/application/use-cases/index-code-graph.ts` and related domain modules — align `SymbolIndex` and session lookups with the new runtime contract.
      Approach: Support lookup by file, simple name, and qualified name through bounded structures used by Pass 2 resolution.
      (Req: Shared indexing lookups)

## 3. LanguageAdapter Contract Migration

- [x] 3.1 Replace the fragmented adapter API
      `packages/code-graph/src/domain/value-objects/language-adapter.ts` — redefine `LanguageAdapter` around `analyzeFile`, `resolveImports`, and `buildRelations`.
      Approach: Remove the legacy built-in extraction split and define shared contexts for analysis, import resolution, and Pass 2 relation building.
      (Req: LanguageAdapter interface, Full-file analysis contract, Unified built-in adapter migration)
- [x] 3.2 Adapt the adapter registry and provider wiring
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`, `packages/code-graph/src/composition/create-code-graph-provider.ts` — wire the unified contract through registration and composition.
      Approach: Ensure all built-in adapters are instantiated and consumed through the same contract with no parallel legacy path.
      (Req: Unified built-in adapter migration)

## 4. Pass 1 / Pass 2 Indexer Rewrite

- [x] 4.1 Rewrite Pass 1 around `analyzeFile`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute` — analyze each file once and register a complete file analysis in the session.
      Approach: Emit `DEFINES`/`EXPORTS` from registered symbols and retain compact facts for later use without re-parsing.
      (Req: Two-pass extraction with in-memory index, Bounded analysis memory)
- [x] 4.2 Rewrite Pass 2 around stored facts
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: Pass 2 — resolve imports and build relations from `FileAnalysis` plus session lookups.
      Approach: Resolve imports first, then feed shared scoped binding/call resolution and adapter relation building from the stored analysis data.
      (Req: Two-pass extraction with in-memory index, Shared indexing session)
- [x] 4.3 Keep progress and phase timing aligned to the new pipeline
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: progress/timing reporting — update labels and timing boundaries for analyze/register vs resolve/build phases.
      Approach: Fire phase updates immediately before heavy work and log per-phase duration at debug level.
      (Req: Progress reporting, Phase execution timing logging)

## 5. Built-in Adapter Migrations

- [x] 5.1 Migrate TypeScript/JavaScript adapter
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — emit full-file analysis, import resolution, and relation building from the new contract.
      Approach: Make TS/JS the baseline migration for the shared adapter model.
      (Req: Unified built-in adapter migration)
- [x] 5.2 Migrate PHP adapter and preserve deterministic loader/namespace resolution
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — move PHP to single-pass analysis plus session-driven import resolution.
      Approach: Retain CakePHP/CodeIgniter/PSR-4 deterministic logic while eliminating repeated scans and repeated extraction work.
      (Req: Import specifier resolution, Full-file analysis contract, Compact retained analysis state)
- [x] 5.3 Migrate Python and Go adapters
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`, `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — move remaining built-ins to the unified contract.
      Approach: Keep mixed-language indexing working through the common session and analysis model.
      (Req: Unified built-in adapter migration)

## 6. Shared Scoped Resolution and Runtime Safety

- [x] 6.1 Adapt shared scoped binding and call resolution to `FileAnalysis`
      `packages/code-graph/src/domain/services/` and related use-case wiring — consume deterministic facts from registered file analyses.
      Approach: Preserve cycle detection and conservative deterministic behavior while removing any dependence on re-extracted file content.
      (Req: Scoped binding model, File analysis model)
- [x] 6.2 Enforce compact retained runtime state
      `packages/code-graph/src/application/use-cases/index-code-graph.ts` and adapter implementations — ensure retained session state excludes parser-runtime objects.
      Approach: Drop parser trees immediately after per-file analysis and keep only normalized facts and small parser-specific state.
      (Req: Bounded analysis memory, Compact retained analysis state)

## 7. Testing and Verification

- [x] 7.1 Add unit tests for `IndexSession` and runtime lookups
      `packages/code-graph/test/application/use-cases/` — cover file/symbol registration, qualified-name lookup, and relation dedupe.
      Approach: Verify bounded lookup behavior and session-owned state access.
- [x] 7.2 Update adapter contract tests
      `packages/code-graph/test/infrastructure/tree-sitter/` — update built-in adapter tests to the `analyzeFile` / `resolveImports` / `buildRelations` flow.
      Approach: Cover deterministic imports, relation emission, and compact parser-state behavior without legacy extraction helpers.
- [x] 7.3 Update indexer integration tests
      `packages/code-graph/test/application/use-cases/` and CLI-facing graph tests — cover Pass 1/Pass 2 behavior, progress labels, timing logs, and binary filtering.
      Approach: Verify mixed-language indexing still produces the same persisted graph semantics through the new runtime architecture.
- [x] 7.4 Re-run `iccms` indexing as the main regression target
      Local testing: run graph indexing against `../iccms` and compare completion behavior and stability.
      Approach: Use the `iccms` fixture to confirm the new architecture eliminates repeated PHP work and avoids regressions in mixed-language indexing.
