# Verification: Slice Guide Content

## Requirements

### Requirement: GetGuideSectionQuery Implementation

#### Scenario: Section extraction returns heading and all body lines up to next peer heading

- **GIVEN** a section starting with `## Configuration Syntax` on line 20 and next `##` on line 50
- **WHEN** `GetGuideSectionQuery.execute({ topic: "configuration", section: "Configuration Syntax" })` is called
- **THEN** the returned content is extracted dynamically from the guide content
- **AND** starts with `## Configuration Syntax`
- **AND** contains lines 20 through 49
- **AND** excludes the next heading on line 50

#### Scenario: Section extraction includes nested child subheadings

- **GIVEN** `## Workflow States` containing `### Drafting` and `### Designing` before `## Approvals`
- **WHEN** extracting section `"Workflow States"`
- **THEN** both `### Drafting` and `### Designing` subheadings and their bodies are included in the extracted content
- **AND** `## Approvals` is not included

#### Scenario: Heading match is case-insensitive and whitespace-tolerant

- **GIVEN** section `## Lifecycle States`
- **WHEN** queried with lowercase `"lifecycle states"` or with extra spaces `"  lifecycle states  "`
- **THEN** the section is matched and returned successfully

#### Scenario: Heading match supports kebab-case slugs

- **GIVEN** section `## Standard Schema DAG`
- **WHEN** queried with slug `"standard-schema-dag"`
- **THEN** the query normalizes and matches the section

#### Scenario: Non-existent section throws GuideSectionNotFoundError

- **GIVEN** topic `"configuration"` with sections `["Syntax", "Overrides"]`
- **WHEN** requesting non-existent section `"NonExistent"`
- **THEN** it rejects with `GuideSectionNotFoundError`
- **AND** `error.code` is `'UNKNOWN_GUIDE_SECTION'`
- **AND** the error exposes the document's section headings

#### Scenario: Section selection by 1-indexed numeric index

- **GIVEN** a guide with 5 sections in its outline
- **WHEN** `GetGuideSectionQuery.execute({ topic: "workflow", section: 3 })` is called
- **THEN** it returns the 3rd section in the outline
- **AND** `section.index` strictly equals 3
- **AND** `section.content` is populated dynamically from topic content

#### Scenario: Section selection by numeric string

- **GIVEN** a guide with outline
- **WHEN** `GetGuideSectionQuery.execute({ topic: "workflow", section: "2" })` is called
- **THEN** the numeric string is parsed as integer 2
- **AND** returns the 2nd section in the outline

#### Scenario: Numeric detection requires a digits-only trimmed value

- **GIVEN** a document with a section heading containing digits, such as `## Phase 2 Rollout`
- **WHEN** the selector `"Phase 2 Rollout"` is supplied
- **THEN** it MUST be treated as a heading name, not as a numeric index
- **AND** the numeric path MUST be taken only when the trimmed value consists solely of digits

#### Scenario: Disambiguating duplicate section headings via section index

- **GIVEN** a document containing two separate sections both titled `## Examples` at index 3 and index 7
- **WHEN** requesting `section: 7`
- **THEN** the query returns the second `## Examples` section at index 7 rather than the first match
- **AND** `section.index` strictly equals 7

#### Scenario: Querying ambiguous duplicate heading by name throws GuideSectionAmbiguousError

- **GIVEN** a document containing two separate sections both titled `## Examples` at index 3 and index 7
- **WHEN** requesting by name `section: "Examples"`
- **THEN** the query rejects with `GuideSectionAmbiguousError`
- **AND** `error.code` is `'AMBIGUOUS_GUIDE_SECTION'`
- **AND** `error.matchingIndices` contains `[3, 7]`
- **AND** `error.message` prompts the user to select `--section 3` or `--section 7`

#### Scenario: Ambiguity is never resolved silently

- **GIVEN** a document with duplicate headings
- **WHEN** the query is called with that heading name
- **THEN** it MUST NOT return the first matching section as if it were unambiguous

#### Scenario: Section index out of bounds throws GuideSectionNotFoundError

- **GIVEN** a guide with 6 sections in its outline
- **WHEN** requesting `section: 0` or `section: 15`
- **THEN** the query rejects with `GuideSectionNotFoundError`
- **AND** `error.code` is `'UNKNOWN_GUIDE_SECTION'`

#### Scenario: The section selector is the only accepted selector field

- **GIVEN** the query's declared input interface
- **WHEN** the input is inspected
- **THEN** a heading selector MUST be supplied through the declared section selector field
- **AND** a field named `sectionHeading` MUST NOT be part of the input interface
- **AND** invoking the query with a `sectionHeading` field MUST NOT be a supported invocation

#### Scenario: Collection-qualified topics resolve for section extraction

- **GIVEN** two collections each containing a topic named `ports`, each with different content
- **WHEN** `GetGuideSectionQuery.execute({ topic: "core:ports", section: 1 })` is called against the core collection's port
- **THEN** the section MUST be extracted from the `core` collection's document
- **AND** the other collection's document MUST NOT be consulted

#### Scenario: Nested collection-qualified topic resolves for section extraction

- **GIVEN** a collection containing `examples/implementing-a-port`
- **WHEN** `GetGuideSectionQuery.execute({ topic: "core:examples/implementing-a-port", section: 1 })` is called
- **THEN** the nested document's section MUST be extracted

#### Scenario: Available headings shape is documented and consistent

- **GIVEN** a query that rejects because no section matched
- **WHEN** the error's available-headings value is inspected
- **THEN** it MUST be either the list of available heading strings or the list of available section descriptors
- **AND** the shape MUST be consistent across rejections from the same invocation
- **AND** the shape MUST NOT vary unpredictably between error cases

#### Scenario: Query resolves only within the served collection

- **GIVEN** a query whose port serves the `core` collection
- **WHEN** a topic belonging to another collection is requested
- **THEN** the query MUST reject as not found

### Requirement: SliceGuideLinesQuery Implementation

#### Scenario: Normal bounded line slicing

- **GIVEN** a text block with 50 lines
- **WHEN** `sliceGuideLines(content, 10, 5)` is executed
- **THEN** exactly 5 lines are returned (lines 10 through 14)

#### Scenario: Omitting lineCount slices to end of content

- **GIVEN** a text block with 30 lines
- **WHEN** `sliceGuideLines(content, 20)` is called without `lineCount`
- **THEN** 11 lines are returned (lines 20 through 30)

#### Scenario: startLine <= 0 defaults to line 1

- **GIVEN** `sliceGuideLines(content, 0, 10)` or `sliceGuideLines(content, -5, 10)`
- **WHEN** the slice is computed
- **THEN** it starts slicing from line 1 and returns the first 10 lines

#### Scenario: startLine exceeding total lines returns empty string

- **GIVEN** content with 25 lines
- **WHEN** `sliceGuideLines(content, 100, 10)` is executed
- **THEN** it returns an empty string `""` without throwing an error

#### Scenario: lineCount equal to 0 returns empty string

- **GIVEN** content with 50 lines
- **WHEN** `sliceGuideLines(content, 5, 0)` is executed
- **THEN** it returns an empty string `""`

#### Scenario: lineCount exceeding remaining lines returns up to end of document

- **GIVEN** content with 20 lines
- **WHEN** `sliceGuideLines(content, 15, 50)` is executed
- **THEN** it returns lines 15 through 20 (6 lines total) without padding or errors

### Requirement: Line Number Formatting Utility

#### Scenario: Number prefixing right-aligns line numbers with padding

- **GIVEN** a slice spanning from line 98 to line 102 (maximum line number has 3 digits)
- **WHEN** `formatWithLineNumbers(sliceContent, 98)` is executed
- **THEN** line 98 is prefixed with `"  98 | "`
- **AND** line 100 is prefixed with `" 100 | "`
- **AND** vertical pipes `|` align across all lines

#### Scenario: Single-digit line numbers pad based on highest line number

- **GIVEN** lines 1 to 5 formatted where max line is 5 (1 digit)
- **WHEN** `formatWithLineNumbers(content, 1)` is called
- **THEN** line 1 is prefixed with `"1 | "` without extra leading padding

#### Scenario: Empty string input returns empty string

- **GIVEN** an empty string `""`
- **WHEN** `formatWithLineNumbers("", 1)` is called
- **THEN** it returns `""` immediately
