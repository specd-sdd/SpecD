# Verification: Slice Guide Content

## Requirements

### Requirement: GetGuideSectionQuery Implementation

#### Scenario: Section extraction returns heading and all body lines up to next peer heading

- **GIVEN** a section starting with `## Configuration Syntax` on line 20 and next `##` on line 50
- **WHEN** `GetGuideSectionQuery.execute({ topic: "configuration", sectionHeading: "Configuration Syntax" })` is called
- **THEN** the returned content starts with `## Configuration Syntax`
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
- **AND** `error.availableHeadings` lists `["Syntax", "Overrides"]`

#### Scenario: Section selection by 1-indexed numeric index

- **GIVEN** a guide with 5 sections in its outline
- **WHEN** `GetGuideSectionQuery.execute({ topic: "workflow", section: 3 })` is called
- **THEN** it returns the 3rd section in the outline
- **AND** `section.index` strictly equals 3

#### Scenario: Section selection by numeric string

- **GIVEN** a guide with outline
- **WHEN** `GetGuideSectionQuery.execute({ topic: "workflow", section: "2" })` is called
- **THEN** the numeric string is parsed as integer 2
- **AND** returns the 2nd section in the outline

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

#### Scenario: Section index out of bounds throws GuideSectionNotFoundError

- **GIVEN** a guide with 6 sections in its outline
- **WHEN** requesting `section: 0` or `section: 15`
- **THEN** the query rejects with `GuideSectionNotFoundError`
- **AND** `error.code` is `'UNKNOWN_GUIDE_SECTION'`

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
