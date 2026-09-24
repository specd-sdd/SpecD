# Verification: Guide Bundle Compilation

## Requirements

### Requirement: Build-Time Compilation Script

#### Scenario: Script reads docs/guide/\*.md and emits generated catalog

- **GIVEN** markdown source files in `docs/guide/`
- **WHEN** executing `pnpm run bundle-guides`
- **THEN** the script parses all `.md` files in `docs/guide/`
- **AND** emits `src/infrastructure/generated/guides.ts` with valid TypeScript syntax
- **AND** the compilation script exits with code 0

#### Scenario: Empty directory or missing docs/guide directory

- **GIVEN** `docs/guide/` directory is missing or contains no `.md` files
- **WHEN** the bundle script executes
- **THEN** the script fails with an explicit error indicating no guide files were found
- **AND** exits with a non-zero exit code

### Requirement: Mandatory Frontmatter Validation

#### Scenario: File missing frontmatter entirely fails build

- **GIVEN** a markdown file in `docs/guide/` that starts directly with `# Heading` without YAML frontmatter `---`
- **WHEN** the bundle script runs
- **THEN** the script aborts with an error specifying the missing frontmatter
- **AND** names the offending file

#### Scenario: Missing required title in frontmatter fails build

- **GIVEN** a guide with frontmatter containing only `description` and `sidebar_position`
- **WHEN** the bundle script executes
- **THEN** the build fails with an error indicating `title` is missing or empty
- **AND** the static catalog is not emitted

#### Scenario: Empty string description in frontmatter fails build

- **GIVEN** a guide frontmatter with `description: ""` or `description: "   "`
- **WHEN** the bundle script executes
- **THEN** the build fails reporting that `description` cannot be whitespace-only

#### Scenario: Invalid non-integer or negative sidebar_position fails build

- **GIVEN** a guide with `sidebar_position: "first"` or `sidebar_position: -5`
- **WHEN** the bundle script validates frontmatter
- **THEN** the build fails with a type validation error for `sidebar_position`

#### Scenario: Malformed YAML syntax fails build

- **GIVEN** a guide with invalid YAML syntax (e.g. unquoted colons, invalid tab indents)
- **WHEN** the YAML parser executes
- **THEN** a descriptive YAML parse error is emitted identifying line and column
- **AND** the build process exits with code 1

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

#### Scenario: Final section reaches exact end of file

- **GIVEN** a document of 200 lines where the last heading begins on line 180
- **WHEN** calculating the final section's boundary
- **THEN** `section.startLine` is 180
- **AND** `section.endLine` strictly equals 200
- **AND** no lines are truncated

#### Scenario: Windows CRLF and Unix LF line endings calculate identical line numbers

- **GIVEN** a document formatted with CRLF and an identical document with LF
- **WHEN** both documents are processed by the bundler
- **THEN** both yield identical `startLine` and `endLine` coordinates for every section

### Requirement: Static Catalog Artifact Generation

#### Scenario: Generated TypeScript file exports typed catalog and index map

- **GIVEN** successful compilation of 12 guides
- **WHEN** `src/infrastructure/generated/guides.ts` is imported
- **THEN** it exports `GUIDES_CATALOG` as an immutable array of length 12
- **AND** exports `GUIDES_INDEX` mapping topic strings to array indices
- **AND** `GUIDES_CATALOG[GUIDES_INDEX['workflow']]` directly returns the workflow guide topic

#### Scenario: Build output is deterministic across repeated runs

- **GIVEN** unchanged markdown files in `docs/guide/`
- **WHEN** running `bundle-guides` twice in succession
- **THEN** the emitted file content hash is identical across runs
