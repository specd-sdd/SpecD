# Search Guides Query

## Purpose

To enable developers and AI agents to quickly discover relevant documentation sections without reading entire guides sequentially, `@specd/guide` provides full-text search capabilities across all guides. This spec defines the `GuideSearchPort`, the in-memory BM25 search engine adapter using `minisearch`, and the `SearchGuidesQuery` use case.

## Requirements

### Requirement: GuideSearchPort Contract

The application layer MUST declare a driven port `GuideSearchPort`:

- `search(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>`:
  - Executes full-text search across indexed guide sections.
  - Accepts options:
    - `topic?: string`: Restricts matches to a single topic.
    - `limit?: number`: Maximum results returned (default: 5).
    - `snippetLines?: number`: Number of contextual lines before and after the match in snippets (default: 3).

### Requirement: In-Memory Search Engine Adapter

The infrastructure layer MUST provide an adapter implementing `GuideSearchPort` using an in-memory BM25 engine (`minisearch`):

- The adapter MUST index every guide section in its collection as a separate document, combining the guide title, section heading and section body.
- The adapter MUST apply field boosting so that matches in the title and heading outrank matches in the body text.
- The adapter MUST enable prefix and fuzzy matching.
- The adapter MUST support section-scoped filtering by topic, including collection-qualified topics.
- The adapter MUST tolerate queries containing punctuation, symbols, emojis and non-ASCII characters without throwing.
- The adapter MUST register the per-section location fields `level`, `startLine` and `endLine` as stored fields, so that a hit can report the section bounds without re-parsing source content.

Stop-word handling is scoped to snippet selection only. The adapter MAY maintain an internal set of English stop words for the purpose of choosing which lines to include in a result snippet. Stop-word filtering MUST NOT be applied as a pre-filter that removes documents or terms from the index: BM25 scoring over a small documentation corpus MUST operate over the full indexed content.

### Requirement: Contextual Snippet and Read Command Generation

For each search hit, the infrastructure layer MUST generate a contextual snippet and an actionable read command:

- The snippet MUST be centered on the best-matching line within the matched section.
- Before applying the requested result limit, the adapter MUST promote every hit containing an exact case-insensitive full-query substring in its indexed title, heading, or section content ahead of hits matched only by partial terms. It MUST preserve ordinary BM25 ordering as the tie-breaker within each group.
- Within a hit, an exact full-query substring match MUST likewise take priority over partial term matches when choosing snippet lines.
- When no term matches any line, the snippet MUST fall back to the section start.
- A snippet MUST NOT bleed across section boundaries.
- `file` MUST be the real source path of the matched document relative to its collection root, and MUST NOT be synthesized from the topic identifier. For a hand-written document this is the relative `.md` path; for a generated API topic this is the relative path of the TypeScript declaration the symbol was extracted from.
- `readCommand` MUST name the command that serves the hit's collection. A hit in the SDK collection MUST emit a `specd guide-sdk <collection:topic> --section <sectionIndex>` command and MUST NOT emit `specd guide`.

Search document identifiers MUST be namespaced by collection, so that two collections containing the same topic identifier produce distinct documents and neither overwrites the other when indexing.

### Requirement: SearchGuidesQuery Implementation

The application layer MUST implement `SearchGuidesQuery`:

- The query interactor MUST receive an instance of `GuideSearchPort`.
- The query MUST validate that `query` is non-empty. If empty or whitespace-only, it MUST return an empty array without searching.
- The query MUST delegate execution to the search port and return ranked `GuideSearchHit` records.

## Constraints

- Search index MUST be entirely in-memory with zero persistent database requirements.
- Uses `minisearch` with zero external transitive dependencies.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and performance constraints
- [`guide:guide-model`](../guide-model/spec.md) — GuideSearchHit domain model
