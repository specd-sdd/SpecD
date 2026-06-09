# Design: improve-graph-search-snippets

## Non-goals

- Implementing a full source-code search model beyond symbols.
- Overhauling the search ranking/scoring logic (BM25 remains).
- Introducing new search categories.

## Affected areas

### Code

- `FileNode` in `packages/code-graph/src/domain/value-objects/file-node.ts`
  - Change: Add optional `content` field.
- `GraphStore` in `packages/code-graph/src/domain/ports/graph-store.ts`
  - Change: Update search return types to include `startLine` and `endLine`.
    ```typescript
    abstract searchSymbols(options: SearchOptions): Promise<Array<{ symbol: SymbolNode; score: number; snippet: string; startLine: number; endLine: number }>>
    abstract searchSpecs(options: SearchOptions): Promise<Array<{ spec: SpecNode; score: number; snippet: string; startLine: number; endLine: number }>>
    abstract searchDocuments(options: SearchOptions): Promise<Array<{ document: DocumentNode; score: number; snippet: string; startLine: number; endLine: number }>>
    ```
- `SQLiteGraphStore` in `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
  - Change:
    - Update search methods to return `startLine` and `endLine`.
    - For symbols: calculate `startLine` and `endLine` from the window expansion.
    - For specs/documents: after getting `snippet` from FTS, find its position in `content` to calculate the start line.
- `LadybugGraphStore` in `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
  - Change: Parity with SQLite for line range metadata.
- `registerGraphSearch` in `packages/cli/src/commands/graph/search.ts`
  - Change:
    - Render category headers: `Symbols (N shown, limit L):`.
    - Render result identity and location.
    - Render snippet block with line range: `snippet @ L<start>-L<end>:`.
    - Use `>>>` and `<<<` as snippet markers.
- `IndexCodeGraph` in `packages/code-graph/src/application/use-cases/index-code-graph.ts`
  - Change: Populate `FileNode.content` during Pass 1.

## New constructs

### `SnippetNormalizer`

- Responsibility:
  1.  Expand tabs to spaces (default `tabWidth: 2`).
  2.  Identify the minimum leading indentation across all non-empty lines.
  3.  Strip that minimum indentation from all lines.
  4.  Trim trailing whitespace from lines.
  5.  Apply an optional `margin` (leading spaces) to every line.

### Symbol Snippet Algorithm (Store Level)

1.  Retrieve full `file.content` for the hit.
2.  Locate the target `line` (1-based).
3.  Extract a window using a non-blank line budget:
    - Expand upwards from `line` until 2 non-blank lines are encountered.
    - Expand downwards from `line` until 2 non-blank lines are encountered.
4.  Record the `startLine` and `endLine` of this window (1-based).
5.  Trim external leading/trailing blank lines of the range, updating `startLine`/`endLine` accordingly.
6.  Return the joined lines as the `snippet`.

### FTS Line Calculation (Store Level)

1.  Get the `snippet` from FTS (without markers).
2.  Search for the first non-ellipsis part of the snippet in the original `content`.
3.  If found, count the number of newlines before that position to determine `startLine`.
4.  Count newlines within the snippet to determine `endLine`.

## Approach

1.  **Extend Model**: Add `content` to `FileNode` and update `GraphStore` search result types.
2.  **Update Persistence Schemas**: Increment `SQLITE_SCHEMA_VERSION` (5) and `SCHEMA_VERSION` (10). Update DDL to include the `content` field.
3.  **Update Indexing**: Pass `decodedContent` to `createFileNode` in `IndexCodeGraph`.
4.  **Implement Snippet & Line Extraction**:
    - **Symbols**: Implement windowing + line tracking in backends.
    - **Specs/Documents**: Use `snippet()` FTS + content search for line calculation.
5.  **Update CLI Rendering**:
    - Update `registerGraphSearch` to use the new `snippet @ L...-L...:` header.
    - Change markers from triple-backticks to `>>>` and `<<<`.

## Key decisions

- **Decision** → Custom markers `>>>` and `<<<`. **Rationale** → Prevents collisions with markdown code blocks in source content, ensuring agents can parse the snippet boundaries reliably.
- **Decision** → Line range header `snippet @ L<start>-L<end>:`. **Rationale** → Standardized context that agents can easily interpret to find the exact location in the file.

## Trade-offs

- [Risk] → Brittle line calculation for FTS. Mitigation → Ellipses from FTS must be handled carefully when searching for the snippet in the source content. If match fails, fallback to `startLine: 1`.

## Testing

### Automated tests

- `packages/cli/test/commands/graph-search.spec.ts`: Update assertions for `>>>` markers and line range headers.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: Verify `startLine` and `endLine` accuracy.

### Manual / E2E verification

- Run `specd graph search "registerGraphSearch"`.
- Verify output:
  ```text
  Symbols (10 shown, limit 10):
    [cli] function registerGraphSearch
      packages/cli/src/commands/graph/search.ts:25
      snippet @ L20-L30:
        >>>
        ...
        <<<
  ```
