# Verification: Project Dashboard

## Requirements

### Requirement: Command signature

#### Scenario: Command exits successfully with no flags

- **GIVEN** a valid `specd.yaml` exists and is discoverable
- **WHEN** `specd project dashboard` is run
- **THEN** the process exits with code 0

#### Scenario: --config flag overrides discovery

- **GIVEN** a `specd.yaml` at `/custom/path/specd.yaml`
- **WHEN** `specd project dashboard --config /custom/path/specd.yaml` is run
- **THEN** the command reads config from that path and exits with code 0

### Requirement: Text dashboard

#### Scenario: Dashboard outputs 'Using config:' line before the box

- **GIVEN** a valid project with `specd.yaml` at `/some/project/specd.yaml`
- **AND** CWD is `/some/project`
- **WHEN** `specd project dashboard` is run
- **THEN** stdout begins with `Using config: specd.yaml` before any box decoration

#### Scenario: 'Using config:' path is relative to CWD

- **GIVEN** CWD is `/home/user`
- **AND** `specd.yaml` is at `/home/user/myproject/specd.yaml`
- **WHEN** `specd project dashboard` is run
- **THEN** stdout contains `Using config: myproject/specd.yaml`

#### Scenario: Dashboard includes banner above the box

- **GIVEN** a valid project
- **WHEN** `specd project dashboard` is run in text mode
- **THEN** stdout contains the SpecD ASCII art logo between the config line and the boxen border

#### Scenario: Dashboard contains project metadata

- **GIVEN** a project with `schemaRef: '@specd/schema-std'` and workspace `default`
- **WHEN** `specd project dashboard` is run
- **THEN** stdout contains the project root path, `@specd/schema-std`, and `default`

#### Scenario: Specs box shows per-workspace counts

- **GIVEN** a project with 2 specs in workspace `default` and 1 in workspace `billing`
- **WHEN** `specd project dashboard` is run
- **THEN** stdout contains `3` as total and per-workspace lines for `default` (2) and `billing` (1)

#### Scenario: Changes box shows active, drafts, discarded, and archived

- **GIVEN** a project with 2 active changes, 1 draft, 1 discarded, and 5 archived changes
- **WHEN** `specd project dashboard` is run
- **THEN** stdout contains `active`, `drafts`, `discarded`, and `archived` as separate aligned table rows in the `Changes` box

#### Scenario: Long project root wraps to value column

- **GIVEN** the project root path is longer than the box's inner width
- **WHEN** `specd project dashboard` is run
- **THEN** the root path wraps to the next line indented to the value column start
- **AND** the box border is not broken

#### Scenario: Long workspaces list wraps to value column

- **GIVEN** a project with 15 workspaces whose combined names exceed the inner box width
- **WHEN** `specd project dashboard` is run
- **THEN** the workspaces list wraps to continuation lines indented to the value column start
- **AND** the box border remains intact

#### Scenario: Graph box displays health diagnostics when graph is available

- **GIVEN** a project with indexed code graph
- **WHEN** `specd project dashboard` is run in text mode
- **THEN** stdout contains a Graph box displaying graph freshness, document count (`docs:`), file/symbol counts, relation count (`relations:`), and indexed languages (`languages:`)

### Requirement: JSON and toon output

#### Scenario: JSON output is valid JSON with expected fields

- **WHEN** `specd project dashboard --format json` is run
- **THEN** execution is redirected to `specd project status --format json`
- **AND** stdout is valid JSON containing `projectRoot`, `schemaRef`, `workspaces`, `specs`, `changes`, and `graph` keys

#### Scenario: JSON output contains no banner, config line, or box characters

- **WHEN** `specd project dashboard --format json` is run
- **THEN** stdout does not contain box-drawing characters, ANSI escape codes, or the `Using config:` prefix

#### Scenario: JSON specs.byWorkspace reflects actual spec distribution

- **GIVEN** a project with 1 spec in `default` and 2 specs in `api`
- **WHEN** `specd project dashboard --format json` is run
- **THEN** `specs.byWorkspace` is `{"default":1,"api":2}` and `specs.total` is `3`

### Requirement: Data sources

#### Scenario: Dashboard metrics match buildProjectStatusSnapshot

- **GIVEN** a valid project
- **WHEN** `specd project dashboard` is run
- **THEN** the spec, change, and graph metrics match the data produced by `buildProjectStatusSnapshot`

### Requirement: Config dependency

#### Scenario: Missing config exits with code 1

- **GIVEN** no `specd.yaml` exists or is discoverable
- **WHEN** `specd project dashboard` is run
- **THEN** the process exits with code 1
- **AND** stderr contains an `error:` message
