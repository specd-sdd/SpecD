# Verification: CLI Guide Command

## Requirements

### Requirement: Guide Catalog Listing Command

#### Scenario: Plain 'specd guide' lists all available topics

- **WHEN** `specd guide` is run with no arguments
- **THEN** it displays every available user guide topic
- **AND** each entry shows its topic, title and description
- **AND** the topics are ordered by their order value

#### Scenario: Catalog listing in JSON and TOON formats

- **WHEN** `specd guide --format json` is run
- **THEN** a JSON array of guide summaries is emitted
- **WHEN** `specd guide --format toon` is run
- **THEN** a TOON-structured array of guide summaries is emitted

#### Scenario: Listing carries a structured field identifying the sibling SDK guide

- **WHEN** `specd guide` is run
- **THEN** the output MUST contain a structured field that identifies `specd guide-sdk`
- **AND** that field MUST be machine-parseable rather than an appended sentence

#### Scenario: Discovery field is present in every supported output format

- **WHEN** the listing is rendered as `text`, `json` and `toon`
- **THEN** the discovery field MUST be present in all three renderings
- **AND** it MUST NOT degrade into a text-only footer in any of them

#### Scenario: Discovery field sits in the structured payload, not the human stream

- **WHEN** `specd guide --format json` and `specd guide --format toon` are run
- **THEN** the discovery field MUST be a member of the emitted structure
- **AND** it MUST NOT be interleaved into human-readable text alongside the entries

#### Scenario: Discovery field names the SDK guide by its exact command name

- **WHEN** the listing is rendered in any supported format
- **THEN** the SDK guide MUST be identified by the exact command string `specd guide-sdk`

#### Scenario: Existing listing contract is preserved alongside the new field

- **GIVEN** the user guide catalog as it stood before this change
- **WHEN** the listing is compared with the previous output
- **THEN** the existing `topic`, `title`, `description` and ordering contract MUST be unchanged
- **AND** the discovery field MUST be purely additive

### Requirement: Guide Listing Envelope And Pagination Reporting

#### Scenario: Listing envelope matches the sibling SDK guide listing

- **WHEN** `specd guide --format json` is run
- **THEN** the output MUST be a structured object with a `topics` member holding the guide summaries
- **AND** it MUST carry a `pagination` member with `page`, `pageSize`, `returned`, `total` and `totalPages`
- **AND** it MUST carry a `collections` member summarising each collection's `total` and its `firstPage`/`lastPage` range
- **AND** the envelope shape MUST be the same one `specd guide-sdk --format json` emits

#### Scenario: Page position is reported only when the result spans several pages

- **GIVEN** the result spans more than one page
- **WHEN** the listing is rendered as `text`
- **THEN** the output MUST report the position as `page N of M` with the returned and total counts
- **GIVEN** the result fits in a single page
- **WHEN** the listing is rendered as `text`
- **THEN** the page position MUST be omitted rather than reported as `page 1 of 1`

#### Scenario: Multi-collection listing delimits collections

- **GIVEN** a listing whose page contains entries from more than one collection
- **WHEN** it is rendered as `text`
- **THEN** the entries of each collection MUST be visibly delimited from the entries of the next collection

### Requirement: Guide Body Flags Require a Topic

#### Scenario: Body flags without a topic are rejected

- **WHEN** `specd guide --section 2` is run with no topic argument
- **THEN** the command MUST exit with code 1 and MUST name `--section` as requiring a topic argument
- **WHEN** `specd guide --lines 5` or `specd guide --start-line 2` is run with no topic argument
- **THEN** the command MUST exit with code 1 and name the offending flag

#### Scenario: Body flags without a topic never fall back to a listing

- **WHEN** a body flag is supplied without a topic argument
- **THEN** the command MUST NOT render a catalog listing
- **AND** it MUST NOT silently discard the requested flag

### Requirement: Guide Meta Without a Topic Returns a Catalog Index

#### Scenario: Meta without a topic returns a catalog index

- **WHEN** `specd guide --meta` is run with no topic argument
- **THEN** the command MUST return a catalog index rather than the plain listing
- **AND** each topic MUST be reported with the page it starts on, its line count, its byte length, its scope and its title
- **AND** the index MUST carry the literal hint `read: specd guide <topic>` exactly once instead of a per-topic retrieval command
- **AND** each topic MUST be printed as the fully qualified `collection:topic` identifier, so the value the hint shows is what the caller pastes into `<topic>`
- **AND** the index MUST NOT carry a per-topic retrieval command

#### Scenario: Meta with a topic still returns that topic's metadata

- **WHEN** `specd guide configuration --meta` is run
- **THEN** the command MUST return that single topic's metadata and outline rather than the index

### Requirement: Guide Points At The Sibling SDK Guide In Help

#### Scenario: Help points at the sibling SDK guide

- **WHEN** `specd guide --help` is run
- **THEN** the help output MUST name the exact command `specd guide-sdk`
- **AND** it MUST state that it serves the SDK and extension development guide

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

- **WHEN** `specd guide <topic> --meta` is executed
- **THEN** the output contains `topic`, `file`, `lines`, `bytes` and `outline`
- **AND** the full document body is not emitted

#### Scenario: '--meta' combined with '--format toon' produces compact outline for agents

- **WHEN** `specd guide <topic> --meta --format toon` is executed
- **THEN** the outline is emitted in TOON form
- **AND** the output remains compact enough to serve as a structural map

#### Scenario: '--meta' file is the real source path, not a synthesized filename

- **GIVEN** a user guide document at `docs/guide/configuration.md`
- **WHEN** `specd guide configuration --meta` is executed
- **THEN** `file` MUST equal `configuration.md`
- **AND** it MUST NOT equal `configuration.md.md` nor any `<topic>`-derived duplication of the path

#### Scenario: '--meta' file preserves nested subdirectories

- **GIVEN** a document that lives in a subdirectory of its collection root
- **WHEN** its metadata is requested
- **THEN** `file` MUST include the relative subdirectory path
- **AND** it MUST NOT be flattened to the bare filename

#### Scenario: '--meta' reports the document's collection

- **WHEN** a document's metadata is requested
- **THEN** the output MUST include a `collection` field naming the collection the document belongs to

#### Scenario: '--meta' outline entries carry offsets

- **WHEN** metadata is requested for a document with multiple sections
- **THEN** every outline entry MUST include `startOffset` and `endOffset`
- **AND** slicing the body with those offsets MUST reproduce the section text exactly

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
