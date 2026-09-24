# Verification: CLI Guide Command

## Requirements

### Requirement: Guide Catalog Listing Command

#### Scenario: Plain 'specd guide' lists all available topics

- **GIVEN** `@specd/guide` catalog containing 12 guides
- **WHEN** running `node packages/cli/dist/index.js guide`
- **THEN** it outputs a formatted list or table containing all 12 topics
- **AND** displays `topic`, `title`, and `description` for each guide
- **AND** exits with status code 0

#### Scenario: Catalog listing in JSON and TOON formats

- **GIVEN** `@specd/guide` catalog
- **WHEN** running `node packages/cli/dist/index.js guide --format json`
- **THEN** output is parseable as a JSON array of guide summaries
- **AND** running with `--format toon` emits a compact TOON array with zero syntax errors
- **AND** both exit with status code 0

### Requirement: Guide Topic Inspection Command

#### Scenario: Reading a valid topic outputs full Markdown

- **GIVEN** guide topic `"getting-started"`
- **WHEN** running `node packages/cli/dist/index.js guide getting-started`
- **THEN** the full raw Markdown of the guide is printed to stdout
- **AND** exits with status code 0

#### Scenario: Reading an unknown topic outputs error and exits with code 1

- **GIVEN** an unknown topic name `"fake-topic"`
- **WHEN** running `node packages/cli/dist/index.js guide fake-topic`
- **THEN** stderr or stdout displays an error message containing `UNKNOWN_GUIDE_TOPIC`
- **AND** lists available valid guide topics
- **AND** the CLI process exits with code 1

#### Scenario: Topic query is case-insensitive in CLI

- **GIVEN** registered topic `"workflow"`
- **WHEN** running `node packages/cli/dist/index.js guide WORKFLOW`
- **THEN** the workflow guide is displayed successfully
- **AND** process exits with code 0

### Requirement: Document Metadata and Outline Flags

#### Scenario: '--meta' flag returns document statistics and section outline

- **GIVEN** guide topic `"schemas"`
- **WHEN** running `node packages/cli/dist/index.js guide schemas --meta`
- **THEN** the command does not print the full document text
- **AND** prints `topic: schemas`, total line count, total bytes, and an outline table of all sections
- **AND** each section row includes `index`, `heading`, `level`, `startLine`, `endLine`, and `lines`
- **AND** process exits with code 0

#### Scenario: '--meta' combined with '--format toon' produces compact outline for agents

- **GIVEN** guide topic `"configuration"`
- **WHEN** running `node packages/cli/dist/index.js guide configuration --meta --format toon`
- **THEN** output is formatted in compact TOON
- **AND** contains the `outline` array with numeric `index`, `startLine`, and `endLine` values
- **AND** token consumption is under 200 tokens

### Requirement: Section and Window Slicing Flags

#### Scenario: '--section' extracts specific section content by heading name

- **GIVEN** guide topic `"workflow"` containing section `## Lifecycle States`
- **WHEN** running `node packages/cli/dist/index.js guide workflow --section "Lifecycle States"`
- **THEN** only the `## Lifecycle States` heading and its body are emitted
- **AND** process exits with code 0

#### Scenario: '--section' extracts specific section content by 1-indexed section number

- **GIVEN** guide topic `"workflow"` with section 3
- **WHEN** running `node packages/cli/dist/index.js guide workflow --section 3`
- **THEN** only the 3rd section's heading and body are emitted
- **AND** process exits with code 0

#### Scenario: '--section' disambiguates duplicate section headings via section number

- **GIVEN** a document containing multiple `## Examples` sections at index 2 and index 6
- **WHEN** running `node packages/cli/dist/index.js guide cli --section 6`
- **THEN** the second `## Examples` section at index 6 is emitted
- **AND** process exits with code 0

#### Scenario: '--section' with duplicate heading title outputs AMBIGUOUS_GUIDE_SECTION and exits with code 1

- **GIVEN** guide topic `"cli"` containing multiple sections titled `## Examples` at indices 2 and 6
- **WHEN** running `node packages/cli/dist/index.js guide cli --section "Examples"`
- **THEN** output displays error code `AMBIGUOUS_GUIDE_SECTION`
- **AND** lists matching candidate section indices `[2]` and `[6]` with their line ranges
- **AND** prompts to run `specd guide cli --section 2` or `specd guide cli --section 6`
- **AND** process exits with code 1

#### Scenario: '--section' with non-existent heading or out-of-bounds index exits with code 1

- **GIVEN** guide topic `"workflow"`
- **WHEN** running `node packages/cli/dist/index.js guide workflow --section "NonExistentHeading"` or `--section 999`
- **THEN** the command outputs `UNKNOWN_GUIDE_SECTION`
- **AND** lists valid section headings and indices for topic `"workflow"`
- **AND** the process exits with code 1

#### Scenario: '--start-line' and '--lines' slice bounded window

- **GIVEN** guide topic `"workflow"`
- **WHEN** running `node packages/cli/dist/index.js guide workflow --start-line 15 --lines 10`
- **THEN** exactly 10 lines (lines 15 to 24) are printed to stdout
- **AND** process exits with code 0

#### Scenario: '--line-numbers' prefixes 1-indexed line numbers

- **GIVEN** guide topic `"workflow"`
- **WHEN** running `node packages/cli/dist/index.js guide workflow --start-line 1 --lines 5 --line-numbers`
- **THEN** each emitted line begins with its 1-indexed line number (e.g. `1 | ...`)
- **AND** process exits with code 0

#### Scenario: Combining '--section' and '--line-numbers'

- **GIVEN** section `## Lifecycle States` starting at line 45
- **WHEN** running `node packages/cli/dist/index.js guide workflow --section "Lifecycle States" --line-numbers`
- **THEN** lines of the section are prefixed with their absolute 1-indexed document line numbers starting at 45

### Requirement: Guide Search Subcommand

#### Scenario: 'specd guide search' returns ranked search results

- **GIVEN** an index of all guide sections
- **WHEN** running `node packages/cli/dist/index.js guide search "lifecycle states"`
- **THEN** matching results are output with topic, section heading, line coordinates, score, and line-numbered snippet
- **AND** process exits with code 0

#### Scenario: Search with '--topic' scopes results to single topic

- **GIVEN** query `"schema"` present across multiple guides
- **WHEN** running `node packages/cli/dist/index.js guide search "schema" --topic standard-schema`
- **THEN** every result item is from `standard-schema`
- **AND** no results from other topics appear

#### Scenario: Search with '--limit' restricts match count

- **GIVEN** a query matching 10 sections
- **WHEN** running `node packages/cli/dist/index.js guide search "spec" --limit 2`
- **THEN** exactly 2 results are emitted

#### Scenario: Empty search query in CLI

- **GIVEN** `node packages/cli/dist/index.js guide search ""`
- **WHEN** executed
- **THEN** the command outputs an empty result set or helpful prompt without throwing unhandled exceptions
- **AND** exits with code 0

### Requirement: Structured Output Formatting

#### Scenario: Search output in '--format toon'

- **GIVEN** a search query
- **WHEN** running `node packages/cli/dist/index.js guide search "lifecycle" --format toon`
- **THEN** output is formatted in clean TOON
- **AND** each entry includes `topic`, `section`, `startLine`, `endLine`, `snippet`, and `readCommand`

#### Scenario: Search output in '--format json'

- **GIVEN** a search query
- **WHEN** running `node packages/cli/dist/index.js guide search "lifecycle" --format json`
- **THEN** output is valid JSON parseable with `JSON.parse()`

### Requirement: Commander CLI Integration

#### Scenario: Guide command appears in 'specd --help'

- **GIVEN** the CLI root entrypoint
- **WHEN** running `node packages/cli/dist/index.js --help`
- **THEN** `guide` is listed among available commands with its description

#### Scenario: Subcommand 'specd guide search --help' documents all flags

- **GIVEN** the search subcommand
- **WHEN** running `node packages/cli/dist/index.js guide search --help`
- **THEN** `--topic`, `--limit`, `--snippet-lines`, and `--format` are documented
