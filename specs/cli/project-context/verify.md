# Verification: Project Context

## Requirements

### Requirement: Command signature

#### Scenario: --depth without --follow-deps

- **WHEN** `specd project context --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Context entries rendered first

- **GIVEN** `specd.yaml` has `context:` with `instruction: "Follow conventions."` and `contextIncludeSpecs: ["*"]`
- **WHEN** `specd project context` is run
- **THEN** stdout begins with `Follow conventions.` before any spec content

#### Scenario: Include patterns applied across all workspaces

- **GIVEN** `specd.yaml` has `contextIncludeSpecs: ["*"]` and two workspaces each containing specs
- **WHEN** `specd project context` is run
- **THEN** stdout includes spec content from both workspaces

#### Scenario: Context mode list renders list-style project spec entries

- **GIVEN** `specd.yaml` sets `contextMode: list`
- **WHEN** `specd project context` is run
- **THEN** emitted spec entries are list-mode entries

#### Scenario: Context mode summary renders summary-style project spec entries

- **GIVEN** `specd.yaml` sets `contextMode: summary`
- **WHEN** `specd project context` is run
- **THEN** emitted spec entries are summary-mode entries

#### Scenario: Context mode full renders full project spec entries

- **GIVEN** `specd.yaml` sets `contextMode: full`
- **WHEN** `specd project context` is run
- **THEN** emitted spec entries are full-mode entries

#### Scenario: Context mode hybrid behaves as full in project context

- **GIVEN** `specd.yaml` sets `contextMode: hybrid`
- **WHEN** `specd project context` is run
- **THEN** emitted spec entries are full-mode entries

#### Scenario: Section flags do not affect list or summary mode output

- **GIVEN** `contextMode` is list or summary
- **WHEN** `specd project context --rules --constraints` is run
- **THEN** output remains list/summary shaped

### Requirement: Output

#### Scenario: Text output — full mode renders complete spec content

- **GIVEN** `GetProjectContext` returns full-mode specs
- **WHEN** `specd project context --format text` is called
- **THEN** output renders complete spec content under `## Spec content`

#### Scenario: Text output — summary mode renders catalogue entries

- **GIVEN** `GetProjectContext` returns summary-mode specs
- **WHEN** `specd project context --format text` is called
- **THEN** output renders a summary catalogue under `## Available context specs`

#### Scenario: Text output — list mode renders list entries

- **GIVEN** `GetProjectContext` returns list-mode specs
- **WHEN** `specd project context --format text` is called
- **THEN** output renders list entries under `## Available context specs`

#### Scenario: JSON output — structured spec entries with mode

- **GIVEN** `GetProjectContext` returns structured entries
- **WHEN** `specd project context --format json` is called
- **THEN** JSON includes each entry mode and the fields allowed by that mode

#### Scenario: No project context configured

- **GIVEN** no `context:` entries and no specs match include patterns
- **WHEN** `specd project context` is called
- **THEN** the command prints `no project context configured` and exits with code 0

### Requirement: Warnings

#### Scenario: Missing file entry emits warning

- **GIVEN** `specd.yaml` has `context:` with `file: missing.md` and the file does not exist
- **WHEN** `specd project context` is run
- **THEN** stderr contains a `warning:` line mentioning `missing.md`
- **AND** the process exits with code 0

#### Scenario: Stale metadata emits warning

- **GIVEN** a spec included via patterns has stale `.specd-metadata.yaml`
- **WHEN** `specd project context` is run
- **THEN** stderr contains a `warning:` line for the stale spec
- **AND** the spec content is still included using the metadataExtraction fallback
