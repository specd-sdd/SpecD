# Verification: Change Artifacts

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change artifacts` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Text output includes all fields

- **GIVEN** a change `my-change` with artifact `proposal` (complete, file exists) and `tasks` (missing, file absent)
- **WHEN** `specd change artifacts my-change` is run
- **THEN** the `proposal` line shows `complete`, `yes`, and an absolute path
- **AND** the `tasks` line shows `missing`, `no`, and an absolute path
- **AND** the process exits with code 0

#### Scenario: All schema artifacts listed regardless of existence

- **GIVEN** the schema declares three artifacts and none of the files exist on disk
- **WHEN** `specd change artifacts my-change` is run
- **THEN** three lines are printed, all showing `missing` and `no`

#### Scenario: Artifacts in schema-declared order

- **GIVEN** the schema declares artifacts in order: `proposal`, `spec`, `tasks`
- **WHEN** `specd change artifacts my-change` is run
- **THEN** the lines appear in that order

#### Scenario: JSON output structure

- **GIVEN** a change `my-change` with one artifact `proposal` that exists on disk
- **WHEN** `specd change artifacts my-change --format json` is run
- **THEN** stdout is valid JSON with `name`, `changeDir`, and `artifacts`
- **AND** `artifacts[0]` has `id`, `filename`, `path`, `effectiveStatus`, and `exists`
- **AND** `path` is an absolute filesystem path
- **AND** `changeDir` is the absolute path to the change directory

#### Scenario: Paths are absolute

- **WHEN** `specd change artifacts my-change` is run from any working directory
- **THEN** all paths in the output are absolute and do not depend on CWD

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change artifacts nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
