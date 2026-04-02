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

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph search "kernel" --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly

#### Scenario: Explicit path enters bootstrap mode

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph search "kernel" --path /tmp/repo` is run
- **THEN** config discovery is ignored
- **AND** the command searches a synthetic single workspace `default` rooted at `/tmp/repo`

### Requirement: Search behaviour

#### Scenario: Results ranked by relevance

- **GIVEN** specs `hook-execution-model` (contains `hook execution` many times) and `architecture` (contains `hook` once)
- **WHEN** `specd graph search \"hook execution\"` is run
- **THEN** `hook-execution-model` appears before `architecture`
- **AND** the higher-ranked result has the stronger relevance score

#### Scenario: Search matches symbol comments

- **GIVEN** a symbol with comment containing `executing the workflow hook`
- **WHEN** `specd graph search \"execution\"` is run
- **THEN** the symbol may be returned by the active backend's search implementation

#### Scenario: Multi-word query matches across fields

- **GIVEN** a spec with title `Workspace Integration` and content containing `import resolution`
- **WHEN** `specd graph search \"workspace import\"` is run
- **THEN** the spec is returned

#### Scenario: No results

- **WHEN** `specd graph search \"xyznonexistent\"` is run
- **THEN** `No results found.` is output

#### Scenario: Missing config falls back to bootstrap mode

- **GIVEN** no `specd.yaml` is found by autodiscovery
- **WHEN** `specd graph search \"kernel\"` is run inside a repository
- **THEN** the command searches in bootstrap mode against the resolved VCS root as workspace `default`

#### Scenario: Multiple kinds are passed through to the query layer

- **WHEN** `specd graph search \"transition\" --kind class,method,function` is run
- **THEN** the command trims and validates all three kind tokens
- **AND** the provider receives the full kind list rather than only the last token

#### Scenario: Invalid kind token fails before query execution

- **WHEN** `specd graph search \"transition\" --kind method,unknownKind` is run
- **THEN** the command exits with code 1
- **AND** the search query is not executed

#### Scenario: Search fails fast while indexing lock is present

- **GIVEN** a `graph index` process currently holds the shared graph indexing lock
- **WHEN** `specd graph search \"kernel\"` is run
- **THEN** the command exits with code 3 before opening the provider
- **AND** it prints a short retry-later message explaining that the graph is currently being indexed

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

### Requirement: Command signature (filters)

#### Scenario: Filter by multiple symbol kinds

- **WHEN** `specd graph search "transition" --kind class,method` is run
- **THEN** only symbols with kind `class` or `method` are returned
- **AND** symbols of other kinds are excluded

#### Scenario: Filter by file path wildcard

- **WHEN** `specd graph search "create" --file "*/composition/*"` is run
- **THEN** only symbols in files matching the pattern are returned

#### Scenario: Filter by workspace

- **WHEN** `specd graph search "kernel" --workspace core` is run
- **THEN** only symbols from workspace `core` are returned
- **AND** only specs from workspace `core` are returned
