# Tasks: improve-graph-search-snippets

## 1. Domain & Port Updates

- [x] 1.1 Add `content` field to `FileNode`
- [x] 1.2 Update `GraphStore` search result signatures
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore` — add `snippet: string`, `startLine: number`, and `endLine: number` to search return objects
      Approach: update `searchSymbols`, `searchSpecs`, and `searchDocuments` return types
      (Req: Search with exact-match prioritization)

## 2. Infrastructure & Persistence

- [x] 2.1 Update SQLite schema and version
- [x] 2.2 Update Ladybug schema and version
- [x] 2.3 Implement snippet-aware search with line ranges in `SQLiteGraphStore`
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSymbols`, `searchSpecs`, `searchDocuments` — implement snippet and line range extraction
      Approach: for symbols, return `startLine`/`endLine` from windowing; for specs/docs, find snippet in content to calculate `startLine`
      (Req: Search with exact-match prioritization)
- [x] 2.4 Implement parity search in `LadybugGraphStore`
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: update to match search result signatures with line range metadata
      (Req: Search with exact-match prioritization)
- [x] 2.5 Update persistence logic to handle file content

## 3. Application & Indexing

- [x] 3.1 Populate file content during indexing

## 4. CLI Rendering

- [x] 4.1 Implement `normalizeSnippet` helper
- [x] 4.2 Update CLI search rendering (Text Mode)
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch` — update text output format
      Approach: render `snippet @ L<start>-L<end>:`; use `>>>` and `<<<` markers
      (Req: Output format)
- [x] 4.3 Update CLI search rendering (Structured Mode)
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch` — include `snippet`, `startLine`, and `endLine` in JSON/TOON
      Approach: map new metadata fields to the structured output payload
      (Req: Output format)

## 5. Testing & Verification

- [x] 5.1 Unit test `normalizeSnippet`
- [x] 5.2 Update CLI command tests
      `packages/cli/test/commands/graph-search.spec.ts`: update assertions for `>>>` markers and line range headers
- [x] 5.3 Update store contract tests
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: update to expect `startLine` and `endLine`
- [x] 5.4 Update SQLite store implementation tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: verify line range accuracy
- [x] 5.5 Manual E2E verification
      `E2E`: verify new output format with markers and line ranges
