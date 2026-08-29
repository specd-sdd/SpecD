# Verification: Schema Show

## Requirements

### Requirement: Command signature

#### Scenario: --raw flag is accepted

- **WHEN** `specd schema show --raw` is run
- **THEN** the command does not error on the unknown flag
- **AND** the process exits with code 0

#### Scenario: --templates flag is accepted

- **WHEN** `specd schema show --templates` is run
- **THEN** the command does not error on the unknown flag
- **AND** the process exits with code 0

#### Scenario: --raw and --templates can be combined

- **WHEN** `specd schema show --raw --templates` is run
- **THEN** the command does not error
- **AND** the process exits with code 0

### Requirement: Output format

#### Scenario: Text output shows schema name, kind, artifacts, and workflow

- **WHEN** `specd schema show` runs in text mode
- **THEN** it outputs header with schema name, version, and kind

#### Scenario: Text output shows extends and compat when present

- **GIVEN** a schema with `extends` and `compat` declared
- **WHEN** `specd schema show` runs in text mode
- **THEN** output includes `extends: <ref>` and `compat: <name>@<version>`

#### Scenario: Text output shows plugin count when plugins are configured

- **GIVEN** a project with schema plugins configured
- **WHEN** `specd schema show` runs in text mode
- **THEN** it displays the active plugins count

#### Scenario: Plugins line omitted when showing schema by ref

- **WHEN** `specd schema show <ref>` runs
- **THEN** plugins line is omitted

#### Scenario: Optional and required artifacts distinguished

- **WHEN** `specd schema show` displays artifacts
- **THEN** it distinguishes optional and required artifacts

#### Scenario: Requires listed for artifacts

- **WHEN** an artifact declares prerequisites
- **THEN** they are formatted in `requires=[...]`

#### Scenario: Empty requires omitted in text mode

- **WHEN** an artifact has no prerequisites
- **THEN** `requires` is omitted from that artifact line

#### Scenario: JSON output includes all schema fields

- **WHEN** `specd schema show --format json` runs
- **THEN** the JSON output includes `name`, `version`, `kind`, optional `extends`, and optional `compat` inside `schema` object

#### Scenario: Template field shows reference path by default

- **WHEN** `specd schema show` runs without `--templates`
- **THEN** template references show the declared path

#### Scenario: Template content resolved with --templates

- **WHEN** `specd schema show --templates` runs
- **THEN** template content is resolved and displayed

#### Scenario: Show schema by ref displays resolved schema

- **WHEN** `specd schema show <ref>` runs
- **THEN** it resolves and displays the schema identified by ref

#### Scenario: Show schema by ref with JSON includes mode ref

- **WHEN** `specd schema show <ref> --format json` runs
- **THEN** `mode` field is `"ref"`

#### Scenario: Show schema by file displays resolved schema

- **WHEN** `specd schema show --file <path>` runs
- **THEN** it resolves and displays the schema loaded from file

#### Scenario: Show schema by file with JSON includes mode file

- **WHEN** `specd schema show --file <path> --format json` runs
- **THEN** `mode` field is `"file"`

#### Scenario: Raw mode shows unresolved schema data

- **WHEN** `specd schema show --raw` runs
- **THEN** it displays raw unmerged schema data

#### Scenario: Raw mode works with ref

- **WHEN** `specd schema show <ref> --raw` runs
- **THEN** it outputs raw YAML data for the ref

#### Scenario: Raw mode with --templates resolves template references

- **WHEN** `specd schema show --raw --templates` runs
- **THEN** raw schema displays resolved templates

#### Scenario: Raw mode in project shows base schema without overrides

- **WHEN** `specd schema show --raw` runs in project mode
- **THEN** it shows base schema data without plugin or override layers

### Requirement: Error cases

#### Scenario: Schema cannot be resolved

- **GIVEN** `specd.yaml` references a schema that does not exist
- **WHEN** `specd schema show` is run
- **THEN** the command exits with code 3
- **AND** stderr contains a `fatal:` message

#### Scenario: Ref cannot be resolved

- **WHEN** `specd schema show @nonexistent/schema` is run
- **THEN** the command exits with code 3

#### Scenario: File does not exist

- **WHEN** `specd schema show --file ./nonexistent.yaml` is run
- **THEN** the command exits with code 3

#### Scenario: Ref and --file are mutually exclusive

- **WHEN** `specd schema show @specd/schema-std --file ./schema.yaml` is run
- **THEN** stderr contains `[ref] and --file are mutually exclusive`
- **AND** the command exits with code 1
