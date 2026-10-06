# Verification: Guide Bundle Compilation

## Requirements

### Requirement: Build-Time Compilation Script

#### Scenario: Script reads all configured collection roots and emits each collection's catalog

- **GIVEN** markdown source files in `docs/guide/` and in the SDK collection source roots
- **WHEN** executing `pnpm run bundle:guides`
- **THEN** the script MUST parse every `.md` file in every configured source root
- **AND** it MUST emit the user collection to `generated/guides.json`
- **AND** it MUST emit the SDK collection to `generated/guides-sdk.json`
- **AND** both emitted files MUST contain valid JSON catalog data
- **AND** it MUST NOT emit a TypeScript catalog or a duplicate catalog beneath `src/`
- **AND** the compilation script MUST exit with code 0

#### Scenario: Nested subdirectories are traversed recursively

- **GIVEN** the source root contains a document at `examples/implementing-a-port.md`
- **WHEN** the bundler compiles that root
- **THEN** the nested document MUST be compiled
- **AND** its topic MUST be `examples/implementing-a-port`
- **AND** the `/` MUST be preserved rather than flattened

#### Scenario: Non-markdown and category metadata files are ignored

- **GIVEN** a source root containing an image and a `_category_.json` alongside markdown documents
- **WHEN** the bundler compiles that root
- **THEN** neither the image nor the `_category_.json` MUST produce a topic
- **AND** the markdown documents MUST still compile

#### Scenario: Source root without markdown fails with an explicit error

- **GIVEN** a configured source root that is missing or contains no `.md` files
- **WHEN** the bundler executes
- **THEN** it MUST fail with an explicit error indicating no guide files were found for that root
- **AND** it MUST exit with a non-zero exit code

#### Scenario: TypeDoc is invoked as a library over the curated entry-point list

- **GIVEN** the public site's curated API entry-point list declaring the sdk, core and code-graph entry points
- **WHEN** the bundler generates the API reference
- **THEN** it MUST invoke TypeDoc over exactly those entry points
- **AND** it MUST NOT read a pre-generated or gitignored artifact from another workspace
- **AND** it MUST apply options equivalent to the public site's `typedoc.json`

#### Scenario: Each documented symbol becomes an addressable topic

- **GIVEN** TypeDoc reports the documented class `ArtifactDag` in the `sdk` entry point
- **WHEN** the SDK collection is compiled
- **THEN** a topic MUST be emitted for it at `sdk:classes/ArtifactDag`

#### Scenario: Core re-exports are reachable through the SDK barrel

- **GIVEN** the `sdk` entry point is the package barrel and re-exports `@specd/core` symbols
- **WHEN** the API reference is generated
- **THEN** those re-exported symbols MUST appear among the generated SDK topics

### Requirement: Mandatory Frontmatter Validation

#### Scenario: File missing frontmatter entirely fails build

- **GIVEN** a markdown file in a collection source root that starts directly with `# Heading` without YAML frontmatter `---`
- **WHEN** the bundler runs
- **THEN** the script MUST abort with an error specifying the missing frontmatter
- **AND** it MUST name the offending file

#### Scenario: Missing required title in frontmatter fails build

- **GIVEN** a guide with frontmatter containing only `description` and `sidebar_position`
- **WHEN** the bundler executes
- **THEN** the build MUST fail with an error indicating `title` is missing or empty
- **AND** the static catalog MUST NOT be emitted

#### Scenario: Empty string description in frontmatter fails build

- **GIVEN** a guide frontmatter with `description: ""` or `description: "   "`
- **WHEN** the bundler executes
- **THEN** the build MUST fail reporting that `description` cannot be whitespace-only

#### Scenario: Invalid non-integer or negative sidebar_position fails build

- **GIVEN** a guide with `sidebar_position: "first"` or `sidebar_position: -5`
- **WHEN** the bundler validates frontmatter
- **THEN** the build MUST fail with a type validation error for `sidebar_position`

#### Scenario: Malformed YAML syntax fails build

- **GIVEN** a guide with invalid YAML syntax (e.g. unquoted colons, invalid tab indents)
- **WHEN** the YAML parser executes
- **THEN** a descriptive YAML parse error MUST be emitted identifying line and column
- **AND** the build process MUST exit with code 1

#### Scenario: SDK collection source documents require the same frontmatter as the user guide

- **GIVEN** a package-reference document in the SDK collection missing `description`
- **WHEN** the bundler executes
- **THEN** the build MUST fail naming that document
- **AND** it MUST NOT fall back to deriving the value from the document's first paragraph

#### Scenario: Generated API topics receive synthesized frontmatter

- **GIVEN** TypeDoc output carries no frontmatter of its own
- **WHEN** a generated API topic is compiled
- **THEN** `title`, `description` and `sidebar_position` MUST be synthesized from the reflection
- **AND** none of the three MUST be empty for any generated topic

### Requirement: Heading and Line Range Extraction

#### Scenario: Code blocks containing '#' are not parsed as Markdown headings

- **GIVEN** a guide with a fenced Python or bash code block containing `# This is a comment, not a heading`
- **WHEN** the heading parser processes the document
- **THEN** the line inside the code fence is ignored as a section boundary
- **AND** only true Markdown headings outside fenced code blocks are recorded in the outline

#### Scenario: Consecutive headings with no intervening text

- **GIVEN** a line `# Parent Heading` immediately followed by `## Child Heading` on the next line
- **WHEN** section ranges are calculated
- **THEN** `Parent Heading` has `startLine: 1`, `endLine: 1` (or spans until the end of its children)
- **AND** `Child Heading` has `startLine: 2`
- **AND** boundaries do not overlap incorrectly

#### Scenario: Section startOffset and endOffset characterize exact character bounds

- **GIVEN** a document body where section 2 starts at character position 120 and ends at character position 450
- **WHEN** section offsets are calculated
- **THEN** `section.startOffset` equals 120
- **AND** `section.endOffset` equals 450
- **AND** `body.slice(section.startOffset, section.endOffset)` matches the section text exactly

#### Scenario: Final section reaches exact end of file

- **GIVEN** a document of 200 lines where the last heading begins on line 180
- **WHEN** calculating the final section's boundary
- **THEN** `section.startLine` is 180
- **AND** `section.endLine` strictly equals 200
- **AND** `section.endOffset` equals the total character length of the clean body
- **AND** no lines are truncated

#### Scenario: Windows CRLF and Unix LF line endings calculate identical line numbers

- **GIVEN** a document formatted with CRLF and an identical document with LF
- **WHEN** both documents are processed by the bundler
- **THEN** both yield identical `startLine` and `endLine` coordinates for every section

### Requirement: Static Catalog Artifact Generation

#### Scenario: Generated JSON asset stores a lightweight catalog and index

- **GIVEN** successful compilation of the user collection
- **WHEN** `generated/guides.json` is parsed
- **THEN** it MUST contain the user catalog as an immutable-at-runtime array payload
- **AND** outline section objects MUST contain `startOffset` and `endOffset` numbers
- **AND** outline section objects MUST NOT serialize duplicate `content` strings
- **AND** it MUST contain an index map mapping topic identifiers to array indices
- **AND** indexing the map with a known topic MUST directly return that guide topic

#### Scenario: Build output is deterministic across repeated runs

- **GIVEN** unchanged markdown files
- **WHEN** running the bundler twice in succession
- **THEN** the emitted file content hash MUST be identical across runs

#### Scenario: Each collection's JSON asset is independently loadable

- **GIVEN** both collections have been compiled
- **WHEN** each generated JSON asset is loaded by its collection engine
- **THEN** each MUST resolve without loading the other collection's catalog
- **AND** each MUST expose its own catalog array and index map

#### Scenario: Adding the SDK collection does not alter the user catalog

- **GIVEN** the user catalog as generated before the SDK collection existed
- **WHEN** the bundler runs with the SDK collection configured
- **THEN** the emitted user catalog MUST be byte-for-byte identical to the previous emission

#### Scenario: Catalog is committed and consumable without source access

- **GIVEN** a packed `@specd/guide` artifact with no documentation source directories
- **WHEN** a consumer imports each published entry point and resolves both catalog engines
- **THEN** the engines MUST load their generated JSON assets successfully
- **AND** no filesystem access to any documentation source root MUST be required
- **AND** the topic inventories MUST match those loaded from the repository build
- **AND** the package MUST contain no generated TypeScript catalog or legacy `src/infrastructure/generated` asset
