# Proposal: improve-graph-search-snippets

## Motivation

`specd graph search` currently returns previews that are too shallow to help users understand why a result matched. This makes the code graph less useful for interactive discovery and forces users to open files or specs manually even when the search hit is otherwise relevant.

## Current behaviour

In text mode, the CLI currently hardcodes previews from whichever field is already present on the result object instead of rendering match-aware context:

- symbol results show `symbol.comment.substring(0, 50)`, so they are only informative when the symbol has a useful attached comment and the relevant terms appear near the beginning of that comment
- spec results show `spec.description.substring(0, 60)`, so matches in spec body content are not surfaced in the preview even when body content drove the hit
- document results show `document.content.substring(0, 60)`, so previews are biased toward the start of the document rather than the strongest textual match

In structured output, the command exposes category payloads plus `score`, but there is no dedicated snippet, excerpt, or match-context field that downstream tools can consume. This forces every consumer to either accept poor previews or re-open the underlying content and recompute context outside the search contract.

## Proposed solution

Improve graph search so symbols, specs, and documents all return useful match-context snippets across both text and structured output. The change should preserve the existing category model, filtering semantics, and relevance-ranked search flow, while extending the search contract so result payloads can carry richer preview data instead of forcing the CLI to synthesize crude truncations.

At a contract level, this means the search layer must stop treating preview text as an incidental formatting concern and start treating it as part of the result model. The updated specs should define:

- what searchable text is eligible to produce snippet context for each category
- what structured snippet or match-context fields are returned by search results
- how text-mode output consumes that richer result data
- what fallback behavior applies when a category has a valid hit but weak or missing preview text

The change is intentionally about result context, not about replacing the current search architecture. It should continue to use the existing graph-store-backed ranking pipeline and exact-match prioritization rules, but produce search results that explain the hit more effectively.

Text-mode presentation also needs to improve alongside the result model. The current single-line rendering degrades badly when preview text contains multiline JSDoc, markdown frontmatter, or long wrapped content, and exact-match boost values make the displayed score hard to interpret. The updated contract should support a more readable text layout where identity and snippet are rendered separately instead of forcing both into one crowded line.

At the proposal level, the intended snippet sources are:

- **Symbols**: derive preview text from persisted source-file content addressed through the symbol's file path and line location. Symbol comments remain valid ranking/search context where already supported, but symbol previews should no longer depend exclusively on comment text. Even when a symbol hit is driven by JSDoc/comment text, the preferred preview should still be a code snippet around the symbol location unless downstream specs define a narrow exception. This change therefore extends the graph model so `FileNode` persists source content and symbol snippets can be cut from file-backed code context.
- **Specs**: derive preview text from the matched portion of indexed spec content when available, with fallback to description-only context when the hit does not yield a better body excerpt.
- **Documents**: derive preview text from the matched portion of indexed document content, centered around the strongest textual hit rather than the beginning of the file.

These source rules establish that snippet text must come from the same searchable material that justified the hit, or from a deterministic identity fallback when no textual body snippet is available.

## Specs affected

### New specs

- None.

### Modified specs

- `cli:graph-search`: update the command contract so text output and structured output expose richer search snippets for symbols, specs, and documents instead of fixed truncations.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:graph-store`: extend the abstract search contract so graph-store search results can provide match-context or snippet data in a backend-agnostic way.
  - This also includes extending the abstract file model so file nodes can persist source content needed for symbol snippets.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:sqlite-graph-store`: update the default backend search behavior to produce richer snippets for symbols, specs, and documents while preserving exact-match prioritization and BM25-based ranking.
  - This includes persisting file source content so symbol snippets can be resolved from file-backed context.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:ladybug-graph-store`: keep the alternate backend aligned with the abstract search contract so it can return equivalent snippet or match-context information.
  - This includes persisting file source content so symbol snippets can be resolved from file-backed context.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected code areas include `packages/cli/src/commands/graph/search.ts`, the graph-store port in `packages/code-graph/src/domain/ports/graph-store.ts`, the file model in `packages/code-graph/src/domain/value-objects/file-node.ts`, and the concrete backend search implementations in `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts` and `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`. Depending on the final contract shape, the change may also require updates to search result value objects or backend-specific mapping helpers used to materialize symbol, spec, and document hits.

The change affects:

- text-mode UX for `specd graph search`
- structured output consumed by tooling, agents, and any command paths that rely on `json` or `toon`
- backend parity between `sqlite` and `ladybug`
- tests that currently assert the old preview shape or old text formatting

This work has high downstream visibility because `cli:graph-search` currently has a `CRITICAL` impact profile in the graph.

## Technical context

Current CLI rendering hardcodes previews with raw truncation: symbol text output uses `symbol.comment.substring(0, 50)`, spec text output uses `spec.description.substring(0, 60)`, and document text output uses `document.content.substring(0, 60)`. That implementation already diverges from the stronger expectation implied by the existing `cli:graph-search` spec for documents, which says text output should show a snippet centered around the best textual match when available.

Current symbol search semantics are narrower than users may expect:

- SQLite symbol search uses FTS over symbol search text and symbol comments, with explicit boost for exact `symbol.id` and `symbol.name` matches
- Ladybug symbol search is specified around symbol name, expanded compound-name search text, and symbol comment
- symbol search does not currently imply code-body search, signature rendering, or arbitrary nearby file context

The change direction is now explicit: instead of persisting ad hoc snippet metadata on each symbol, the graph should persist file source content at the file-node level and derive symbol previews from that shared source of truth. This keeps preview generation tied to durable source material rather than duplicating overlapping snippets across many symbols in the same file.

The remaining technical boundary is whether persisted `FileNode.content` is used only for preview extraction or also becomes searchable full-text input. At proposal level, the preferred direction is to use it for snippet extraction first and keep file-content search out of scope unless downstream specs deliberately opt in. That keeps this change focused on result quality without silently introducing a new searchable category or a broader source-code search model.

The current text output also exposes presentation-specific flaws that downstream specs should address:

- multiline symbol comments are injected inline and break row readability
- document previews often begin with markdown frontmatter or file headers instead of useful match context
- spec previews are constrained to description text even when body content is the meaningful hit
- raw boosted scores are displayed directly, so exact matches produce visually noisy numbers that are not useful as a human-facing relevance signal
- category headers do not make the active per-category limit visible, so a default `10`-result cap can be mistaken for the full available result set

The expected direction is a clearer two-part text rendering:

- a compact identity line for the result type, workspace, symbol/spec/document identity, and location
- a separate snippet block with normalized whitespace, centered context, and bounded line count, rendered inside generic Markdown code fences so agents and humans can recognize it immediately as literal context
- a category header that makes the active limit explicit, e.g. `Symbols (10 shown, limit 10):`, `Specs (10 shown, limit 10):`, `Documents (7 shown, limit 10):`

For code-backed symbol snippets, the preferred extraction model is line-oriented context around the matched symbol location:

- take the matched line plus a small configurable window around it, with the current preferred baseline being 2-3 non-blank lines above and 2-3 non-blank lines below
- blank lines do not count toward the context budget
- preserve line order exactly as it appears in the source file

To keep code readable in text mode, snippet indentation should be normalized before rendering:

1. inspect all non-blank snippet lines
2. compute the smallest leading indentation among them
3. expand tabs to spaces before indentation normalization, using tab width 2
4. compute indentation against that space-expanded representation
5. remove the common leading indentation from every snippet line
6. render the normalized snippet inside fenced code block delimiters with a fixed outer indent for display

This left-aligns the snippet block without flattening the relative indentation of the code itself. The goal is not to pretty-print or reformat code, only to remove irrelevant file-level indentation so the snippet reads cleanly inside the search result.

Illustrative text-mode shape:

````text
[cli] function registerGraphSearch
  packages/cli/src/commands/graph/search.ts:24
  snippet:
    ```
    export function registerGraphSearch(parent: Command): void {
      parent
        .command('search <query>')
        .allowExcessArguments(false)
        .description('Full-text search across symbols, specs, and documents')
    }
    ```
````

The same principle applies to spec and document snippets: render match-centered context as a separate indented block, but without code-specific indentation normalization rules when the source is plain prose or markdown.

Current structured output also lacks a first-class preview field:

- symbols return `workspace`, `symbol`, and `score`
- specs return `workspace`, `specId`, `path`, `title`, `description`, optional `content`, and `score`
- documents return `workspace`, `path`, `configRelativePath`, `content`, and `score`

The proposal therefore keeps the scope centered on improving result context and contract clarity, not on introducing a broader full-code search model or a full ranking redesign.

This also implies an explicit separation between:

- **searchable source text**: the material the backend indexes and ranks
- **preview text**: the material returned to explain the hit

For this change, preview text should be drawn from searchable source text whenever possible instead of from unrelated fixed fields. For symbol hits, the shared persisted file content becomes the preferred preview source even when the ranking signal came from symbol identity or comment text. Where useful source text is still unavailable, the fallback should be a stable identity-oriented preview rather than a misleading excerpt.

## Open questions

None blocking the proposal stage. Exact snippet field naming, snippet ownership between CLI and backends, snippet selection rules for multi-match hits, and whether persisted file content remains preview-only or later becomes full-text searchable will be resolved in the downstream specs and design artifacts for this same change.
