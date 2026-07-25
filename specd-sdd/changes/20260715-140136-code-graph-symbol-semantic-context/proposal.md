# Proposal: code-graph-symbol-semantic-context

## Motivation

`@specd/code-graph` can identify symbols, files, and some hierarchy relations, but it does not yet preserve enough deterministic structural context to support high-quality semantic purpose extraction for arbitrary symbols. This becomes especially limiting for leaf symbols such as properties, variables, or parameters, whose meaning depends heavily on their containing method, function, and class.

## Current behaviour

Today the graph persists symbol identity, file placement, and limited ownership through `parentId`, mainly for `method -> class/interface`. The graph does not generally preserve exact symbol end ranges or generalized ownership for non-method symbols, so later consumers cannot reliably reconstruct a symbol's exact code block or its full owner chain from persisted graph data alone.

Because of that, semantic extraction for symbols would either need to rely on weak isolated symbol metadata or duplicate large amounts of derived text into the graph store. The current model is therefore strong enough for deterministic graph traversal, but too weak for hierarchical semantic context assembly.

## Proposed solution

Extend the code graph model and indexing pipeline with minimal deterministic structural context for symbols, prioritizing ownership and exact range information over storing derived semantic text. The goal is to let later semantic extractors reconstruct exact symbol text and owner context from persisted graph structure plus `FileNode.content`, instead of storing duplicated signatures, bodies, or generated purpose text in the main graph store.

This change is intended to establish the structural foundation for hierarchical purpose extraction, where leaf symbols can be interpreted in the context of their containing function or method and their containing class.

At a high level, the structural additions discussed so far are:

- exact persisted symbol range, so the original declaration or block can be reconstructed from file content
- generalized persisted ownership, so a symbol can be resolved through an owner chain such as `leaf -> method -> class -> file`
- adapter responsibilities that explicitly produce this structural context during analysis instead of leaving it implicit in transient AST state

The minimum concrete field set discussed for persisted symbol context is:

- `endLine`
- `endColumn`
- `ownerSymbolId`
- `declarationText`

The intent is to add these minimal structural fields before introducing heavier persisted semantic fields such as generated `purpose`, prompt text, or code block snapshots.

Declaration or signature text was initially discussed as a derived capability only, but the direction shifted during the conversation: `declarationText` is now considered worth persisting because it is short, deterministic, and useful for FTS and semantic fallback even before embeddings exist. The preferred direction is for each language adapter to extract it deterministically from source text and grammar-aware symbol boundaries.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:symbol-model`: extend the symbol model so persisted graph symbols can carry enough deterministic structural context to support exact text reconstruction and owner-chain traversal for semantic extraction.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:language-adapter`: require built-in adapters to expose deterministic structural ownership and exact symbol range data needed by the richer symbol model.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:indexer`: update indexing responsibilities so structural ownership and range information are assigned and persisted as part of graph extraction rather than left only in transient parse state.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected areas include the code-graph domain model, adapter output contracts, and indexing logic. The work is expected to touch `packages/code-graph/src/domain/value-objects/symbol-node.ts`, `file-analysis.ts`, `language-adapter.ts`, `packages/code-graph/src/application/use-cases/index-code-graph.ts`, and built-in adapters such as `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`.

This change may also imply follow-on updates to graph persistence adapters and graph-store specs, but the current proposal keeps the initial scope focused on the structural model and extraction contracts.

Expected technical impact includes:

- extending the persisted `SymbolNode` shape
- updating language adapters so they emit structural ownership and range data deterministically
- updating the indexer so it persists generalized ownership instead of only limited method-to-class parent assignment
- likely touching persistence schema and store mapping code so the new structural fields survive round-trips through the graph store

## Technical context

The main technical direction discussed was to avoid inflating the graph database with duplicated text artifacts when equivalent source text can already be reconstructed from `FileNode.content`. Instead of persisting generated signatures, code blocks, or purpose text, the preferred direction is to persist only the minimum structural fields needed to recover that context later.

The discussion converged on structural ownership being more valuable than isolated line placement. It is not enough to know that a symbol starts on a line in a file; for semantic extraction, it matters much more to know that a symbol belongs to a specific method or function, which itself belongs to a specific class, and that exact text for each node in that chain can be reconstructed deterministically.

The current graph already persists enough to support `method -> class/interface` ownership through `parentId`, and adapters already compute richer transient context during parsing, including AST ranges, binding facts, call facts, and type/member information. The preferred direction is therefore to capture more of that structural context in the persisted graph while keeping semantic interpretation outside the graph model.

The preferred storage strategy discussed was:

- keep `FileNode.content` as the source of truth for reconstructable source text
- persist only structural coordinates and ownership in the graph
- persist `declarationText` as a short deterministic derived field in the main graph tables
- avoid storing duplicated full `body` text or generated semantic text in the main graph tables

For declaration or signature extraction, the preferred direction discussed was:

- persist `declarationText` as the short declaration/header representation used for search and fallback semantic context
- derive declaration text deterministically per language
- use adapter-specific grammar knowledge to determine what counts as the declaration/header for each symbol kind
- keep `FileNode.content` plus persisted symbol range available for exact reconstruction of larger source context

For semantic metadata beyond the structural graph model, the preferred direction discussed was to cache it in a separate derived storage layer rather than placing it directly on `SymbolNode`. In particular:

- `purpose` should be cached separately from the core symbol record
- semantic cache entries should be versioned and regenerable
- this derived layer may later grow to include keywords and embeddings

This establishes a separation between:

- core graph data: deterministic structure and short declaration text
- derived semantic metadata: generated, versioned, regenerable artifacts

The preferred extraction model discussed was:

- adapters extract deterministic structural context
- shared runtime logic reconstructs exact text and owner-chain context from persisted graph data plus file content
- semantic purpose generation happens later and hierarchically, using the structural context rather than replacing it

The conversation also identified a likely distinction between:

- structural graph changes needed now
- semantic metadata or embedding work that should come later once the structural model is good enough

The conversation also established that semantic purpose generation should likely be hierarchical: class purpose first, then method/function purpose, then leaf-symbol purpose using the already known ancestor context.

## Open questions

- Should the richer ownership field generalize the existing `parentId`, or should both concepts coexist in the persisted symbol model?
- Which additional symbol categories, if any, should become first-class persisted graph symbols to make hierarchical semantic extraction useful in practice?
- How much ownership should be persisted directly versus reconstructed later from adapter-specific parsing when semantic extraction runs?
- Should graph-store schema changes be part of this same change, or should this change stop at model and adapter/indexer requirements and leave storage details to follow-on work?
