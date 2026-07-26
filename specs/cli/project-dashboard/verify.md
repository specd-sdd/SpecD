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

- **WHEN** `specd project dashboard` runs in text mode
- **THEN** stdout includes a `Using config:` line before the outer dashboard box

#### Scenario: 'Using config:' path is relative to CWD

- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the config path shown is relative to `process.cwd()`

#### Scenario: Dashboard includes banner above the box

- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the SpecD banner appears above the outer dashboard box

#### Scenario: Dashboard contains project metadata

- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the Project box includes root, schema, and workspaces

#### Scenario: Specs box header shows total with health aggregates

- **GIVEN** `summary.specsHealth` reports passed, failed, and warned counts
- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the Specs box first line includes the total spec count together with health aggregates
- **AND** per-workspace rows still show counts without required per-workspace health badges

#### Scenario: Specs box shows per-workspace counts

- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the Specs box lists each workspace with its spec count

#### Scenario: Changes box shows counts and active tasks line

- **GIVEN** active changes with non-zero task totals in `summary.active`
- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the Changes box shows active, drafts, discarded, and archived counts
- **AND** one additional line shows summed active task progress as done/total
- **AND** individual active/draft change names are not listed in the Changes box

#### Scenario: Long project root wraps to value column

- **GIVEN** a project root path longer than the Project box value column
- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the root value wraps on continuation lines aligned to the value column

#### Scenario: Long workspaces list wraps to value column

- **GIVEN** a workspaces list longer than the Project box value column
- **WHEN** `specd project dashboard` runs in text mode
- **THEN** workspace names wrap on word/comma boundaries aligned to the value column

#### Scenario: Graph box displays health diagnostics when graph is available

- **GIVEN** graph diagnostics are available from the snapshot
- **WHEN** `specd project dashboard` runs in text mode
- **THEN** the Graph box shows freshness, counts, and languages

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

#### Scenario: Dashboard metrics match enriched buildProjectStatusSnapshot

- **WHEN** `specd project dashboard` runs
- **THEN** data is fetched via `buildProjectStatusSnapshot` with `{ includeGraph: true, includeChanges: true, includeSpecsHealth: true }`
- **AND** Specs health and Changes tasks lines are derived from `summary.specsHealth` and `summary.active`
- **AND** the command does not call `GetSpecsHealth`, `ListChanges`, or `CountTasks` directly

### Requirement: Config dependency

#### Scenario: Missing config exits with code 1

- **GIVEN** no `specd.yaml` exists or is discoverable
- **WHEN** `specd project dashboard` is run
- **THEN** the process exits with code 1
- **AND** stderr contains an `error:` message
