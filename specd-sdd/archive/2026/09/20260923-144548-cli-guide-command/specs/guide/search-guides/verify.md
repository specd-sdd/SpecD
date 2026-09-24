# Verification: Search Guides Query

## Requirements

### Requirement: GuideSearchPort Contract

#### Scenario: Port executes search with options and returns ranked hits

- **GIVEN** an implementation of `GuideSearchPort` indexing guide sections
- **WHEN** `search("lifecycle", { limit: 3 })` is called
- **THEN** it resolves to an array of at most 3 `GuideSearchHit` objects
- **AND** hits are ordered by descending `score`

#### Scenario: Scoped search by topic filters results strictly

- **GIVEN** search hits existing across `"workflow"`, `"schemas"`, and `"configuration"`
- **WHEN** `search("schema", { topic: "schemas" })` is executed
- **THEN** every hit in the returned results has `hit.topic === "schemas"`
- **AND** no hits from `"workflow"` or `"configuration"` are returned

### Requirement: In-Memory Search Engine Adapter

#### Scenario: Field boosting prioritizes title and heading matches over body text

- **GIVEN** Section A with heading `"Delta Operations"` and Section B where `"delta operations"` only appears in the body paragraph
- **WHEN** searching for `"delta operations"`
- **THEN** Section A has a significantly higher BM25 score than Section B
- **AND** Section A appears before Section B in the search results

#### Scenario: Fuzzy matching resolves typographical errors

- **GIVEN** guide sections mentioning `"configuration"` and `"lifecycle"`
- **WHEN** searching for typos such as `"configuraton"` or `"lifecicle"`
- **THEN** the search engine matches the intended sections with non-zero scores
- **AND** returns relevant hits

#### Scenario: Query with punctuation, symbols, and regex metacharacters does not crash

- **GIVEN** search queries containing special characters: `"${change.workspace}"`, `"specd.yaml"`, `"[✓]"`, or `"(scope: spec)*"`
- **WHEN** executing the search
- **THEN** the search engine processes the query safely without throwing syntax errors, escaping failures, or regex crashes
- **AND** matches relevant tokens

#### Scenario: English stop-words only query

- **GIVEN** a query consisting solely of stop-words: `"the is at which and"`
- **WHEN** the search engine runs
- **THEN** it completes without throwing unhandled exceptions
- **AND** returns either graceful empty results or lowest-tier fallback matches

#### Scenario: Emojis and Unicode characters in query

- **GIVEN** a query with Unicode symbols (e.g. `"árbol"`, `"🚀"`)
- **WHEN** the search is executed
- **THEN** the engine processes the search without buffer corruption or errors

### Requirement: Contextual Snippet and Read Command Generation

#### Scenario: Snippet is centered on the best-matching line

- **GIVEN** a section spanning lines 100 to 200 in a document
- **WHEN** the search query matches content on line 150
- **THEN** `hit.snippet` with `snippetLines: 3` includes lines 147 through 153
- **AND** each line is prefixed with its absolute 1-indexed document line number (e.g. `150 | ...`)
- **AND** the snippet does NOT start from line 100 (the section start)
- **AND** `hit.readCommand` is `specd guide <topic> --section <sectionIndex>`

#### Scenario: Exact full-query substring match takes priority over partial term matches

- **GIVEN** a section where line A contains one query term and line B contains the exact full query as a substring
- **WHEN** the search match scoring runs
- **THEN** line B is selected as `matchIdx` over line A
- **AND** the snippet window is centered on line B

#### Scenario: Fallback to section start when no term matches any line

- **GIVEN** a section where none of the query terms appear in any line (fuzzy match from index)
- **WHEN** generating the snippet
- **THEN** the snippet falls back to beginning at the section's `startLine`
- **AND** does not crash or emit empty content

#### Scenario: Snippet does not bleed across section boundaries

- **GIVEN** a match near the very start or end of a section
- **WHEN** `snippetLines` context would extend before `startLine` or after `endLine`
- **THEN** the snippet is clamped to the document bounds without bleeding into adjacent sections
- **AND** line numbers remain accurate absolute document positions

### Requirement: SearchGuidesQuery Implementation

#### Scenario: Empty or whitespace-only query returns empty array immediately

- **GIVEN** query `""`, `"   "`, or `"\t\n"`
- **WHEN** `SearchGuidesQuery.execute({ query })` is called
- **THEN** it returns an empty array `[]` immediately without querying the search port

#### Scenario: Limit option restricts result count

- **GIVEN** 20 matching sections in the index
- **WHEN** searching with `limit: 5`
- **THEN** exactly 5 hits are returned

#### Scenario: Zero or negative limit defaults to safe limit

- **GIVEN** a query with `limit: 0` or `limit: -10`
- **WHEN** `SearchGuidesQuery.execute()` runs
- **THEN** it falls back to the default limit (5) and returns valid results
