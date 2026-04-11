# Verification: Change Artifacts

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change artifacts` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Text output includes artifact state and file state

- **GIVEN** a change with `specs` in `drifted-pending-review`
- **AND** one tracked file is `drifted-pending-review`
- **WHEN** `specd change artifacts <name>` is run
- **THEN** the line includes both the artifact state and the file state
- **AND** it includes the absolute path

#### Scenario: JSON output exposes both state levels

- **GIVEN** a change with one tracked artifact file
- **WHEN** `specd change artifacts <name> --format json` is run
- **THEN** each JSON row includes `artifactState`
- **AND** it includes `fileState`
- **AND** it includes the absolute `path`

#### Scenario: Artifacts still listed in schema-declared order

- **GIVEN** the schema declares three artifacts
- **WHEN** `specd change artifacts <name>` is run
- **THEN** rows are grouped and emitted in schema-declared order

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change artifacts nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
