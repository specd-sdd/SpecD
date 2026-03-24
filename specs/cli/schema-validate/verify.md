# Verification: Schema Validate

## Requirements

### Requirement: Command signature

#### Scenario: No flags defaults to project resolved mode

- **WHEN** the user runs `specd schema validate` without `--file` or `--raw`
- **THEN** the command validates the project's fully-resolved schema

#### Scenario: --raw triggers project raw mode

- **WHEN** the user runs `specd schema validate --raw`
- **THEN** the command validates only the base schema without plugins or overrides

#### Scenario: --file triggers file mode

- **WHEN** the user runs `specd schema validate --file ./my-schema.yaml`
- **THEN** the command validates the specified file with extends resolution

### Requirement: Project mode — resolved

#### Scenario: Valid resolved project schema

- **GIVEN** a project with a valid `specd.yaml` and a valid schema
- **WHEN** the user runs `specd schema validate`
- **THEN** exit code is 0
- **AND** output confirms the schema is valid

#### Scenario: Resolved schema with invalid plugin

- **GIVEN** a project whose config references a plugin that does not exist
- **WHEN** the user runs `specd schema validate`
- **THEN** exit code is 1
- **AND** the error identifies the missing plugin

### Requirement: Project mode — raw

#### Scenario: Valid raw project schema

- **GIVEN** a project with a valid base schema
- **WHEN** the user runs `specd schema validate --raw`
- **THEN** exit code is 0
- **AND** output contains `[raw]` suffix

#### Scenario: Raw mode isolates base errors from plugin errors

- **GIVEN** a project whose base schema is valid but a plugin introduces an error
- **WHEN** the user runs `specd schema validate --raw`
- **THEN** exit code is 0 (base is valid regardless of plugin issues)

### Requirement: File mode

#### Scenario: Valid external file

- **GIVEN** a syntactically and semantically valid `schema.yaml` file
- **WHEN** the user runs `specd schema validate --file ./schema.yaml`
- **THEN** exit code is 0
- **AND** output contains `[file]` suffix

#### Scenario: External file with extends resolves chain

- **GIVEN** a schema file that declares `extends: @specd/schema-std`
- **WHEN** the user runs `specd schema validate --file ./schema.yaml`
- **THEN** the extends chain is resolved
- **AND** exit code is 0

#### Scenario: External file with invalid artifact ID

- **GIVEN** a `schema.yaml` with an artifact whose id is `Invalid_ID`
- **WHEN** the user runs `specd schema validate --file ./schema.yaml`
- **THEN** exit code is 1
- **AND** the error mentions the invalid artifact ID

#### Scenario: External file with circular extends

- **GIVEN** a schema file whose extends chain forms a cycle
- **WHEN** the user runs `specd schema validate --file ./schema.yaml`
- **THEN** exit code is 1
- **AND** the error mentions cycle detection

### Requirement: Text output — success

#### Scenario: Project resolved mode success text

- **WHEN** project resolved validation succeeds with schema `my-schema` v1 with 3 artifacts and 2 workflow steps
- **THEN** stdout contains `schema valid: my-schema v1 (3 artifacts, 2 workflow steps)`

#### Scenario: Project raw mode success text

- **WHEN** project raw validation succeeds
- **THEN** stdout contains `[raw]` suffix

#### Scenario: File mode success text

- **WHEN** file mode validation succeeds
- **THEN** stdout contains `[file]` suffix

### Requirement: Text output — failure

#### Scenario: Failure text lists errors

- **WHEN** validation fails with two errors
- **THEN** stdout contains `schema validation failed:` followed by two indented error lines

### Requirement: JSON output

#### Scenario: JSON success contains expected keys

- **WHEN** the user runs `specd schema validate --format json` and validation succeeds
- **THEN** the JSON output contains `result`, `schema`, `artifacts`, `workflowSteps`, `mode`, and `warnings`

#### Scenario: JSON failure contains error details

- **WHEN** the user runs `specd schema validate --format json` and validation fails
- **THEN** the JSON output contains `result: "error"`, `errors`, `warnings`, and `mode`

### Requirement: Exit code

#### Scenario: Exit 0 on valid schema

- **WHEN** validation succeeds
- **THEN** exit code is 0

#### Scenario: Exit 1 on invalid schema

- **WHEN** validation fails
- **THEN** exit code is 1

### Requirement: Error — file not found

#### Scenario: --file with nonexistent path

- **WHEN** the user runs `specd schema validate --file ./nonexistent.yaml`
- **THEN** the error mentions the file
- **AND** exit code is 1

### Requirement: Error — config required in project modes

#### Scenario: No specd.yaml discoverable

- **GIVEN** CWD is not under any directory containing `specd.yaml`
- **WHEN** the user runs `specd schema validate` without `--file` and without `--config`
- **THEN** the command fails with the standard config-not-found error
- **AND** exit code is 1

### Requirement: Mutually exclusive flags

#### Scenario: --file and --raw together

- **WHEN** the user runs `specd schema validate --file ./schema.yaml --raw`
- **THEN** stderr contains `--file and --raw are mutually exclusive`
- **AND** exit code is 1
