# Verification: Schema Show

## Requirements

### Requirement: Output format

#### Scenario: Text output shows schema name, kind, artifacts, and workflow

- **GIVEN** a valid schema with name `specd-std` version `1`, `kind: schema`, and declared artifacts and workflow steps
- **WHEN** `specd schema show` is run
- **THEN** stdout contains the schema name, version, and kind, an `artifacts:` section, and a `workflow:` section
- **AND** the process exits with code 0

#### Scenario: Text output shows extends when present

- **GIVEN** a schema that declares `extends: '@specd/schema-std'`
- **WHEN** `specd schema show` is run
- **THEN** stdout contains `extends: @specd/schema-std`

#### Scenario: Text output shows plugin count when plugins are configured

- **GIVEN** `specd.yaml` declares `schemaPlugins: ['@specd/plugin-rfc']`
- **WHEN** `specd schema show` is run
- **THEN** stdout contains `plugins: 1 applied`

#### Scenario: Plugins line omitted when showing schema by ref

- **GIVEN** `specd.yaml` declares `schemaPlugins: ['@specd/plugin-rfc']`
- **WHEN** `specd schema show @specd/schema-std` is run
- **THEN** stdout does NOT contain a `plugins:` line

#### Scenario: Optional and required artifacts distinguished

- **GIVEN** the schema declares artifact `proposal` as `optional: true` and `spec` as `optional: false`
- **WHEN** `specd schema show` is run
- **THEN** `proposal` is shown as `optional` and `spec` as `required`

#### Scenario: Requires listed for artifacts

- **GIVEN** the schema declares artifact `spec` with `requires: ["proposal"]`
- **WHEN** `specd schema show` is run
- **THEN** the `spec` line shows `requires=[proposal]`

#### Scenario: Empty requires omitted in text mode

- **GIVEN** the schema declares artifact `proposal` with no `requires`
- **WHEN** `specd schema show` is run
- **THEN** the `proposal` line does not show a `requires` field

#### Scenario: JSON output structure

- **WHEN** `specd schema show --format json` is run
- **THEN** stdout is valid JSON with `schema`, `plugins`, `mode`, `artifacts`, and `workflow`
- **AND** `schema` has `name`, `version`, `kind`, and optionally `extends`
- **AND** `mode` is `"project"`
- **AND** each artifact entry has `id`, `scope`, `optional`, `requires`, `format`, and `delta`
- **AND** each workflow entry has `step` and `requires`
- **AND** the process exits with code 0

#### Scenario: JSON output includes description, output, and hasTaskCompletionCheck

- **GIVEN** a schema with artifact `tasks` that has `description: "Implementation checklist"`, `output: "tasks.md"`, and a `taskCompletionCheck` declared
- **WHEN** `specd schema show --format json` is run
- **THEN** the `tasks` artifact entry includes `"description": "Implementation checklist"`
- **AND** the entry includes `"output": "tasks.md"`
- **AND** the entry includes `"hasTaskCompletionCheck": true`

#### Scenario: Show schema by ref displays resolved schema

- **GIVEN** `@specd/schema-std` is installed as an npm package
- **WHEN** `specd schema show @specd/schema-std` is run
- **THEN** stdout contains the schema name and version from that package
- **AND** the process exits with code 0

#### Scenario: Show schema by ref with JSON includes mode ref

- **GIVEN** `@specd/schema-std` is installed
- **WHEN** `specd schema show @specd/schema-std --format json` is run
- **THEN** the JSON output contains `"mode": "ref"`

#### Scenario: Show schema by file displays resolved schema

- **GIVEN** a valid schema file at `./test-schema.yaml`
- **WHEN** `specd schema show --file ./test-schema.yaml` is run
- **THEN** stdout contains the schema name and version from the file
- **AND** the process exits with code 0

#### Scenario: Show schema by file with JSON includes mode file

- **GIVEN** a valid schema file at `./test-schema.yaml`
- **WHEN** `specd schema show --file ./test-schema.yaml --format json` is run
- **THEN** the JSON output contains `"mode": "file"`

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
