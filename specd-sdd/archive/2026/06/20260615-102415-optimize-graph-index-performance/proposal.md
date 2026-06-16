# Proposal: optimize-graph-index-performance

## Motivation

Indexing large real-world repositories, especially PHP-heavy ones, still spends too much time and memory in Pass 2 even after incremental local optimizations. The current architecture repeatedly re-derives import, binding, and relation data from the same file across indexing steps, which increases CPU cost and GC pressure instead of scaling predictably with project size.

## Current behaviour

`IndexCodeGraph` already uses a two-pass pipeline with in-memory symbol lookups, binary filtering, and some language-specific fast paths, but the extraction contract remains fragmented. Adapters expose multiple independent methods (`extractSymbols*`, `extractImportedNames`, `extractBindingFacts`, `extractCallFacts`, `extractRelations`), so the same file is partially re-analyzed several times and some adapters rebuild large temporary lookup structures during resolution, especially in PHP dynamic loader handling.

## Proposed solution

Refactor the indexer around a shared in-memory indexing session for a single run. Each adapter will analyze a file once and emit a complete compact fact set that Pass 2 can reuse for import resolution, scoped binding resolution, and relation building. The solution keeps the existing two-pass architecture, mixed-language support, and persisted graph model, but replaces fragmented adapter extraction with a unified per-file analysis contract and shared session lookups. Binary filtering remains part of the change because the indexer still needs to reject obvious non-source inputs before analysis begins.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:indexer`: change the indexing requirements from fragmented extraction calls to a shared session-backed pipeline where each file produces reusable analysis facts once and Pass 2 consumes them without re-analysis.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:language-adapter`: replace the current split extraction interface with a unified adapter contract for single-pass file analysis, import resolution, and relation building under shared session context.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:symbol-model`: extend the runtime analysis model to cover shared indexing-session state and complete per-file analysis facts while keeping persisted graph identities and relation types unchanged.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- `packages/code-graph/src/domain/value-objects/language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`
- `packages/code-graph/src/application/use-cases/discover-files.ts`
- `packages/code-graph/src/domain/services/scoped-binding-environment.ts`
- `packages/code-graph` adapter and indexing tests
- `docs/adr/` for the architectural decision record

No CLI behavior, graph-store schema, or persisted graph identity format is intended to change, but all graph commands and provider wiring depend on the refactored internals remaining behaviorally compatible.

## Technical context

- We explored a broader refactor after confirming that the current proposal had become too focused on local PHP/import-resolution optimizations and no longer matched the real bottleneck.
- The agreed direction is a shared `IndexSession` or equivalent run-scoped in-memory structure that adapters and later indexing phases can use through a common API.
- The session may keep compact shared indices such as file-path lookups, file IDs, symbol-name lookups, qualified-name lookups, file-to-symbol relationships, spec/document relationships, and deduplicated relations.
- Per-file parser state lives inside `FileAnalysis`. Optional run-scoped adapter state may live in the session for deterministic shared caches, but must not retain ASTs, tree-sitter nodes, or other heavyweight parse structures across steps.
- Mixed-language indexing must continue to work: the registry still selects adapters by extension, and all built-in adapters must be migrated together to the new contract.
- The change is intentionally not backwards-compatible at the adapter API level inside the repository; all current built-in adapters are updated in the same change.

## Open questions

none
