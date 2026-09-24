# Verification: Get Guide Outline Query

## Requirements

### Requirement: GetGuideOutlineQuery Implementation

#### Scenario: Outline returns document metadata and section array without full content

- **GIVEN** guide topic `"workflow"` with 300 lines and 10 sections
- **WHEN** `GetGuideOutlineQuery.execute({ topic: "workflow" })` is called
- **THEN** it returns a `GuideOutline` object
- **AND** `outline.lines` equals 300
- **AND** `outline.file` equals `"workflow.md"`
- **AND** `outline.sections` has length 10
- **AND** no full body content is included, minimizing token transfer

#### Scenario: Heading levels and line spans are correctly structured

- **GIVEN** a document where `# Title` is on line 1 and `## Section` is on line 15
- **WHEN** inspecting the returned outline
- **THEN** section 0 has `heading: "Title"`, `level: 1`, `startLine: 1`
- **AND** section 1 has `heading: "Section"`, `level: 2`, `startLine: 15`
- **AND** `endLine` of section 0 equals 14

#### Scenario: Document with no headings returns empty outline array

- **GIVEN** a valid guide topic composed purely of paragraph prose without any `#` headings
- **WHEN** `GetGuideOutlineQuery.execute()` is called
- **THEN** `outline.sections` is an empty array `[]`
- **AND** `outline.lines` correctly reports total document lines

#### Scenario: Unknown topic query rejects with GuideTopicNotFoundError

- **GIVEN** an unknown topic `"unknown-outline"`
- **WHEN** `GetGuideOutlineQuery.execute({ topic: "unknown-outline" })` is invoked
- **THEN** it rejects with `GuideTopicNotFoundError`
- **AND** `error.code` is `'UNKNOWN_GUIDE_TOPIC'`
