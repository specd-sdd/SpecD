# Proposal: improve-identity-ranking

## Motivation

Graph search already supports exact identity boosts, but that is not enough for real lookup behavior. Common terms such as `default` or `architecture` can still let generic content-heavy hits outrank the spec, symbol, or document identity the user is clearly trying to find.

## Current behaviour

Today, queries like `default:_global/architecture` can return the intended spec first when the full identity is typed exactly, but partial or segment-oriented queries still lean too heavily on generic full-text relevance. In practice, a query like `architecture` can rank other specs above `default:_global/architecture` because the token appears more often in their body content.

The same weakness applies to symbol search and likely to document/path-oriented search: exact identity matches are privileged, but strong non-exact identity signals such as primary name, prefix, or identity segment can still lose to content frequency.

## Proposed solution

Strengthen graph-search ranking so primary identities remain the dominant signal not only for exact equality, but also for high-intent identity-oriented queries. The change will define backend-agnostic semantics for stronger preference on spec IDs, symbol names/IDs, and document/file identities, then align SQLite and Ladybug behavior with those semantics.

This change does not introduce a new command or result category. It clarifies and extends existing search ranking behavior so the CLI-observable results better match user intent.

Broad search discovery remains in place: backends must keep using their existing full-text or document-scan retrieval paths across the current searchable fields. Identity-aware logic only reorders relevant candidates; it does not narrow search to identity fields alone.

The change also introduces shared lexical token expansion for specd/code-shaped query text before identity-aware ranking is applied. That expansion is lexical rather than semantic:

- `core:change` expands to tokens including `core:change`, `core`, and `change`
- `ArchiveChange` expands to tokens including `archivechange`, `archive`, and `change`

Ranking semantics will then prefer stronger identity-token evidence in this order:

1. exact token match
2. prefix token match
3. suffix token match
4. substring token match

For structured identities such as spec ids and paths, real component matches (for example `core` in `core:change`) outrank arbitrary substring matches (for example `core` in `score`). Candidates matching more expanded identity tokens also outrank candidates matching fewer identity tokens when generic text relevance is otherwise competing.

## Specs affected

### New specs

- None.

### Modified specs

- `cli:graph-search`: clarify CLI-observable ranking behavior so primary identities outrank generic content hits for partial and segment-based queries, not only exact matches.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: extend abstract search semantics from exact identity prioritization to stronger primary-identity preference across non-exact high-intent queries.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: update SQLite FTS/ranking behavior so spec IDs, symbol names/IDs, and document paths keep precedence under partial, prefix, and segment-oriented identity queries.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:ladybug-graph-store`: align Ladybug backend ranking semantics with the same primary-identity preference required of the abstract store and SQLite backend.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Primary impact is in graph-search behavior across `@specd/code-graph` and the CLI.

Affected code areas already surfaced during discovery:

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
- `packages/code-graph/src/composition/code-graph-provider.ts`
- `packages/cli/src/commands/graph/search.ts`

Potentially affected adjacent behavior:

- provider-level symbol/spec/document search ordering
- backend-specific search weighting and identity boosting
- shared token expansion for specd/code-shaped query text
- tests covering graph search ranking and backend parity

The fallback `core:search-specs` path was noted as related context, but this proposal keeps the change centered on graph search semantics and graph-backed CLI behavior.

## Technical context

Discovery confirmed that current specs already require exact identity prioritization:

- `cli:graph-search`
- `code-graph:graph-store`
- `code-graph:sqlite-graph-store`

Observed runtime behavior matched that requirement only partially:

- `graph search "default:_global/architecture" --specs` returned `default:_global/architecture` first
- `graph search "architecture" --specs` did not return `default:_global/architecture` first

That means the gap is not "add exact-match boosting"; the gap is ranking behavior for non-exact but high-intent identity lookups.

The conversation narrowed the expected identity signals to:

- spec ID
- symbol simple name and symbol ID
- document path, and file/document identity where applicable

The conversation also converged on these implementation-shaping constraints:

- candidate discovery must remain backend-native rather than being replaced with naive whole-query `LIKE` filtering
- identity-aware ranking is token-based, not whole-query intent classification
- shared token expansion is needed because backend tokenizers do not reliably split specd separators or CamelCase code identifiers
- backend ranking must distinguish exact, prefix, suffix, and substring token strength instead of treating every partial match equally

The change should remain semantic and backend-aligned rather than CLI-only. Discovery also surfaced `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts` as part of the relevant backend surface, so Ladybug was explicitly added to the scope for parity with SQLite.

## Open questions

None. This change has a clear product direction: strengthen identity-first ranking semantics across graph search and both supported backends. The remaining work is specification detail, verification coverage, and implementation design.
