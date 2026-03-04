# Verification: Project Overview

## Requirements

### Requirement: Command signature

#### Scenario: Command exits successfully with no flags

- **GIVEN** a valid `specd.yaml` exists and is discoverable
- **WHEN** `specd project overview` is run
- **THEN** the process exits with code 0

#### Scenario: --config flag overrides discovery

- **GIVEN** a `specd.yaml` at `/custom/path/specd.yaml`
- **WHEN** `specd project overview --config /custom/path/specd.yaml` is run
- **THEN** the command reads config from that path and exits with code 0

### Requirement: Text dashboard

#### Scenario: Dashboard includes banner above the box

- **GIVEN** a valid project
- **WHEN** `specd project overview` is run in text mode
- **THEN** stdout begins with the SpecD ASCII art logo before the boxen border

#### Scenario: Dashboard contains project metadata

- **GIVEN** a project with `schemaRef: '@specd/schema-std'` and workspace `default`
- **WHEN** `specd project overview` is run
- **THEN** stdout contains the project root path, `@specd/schema-std`, and `default`

#### Scenario: Specs box shows per-workspace counts

- **GIVEN** a project with 2 specs in workspace `default` and 1 in workspace `billing`
- **WHEN** `specd project overview` is run
- **THEN** stdout contains `3` as total and per-workspace lines for `default` (2) and `billing` (1)

#### Scenario: Changes box shows active, drafts, and discarded

- **GIVEN** a project with 2 active changes, 1 draft, and 1 discarded change
- **WHEN** `specd project overview` is run
- **THEN** stdout contains `2 active`, `drafts: 1`, and `discarded: 1`

### Requirement: JSON and toon output

#### Scenario: JSON output is valid JSON with expected fields

- **WHEN** `specd project overview --format json` is run
- **THEN** stdout is valid JSON containing `projectRoot`, `schemaRef`, `workspaces`, `specs`, and `changes` keys

#### Scenario: JSON output contains no banner or box characters

- **WHEN** `specd project overview --format json` is run
- **THEN** stdout does not contain box-drawing characters or ANSI escape codes

#### Scenario: JSON specs.byWorkspace reflects actual spec distribution

- **GIVEN** a project with 1 spec in `default` and 2 specs in `api`
- **WHEN** `specd project overview --format json` is run
- **THEN** `specs.byWorkspace` is `{"default":1,"api":2}` and `specs.total` is `3`

### Requirement: Data sources

#### Scenario: All four data queries run before output is produced

- **GIVEN** a valid project
- **WHEN** `specd project overview` is run
- **THEN** the output reflects specs, active changes, drafts, and discarded counts simultaneously

### Requirement: Config dependency

#### Scenario: Missing config exits with code 1

- **GIVEN** no `specd.yaml` exists or is discoverable
- **WHEN** `specd project overview` is run
- **THEN** the process exits with code 1
- **AND** stderr contains an `error:` message
