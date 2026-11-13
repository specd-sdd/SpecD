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

- **GIVEN** a term appearing in one guide's title and in another guide's body text
- **WHEN** both guides are searched for that term
- **THEN** the title match MUST rank higher than the body match

#### Scenario: Section content is dynamically extracted and indexed for full-text search

- **GIVEN** a term appearing only in a guide's section body
- **WHEN** that guide is searched
- **THEN** the matching section MUST be returned as a hit

#### Scenario: Fuzzy matching resolves typographical errors

- **GIVEN** a query containing a typographical error
- **WHEN** search is executed
- **THEN** the intended guide MUST still be returned

#### Scenario: Query with punctuation, symbols, and regex metacharacters does not crash

- **GIVEN** a query containing punctuation and regular-expression metacharacters
- **WHEN** search is executed
- **THEN** it MUST NOT throw

#### Scenario: English stop-words only query still returns matches

- **GIVEN** a query consisting solely of English stop words such as `"the"` or `"of"`
- **WHEN** search is executed
- **THEN** matching documents MUST still be returned
- **AND** the result MUST NOT be empty merely because the query terms are stop words
- **AND** stop-word handling MUST NOT pre-filter documents out of the index

#### Scenario: Emojis and Unicode characters in query

- **GIVEN** a query containing emoji and non-ASCII characters
- **WHEN** search is executed
- **THEN** it MUST NOT throw

#### Scenario: Section location fields are stored on each indexed document

- **GIVEN** an indexed section
- **WHEN** it is reported as a hit
- **THEN** `level`, `startLine` and `endLine` MUST be retrievable without re-parsing source content

### Requirement: Contextual Snippet and Read Command Generation

#### Scenario: Snippet is centered on the best-matching line

- **GIVEN** a section containing the query term on one line and unrelated text on others
- **WHEN** a hit is generated
- **THEN** the snippet MUST contain the matching line

#### Scenario: Exact full-query substring match is promoted before result limiting

- **GIVEN** one section containing the full query as a contiguous substring and another containing only its words separately
- **WHEN** both are candidates and the search limit would otherwise retain only the partial-only hit
- **THEN** the exact substring hit MUST rank ahead of the partial-only hit before ordinary score tie-breaking
- **AND** its snippet MUST center on the exact-match line

#### Scenario: Fallback to section start when no term matches any line

- **GIVEN** a section where no individual term appears on any line
- **WHEN** a snippet is generated
- **THEN** the snippet MUST start at the beginning of the section

#### Scenario: Snippet does not bleed across section boundaries

- **GIVEN** two adjacent sections with a match in the first
- **WHEN** a snippet is generated
- **THEN** it MUST NOT include lines from the following section

#### Scenario: Hit file is the real source path

- **GIVEN** a hit for the document at `docs/core/ports.md` in the `core` collection
- **WHEN** the hit is reported
- **THEN** `file` MUST be `ports.md`
- **AND** it MUST NOT be `core:ports.md` or a synthesized `<topic>.md`

#### Scenario: Hit file preserves nested subdirectories

- **GIVEN** a hit for `docs/core/examples/implementing-a-port.md`
- **WHEN** the hit is reported
- **THEN** `file` MUST be `examples/implementing-a-port.md`

#### Scenario: Generated API hit reports the TypeScript declaration path

- **GIVEN** a hit for the generated topic `sdk:classes/ArtifactDag`, whose symbol was extracted from `packages/sdk/src/.../artifact-dag.ts`
- **WHEN** the hit is reported
- **THEN** `file` MUST be the collection-relative path of that TypeScript declaration
- **AND** it MUST NOT be a `.md` path, because no Markdown source file backs a generated topic

#### Scenario: Hit read command names the command serving its collection

- **GIVEN** a hit in the SDK collection for topic `sdk:classes/ArtifactDag` at section 3
- **WHEN** the hit's `readCommand` is produced
- **THEN** it MUST be `specd guide-sdk sdk:classes/ArtifactDag --section 3`
- **AND** it MUST NOT contain `specd guide ` as the command name

#### Scenario: User guide hit keeps the user command

- **GIVEN** a hit in the user guide collection
- **WHEN** the hit's `readCommand` is produced
- **THEN** it MUST reference `specd guide`

#### Scenario: Search document ids are namespaced by collection

- **GIVEN** two collections each containing a topic with the same identifier and the same section index
- **WHEN** both are indexed into one engine
- **THEN** both documents MUST remain retrievable
- **AND** neither MUST overwrite the other
- **AND** each hit MUST report its own `collection`

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
