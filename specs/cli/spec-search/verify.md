# Verification: Spec Search

## Requirements

### Requirement: Command signature

#### Scenario: Query is required

- **WHEN** `specd specs search` is run without a query argument
- **THEN** the command exits with a non-zero code

#### Scenario: Empty query rejected

- **WHEN** `specd specs search ""` is run
- **THEN** the command exits with code 1 and prints an error message

### Requirement: Search execution

#### Scenario: Fallback search uses orchestrated workspaces

- **GIVEN** the code graph is unavailable
- **WHEN** `specd specs search "test"` is run
- **THEN** `SearchSpecs.execute()` is called
- **AND** it obtains the list of repositories via the `ListWorkspaces` orchestrator

### Requirement: Workspace filtering

#### Scenario: Single workspace filter

- **GIVEN** the project has specs in workspaces `default` and `cli`
- **WHEN** `specd specs search "spec" --workspace default` is run
- **THEN** only specs from workspace `default` appear in results

#### Scenario: Multiple workspace filters

- **GIVEN** the project has specs in workspaces `default`, `cli`, and `core`
- **WHEN** `specd specs search "spec" --workspace default --workspace cli` is run
- **THEN** results include specs from `default` and `cli` only

#### Scenario: Non-existent workspace name ignored

- **GIVEN** the project has no workspace named `nonexistent`
- **WHEN** `specd specs search "spec" --workspace nonexistent` is run
- **THEN** no error is raised and results may be empty

### Requirement: Summary resolution

#### Scenario: Summary from metadata

- **GIVEN** a matching spec has `.specd-metadata.yaml` with `description: "Handles auth"`
- **WHEN** `specd specs search "auth" --summary` is run
- **THEN** the result includes `summary: "Handles auth"`

#### Scenario: Summary omitted without flag

- **GIVEN** a matching spec has a description in metadata
- **WHEN** `specd specs search "auth"` is run without `--summary`
- **THEN** the result does not include a `summary` field

### Requirement: Output format — text

#### Scenario: Results in table format

- **GIVEN** two specs match the query with paths `default:auth/login` and `cli:entry`
- **WHEN** `specd specs search "auth" --format text` is run
- **THEN** stdout shows a table with PATH and TITLE columns
- **AND** results are sorted by score descending

#### Scenario: No results prints message

- **WHEN** `specd specs search "zzzznonexistent"` is run and nothing matches
- **THEN** stdout contains `no matching specs`

#### Scenario: Summary column added with flag

- **GIVEN** a matching spec has a summary available
- **WHEN** `specd specs search "spec" --summary --format text` is run
- **THEN** the table includes a SUMMARY column

### Requirement: Output format — JSON/toon

#### Scenario: JSON output with score

- **GIVEN** one spec matches the query
- **WHEN** `specd specs search "spec" --format json` is run
- **THEN** stdout is a valid JSON array with one object containing `path`, `title`, and `score`

#### Scenario: Empty results JSON

- **WHEN** `specd specs search "zzzznonexistent" --format json` is run and nothing matches
- **THEN** stdout is `[]`

### Requirement: Error cases

#### Scenario: Graph provider failure with --graph

- **GIVEN** the graph provider fails to initialize
- **WHEN** `specd specs search "test" --graph` is run
- **THEN** the command exits with code 1

#### Scenario: I/O error during core fallback

- **GIVEN** the graph is unavailable and `SpecRepository.search()` throws an I/O error
- **WHEN** `specd specs search "test"` is run
- **THEN** the command exits with code 3
