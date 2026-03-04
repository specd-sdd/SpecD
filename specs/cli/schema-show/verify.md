# Verification: Schema Show

## Requirements

### Requirement: Command signature

#### Scenario: Extra arguments rejected

- **WHEN** `specd schema show some-arg` is run with an unexpected argument
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Text output shows schema name, artifacts, and workflow

- **GIVEN** a valid schema with name `specd-std` version `1` and declared artifacts and workflow steps
- **WHEN** `specd schema show` is run
- **THEN** stdout contains the schema name and version, an `artifacts:` section, and a `workflow:` section
- **AND** the process exits with code 0

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
- **THEN** stdout is valid JSON with `schema`, `artifacts`, and `workflow`
- **AND** `schema` has `name` and `version`
- **AND** each artifact entry has `id`, `scope`, `optional`, `requires`, `format`, and `delta`
- **AND** each workflow entry has `step` and `requires`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Schema cannot be resolved

- **GIVEN** `specd.yaml` references a schema that does not exist
- **WHEN** `specd schema show` is run
- **THEN** the command exits with code 3
- **AND** stderr contains a `fatal:` message
