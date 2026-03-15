# Verification: Graph Search

## Requirements

### Requirement: Command signature

#### Scenario: Search both categories by default

- **WHEN** `specd graph search "hook execution"` is run
- **THEN** both symbol and spec results are returned

#### Scenario: Search symbols only

- **WHEN** `specd graph search "transition" --symbols` is run
- **THEN** only symbol results are returned
- **AND** no spec results are shown

#### Scenario: Search specs only

- **WHEN** `specd graph search "workspace" --specs` is run
- **THEN** only spec results are returned
- **AND** no symbol results are shown

#### Scenario: Custom limit

- **WHEN** `specd graph search "hook" --limit 3` is run
- **THEN** at most 3 symbols and 3 specs are returned

### Requirement: Search behaviour

#### Scenario: Results ranked by BM25 relevance

- **GIVEN** specs `hook-execution-model` (contains "hook execution" many times) and `architecture` (contains "hook" once)
- **WHEN** `specd graph search "hook execution"` is run
- **THEN** `hook-execution-model` appears before `architecture`
- **AND** `hook-execution-model` has a higher score

#### Scenario: Stemming matches word variants

- **GIVEN** a symbol with comment containing "executing"
- **WHEN** `specd graph search "execution"` is run
- **THEN** the symbol is returned (porter stemmer matches "executing" to "execution")

#### Scenario: Multi-word query matches across fields

- **GIVEN** a spec with title "Workspace Integration" and content containing "import resolution"
- **WHEN** `specd graph search "workspace import"` is run
- **THEN** the spec is returned

#### Scenario: No results

- **WHEN** `specd graph search "xyznonexistent"` is run
- **THEN** `No results found.` is output

### Requirement: Output format

#### Scenario: Text output groups by category

- **WHEN** results include both symbols and specs in text mode
- **THEN** symbols are listed under `Symbols (N):` header
- **AND** specs are listed under `Specs (N):` header
- **AND** each line shows score, identity, and preview

#### Scenario: JSON output includes workspace and scores

- **WHEN** `specd graph search "hook" --format json` is run
- **THEN** output is `{"symbols":[...],"specs":[...]}`
- **AND** each entry includes a `workspace` field and a `score` field
- **AND** spec entries include `specId`, `path`, `title`, `description` but NOT `content`

#### Scenario: JSON with --spec-content includes full content

- **WHEN** `specd graph search "hook" --format json --spec-content` is run
- **THEN** spec entries include a `content` field with the full spec text

#### Scenario: --spec-content with text format fails

- **WHEN** `specd graph search "hook" --spec-content` is run (text format)
- **THEN** the command exits with code 1
- **AND** an error message explains that `--spec-content` requires `--format json` or `--format toon`

#### Scenario: Text output shows workspace in brackets

- **WHEN** results are displayed in text mode
- **THEN** each line shows `[workspace]` before the symbol or spec identity

### Requirement: Command signature

#### Scenario: Filter by symbol kind

- **WHEN** `specd graph search "transition" --kind method` is run
- **THEN** only symbols with kind `method` are returned
- **AND** symbols of other kinds are excluded

#### Scenario: Filter by file path wildcard

- **WHEN** `specd graph search "create" --file "*/composition/*"` is run
- **THEN** only symbols in files matching the pattern are returned

#### Scenario: Filter by workspace

- **WHEN** `specd graph search "kernel" --workspace core` is run
- **THEN** only symbols from workspace `core` are returned
- **AND** only specs from workspace `core` are returned
