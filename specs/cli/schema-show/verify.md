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
- **THEN** stdout is valid JSON with `schema`, `plugins`, `artifacts`, and `workflow`
- **AND** `schema` has `name`, `version`, `kind`, and optionally `extends`
- **AND** each artifact entry has `id`, `scope`, `optional`, `requires`, `format`, and `delta`
- **AND** each workflow entry has `step` and `requires`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Schema cannot be resolved

- **GIVEN** `specd.yaml` references a schema that does not exist
- **WHEN** `specd schema show` is run
- **THEN** the command exits with code 3
- **AND** stderr contains a `fatal:` message
