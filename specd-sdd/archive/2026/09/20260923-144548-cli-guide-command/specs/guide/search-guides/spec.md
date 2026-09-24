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

The infrastructure layer MUST implement `GuideSearchPort` using `minisearch`:

- The adapter MUST index every discrete `GuideSection` across all guides.
- Search documents in the index MUST include fields: `id` (e.g. `${topic}#${section.index}`), `topic`, `title`, `heading`, `sectionIndex`, and `content`.
- Field boosting weights MUST be applied:
  - `title`: 5
  - `heading`: 3
  - `content`: 1
- Search configuration MUST enable prefix matching, fuzzy matching, and stop-words filtering.

### Requirement: Contextual Snippet and Read Command Generation

For each search match, the search adapter MUST generate:

- `snippet`: A line-numbered snippet showing `snippetLines` lines **before and after the best-matching line** within the section — not from the start of the section. The adapter MUST:
  - Cache the full document line array per topic to enable line-accurate windowing across section boundaries.
  - Score each line in the section range to find the best-matching line: exact full-query substring match scores highest, followed by significant-term matches with word-boundary bonuses, then prefix matches. Stop-words are filtered from significant terms.
  - Emit lines from `max(0, matchIdx - snippetLines)` to `min(docEnd, matchIdx + snippetLines)`, with absolute 1-indexed document line numbers.
- `readCommand`: An actionable CLI command string that the user or agent can execute to retrieve the full section using its section index or heading (e.g. `specd guide <topic> --section <sectionIndex>`).

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
