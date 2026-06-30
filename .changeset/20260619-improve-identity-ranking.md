---
    "@specd/cli": minor
    "@specd/code-graph": minor
---

20260619 - improve-identity-ranking: Improve graph search ranking so spec IDs, symbol identities, and document paths outrank generic content matches for partial and segment-based queries. The change adds shared lexical token expansion for specd/code-shaped queries and aligns SQLite, Ladybug, and contract coverage around exact, prefix, suffix, substring, and component-aware identity ranking. User-visible graph-search results now better reflect lookup intent without narrowing broad full-text discovery.

Specs affected:

- `cli:graph-search`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
