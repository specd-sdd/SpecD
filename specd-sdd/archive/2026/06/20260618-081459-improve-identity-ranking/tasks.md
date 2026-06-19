# Tasks: improve-identity-ranking

## 1. Shared ranking contract

- [x] 1.1 Add token-aware identity-ranking scenarios to the graph-store contract
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: `graphStoreContractTests` — replace the exact-only ranking fixture with scenarios for shared token expansion, exact/prefix/suffix/substring token strength, real component matches, and document path components so every backend must satisfy the new ordering.
      Approach: encode the backend-agnostic ladder from `design.md` in shared tests first: exact canonical identity, then exact/prefix/suffix/substring token evidence on selected identity fields, with real component matches and higher token coverage outranking weaker identity evidence and content-only matches.
      (Req: Requirement: Search behaviour, Requirement: Search with primary-identity prioritization)

- [x] 1.2 Add shared specd/code-aware token expansion
      `packages/code-graph/src/...` shared search-helper area to be selected during implementation — add lexical token expansion shared by SQLite, Ladybug, and the in-memory store for whitespace, specd separators (`:`, `/`, `_`, `.`, `-`), and CamelCase/PascalCase boundaries.
      Approach: preserve normalized original tokens, expand `core:change -> core:change, core, change`, expand `ArchiveChange -> archivechange, archive, change`, deduplicate stably, and keep the helper lexical only with no entity-type inference.
      (Req: Requirement: Search with primary-identity prioritization)

- [x] 1.3 Update the in-memory test store to honor the stronger ranking contract
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `searchSymbols`, `searchSpecs`, `searchDocuments` — compute identity-aware ordering from shared expanded tokens so contract tests model the same semantics as production stores.
      Approach: keep current candidate generation, then rank by tier, token coverage, token match strength (`exact > prefix > suffix > substring`), and finally existing content relevance.
      (Req: Requirement: Search with primary-identity prioritization)

## 2. SQLite ranking implementation

- [x] 2.1 Wire shared token expansion into SQLite search
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: search helper area near `sanitizeFtsQuery` — consume shared expanded tokens and derive the SQL parameters needed for exact/prefix/suffix/substring identity checks and component-aware matching.
      Approach: keep FTS `MATCH` candidate generation intact, bind one predicate set per expanded token, and prepare explicit SQL rank columns rather than relying on BM25 weights alone. Reuse the same predicates for any identity-derived candidate supplementation needed when `MATCH` alone would miss a required strong hit.
      (Req: Requirement: SQLite full-text search)

- [x] 2.2 Apply token-aware primary-identity ranking to SQLite symbol search
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSymbols` — keep `symbol_fts MATCH`, supplement with identity-derived candidates when necessary, then add SQL ordering columns for canonical id, declared name, token coverage, and token strength so name intent beats comment-only frequency.
      Approach: order by identity tier, expanded-token coverage, token match strength (`exact > prefix > suffix > substring`), and only then `-bm25(symbol_fts)` as the within-tier tie-breaker.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: SQLite full-text search)

- [x] 2.3 Apply token-aware primary-identity ranking to SQLite spec search
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSpecs` — keep `spec_fts MATCH`, supplement with identity-derived candidates when necessary, then rank `specId` exact/full-query matches, expanded token matches, and real component hits above body-only hits.
      Approach: preserve current snippet logic, but add explicit SQL ordering so component matches like `core` in `core:change` outrank arbitrary substring hits like `core` in `score`.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: SQLite full-text search)

- [x] 2.4 Apply token-aware primary-identity ranking to SQLite document search
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchDocuments` — keep `document_fts MATCH`, supplement with identity-derived candidates when necessary, then rank canonical path and `configRelativePath` exact/prefix/suffix/substring token hits and real path components above body-only mentions.
      Approach: reuse the same rank-column model for `path` and `configRelativePath`, preserving document FTS and snippet extraction while changing final ordering only.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: SQLite full-text search)

## 3. Ladybug ranking implementation

- [x] 3.1 Wire shared token expansion into Ladybug search
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: search helper area near `sanitizeFtsQuery` / `extractMatchSnippet` — consume shared expanded tokens and build backend-local rerank data from them.
      Approach: keep `QUERY_FTS_INDEX` and manual document discovery unchanged as the native discovery path, then compute token coverage and token-strength rerank fields in TypeScript. Use the same token predicates for any identity-derived candidate supplementation needed when native tokenization would miss a required strong hit.
      (Req: Requirement: Full-text search implementation)

- [x] 3.2 Apply token-aware primary-identity reranking to Ladybug symbol search
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `searchSymbols` — preserve `QUERY_FTS_INDEX` candidate generation and existing snippet assembly, supplement with identity-derived candidates when necessary, then rerank candidates by identity tier, token coverage, token strength, and native Ladybug score.
      Approach: keep dense comments from outranking the target symbol by ensuring declared-name and symbol-id evidence dominate the rerank step.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: Full-text search implementation)

- [x] 3.3 Apply token-aware primary-identity reranking to Ladybug spec search
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `searchSpecs` — keep the current FTS call and snippet extraction, supplement with identity-derived candidates when necessary, then rerank by `specId` evidence using expanded tokens and component-aware matching.
      Approach: ensure real components like `core` in `core:change` outrank arbitrary substring-only matches while native Ladybug score remains only a final tie-breaker.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: Full-text search implementation)

- [x] 3.4 Apply token-aware primary-identity reranking to Ladybug document search
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `searchDocuments` — keep the manual document scan path, supplement with identity-derived candidates when necessary, then rerank canonical path and alternate path identities above body-only mentions using the same token ladder as SQLite.
      Approach: extend current document scoring with exact/prefix/suffix/substring token strength and real path-component matching so Ladybug document behavior matches SQLite.
      (Req: Requirement: Search with primary-identity prioritization, Requirement: Full-text search implementation)

## 4. Backend and CLI regression tests

- [x] 4.1 Add SQLite regression fixtures for token expansion and token-strength ranking
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: new ranking-focused tests — cover specd separator expansion, CamelCase expansion, exact/prefix/suffix/substring ordering, real component preference, and config-relative document-path preference.
      Approach: build distractor fixtures where the query appears more often in content/comments than in the intended identity, then assert the intended result still ranks first and that stronger token matches outrank weaker ones.
      (Req: Requirement: SQLite full-text search)

- [x] 4.2 Add Ladybug regression fixtures for token expansion and token-strength ranking
      `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts`: new ranking-focused tests — mirror the SQLite scenarios to prove backend parity across FTS-backed and manual document paths.
      Approach: reuse the same intent-heavy fixtures as SQLite, but assert correctness through Ladybug reranking over its mixed FTS/manual implementation paths.
      (Req: Requirement: Full-text search implementation)

- [x] 4.3 Add CLI-level ordering assertions for token-aware graph search
      `packages/cli/test/commands/graph-search.spec.ts`: `graph search` command tests — verify the command preserves token-aware identity ordering from the provider in user-visible output.
      Approach: mock ordered provider results that reflect expanded-token behavior and `exact > prefix > suffix > substring > content-only` ordering, then assert the rendered output shows the intended hit first without changing CLI flags or formatting.
      (Req: Requirement: Command signature, Requirement: Search behaviour)

## 5. Verification

- [x] 5.1 Run targeted graph-store and CLI test suites
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts`, `packages/cli/test/commands/graph-search.spec.ts` — execute the focused suites that cover the new ranking semantics.
      Approach: verify contract parity first, then backend-specific regressions, then CLI presentation, matching the dependency order from `design.md`.
      (Req: Requirement: Search behaviour, Requirement: Search with primary-identity prioritization, Requirement: SQLite full-text search, Requirement: Full-text search implementation)

- [x] 5.2 Manually verify the motivating search cases against both backends
      `node packages/cli/dist/index.js graph search ...` with SQLite and Ladybug provider selection — confirm `architecture`, `default`, `core:change`, `ArchiveChange`, symbol-name, and document-path queries prefer stronger identity matches over weaker identity evidence and body-only hits.
      Approach: use the same scenarios captured in verify and exploration to confirm the implemented token expansion and match-strength ladder fix the real regression, not just the synthetic tests.
      (Req: Requirement: Search behaviour, Requirement: SQLite full-text search, Requirement: Full-text search implementation)
