# Verification: Guide Domain Model

## Requirements

### Requirement: GuideTopic Entity

#### Scenario: GuideTopic stores complete content and outline structure

- **GIVEN** raw Markdown content with 150 lines and 4 sections
- **WHEN** a `GuideTopic` entity is created
- **THEN** `topic.content` retains the raw text identically
- **AND** `topic.lineCount` strictly equals 150
- **AND** `topic.byteLength` equals the exact Buffer byte length of the content
- **AND** `topic.outline` contains 4 `GuideSection` items

#### Scenario: Multibyte UTF-8 characters calculate correct byteLength vs character length

- **GIVEN** Markdown content containing UTF-8 characters (e.g. `“añoranza”`, `🎉`, `日本語`)
- **WHEN** calculating `byteLength` for `GuideTopic`
- **THEN** `byteLength` reflects the total UTF-8 bytes (which is greater than `content.length`)
- **AND** `lineCount` counts newline delimiters `\n` accurately

#### Scenario: GuideTopic with Windows CRLF newlines normalizes lineCount

- **GIVEN** Markdown content formatted with CRLF (`\r\n`) newlines
- **WHEN** `GuideTopic` is constructed
- **THEN** `lineCount` reflects the actual line count without counting `\r` as extra lines

### Requirement: GuideSection Value Object

#### Scenario: Section boundaries are 1-indexed and inclusive

- **GIVEN** a heading starting at line 10 and concluding at line 25
- **WHEN** the `GuideSection` value object is inspected
- **THEN** `section.startLine` equals 10
- **AND** `section.endLine` equals 25
- **AND** `section.lines` equals 16 (inclusive: `25 - 10 + 1`)
- **AND** `section.content` begins with the heading line and ends at line 25

#### Scenario: Single-line section (heading with no body)

- **GIVEN** a heading on line 42 immediately followed by the next equal-level heading on line 43
- **WHEN** the `GuideSection` value object is created
- **THEN** `section.startLine` equals 42
- **AND** `section.endLine` equals 42
- **AND** `section.lines` strictly equals 1

#### Scenario: Deep heading levels up to level 6

- **GIVEN** headings ranging from `# H1` to `###### H6`
- **WHEN** `GuideSection` represents each heading
- **THEN** `section.level` is an integer between 1 and 6 inclusive
- **AND** `section.heading` contains the heading text without leading `#` or trailing whitespace

### Requirement: GuideSummary Value Object

#### Scenario: Summary projection contains no heavy content field

- **GIVEN** a 50 KB `GuideTopic` entity
- **WHEN** mapped to `GuideSummary`
- **THEN** `summary.topic`, `summary.title`, `summary.description`, `summary.order`, `summary.lineCount`, and `summary.byteLength` are present
- **AND** `content` and `outline` properties do not exist on the summary object, ensuring minimal memory footprint

### Requirement: GuideOutline Value Object

#### Scenario: Outline provides structural summary of document sections

- **GIVEN** a topic with file `"schemas.md"` containing 8 sections
- **WHEN** `GuideOutline` is constructed
- **THEN** `outline.topic` equals `"schemas"`
- **AND** `outline.file` equals `"schemas.md"`
- **AND** `outline.lines` equals total document lines
- **AND** `outline.sections` has length 8
- **AND** the sum of non-overlapping top-level section spans covers the document lines

### Requirement: GuideSearchHit Value Object

#### Scenario: Search hit contains match coordinates and actionable readCommand

- **GIVEN** a search hit inside topic `"workflow"`, section `"Lifecycle States"`, lines 30-75 with score 4.2
- **WHEN** `GuideSearchHit` is constructed
- **THEN** `hit.topic` is `"workflow"`
- **AND** `hit.section` is `"Lifecycle States"`
- **AND** `hit.startLine` is 30
- **AND** `hit.endLine` is 75
- **AND** `hit.score` is a positive number
- **AND** `hit.readCommand` contains `specd guide workflow --section "Lifecycle States"`
- **AND** `hit.snippet` includes formatted line numbers
