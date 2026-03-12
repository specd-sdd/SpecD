# Verification: Schema Fork

## Requirements

### Requirement: Fork behaviour

#### Scenario: Fork from npm package

- **GIVEN** `@specd/schema-std` is installed and the default workspace has `schemas.fs.path: specd/schemas`
- **WHEN** `specd schema fork @specd/schema-std` is run
- **THEN** the schema directory is copied to `specd/schemas/schema-std/`
- **AND** the copied `schema.yaml` has `kind: schema` and no `extends` field
- **AND** templates are copied alongside `schema.yaml`

#### Scenario: Fork with custom name

- **WHEN** `specd schema fork @specd/schema-std --name my-schema` is run
- **THEN** the schema is copied to `specd/schemas/my-schema/`

#### Scenario: Target directory already exists

- **GIVEN** `specd/schemas/schema-std/` already exists
- **WHEN** `specd schema fork @specd/schema-std` is run
- **THEN** the command exits with code 1 and does not overwrite

### Requirement: Error cases

#### Scenario: Source schema not found

- **WHEN** `specd schema fork @specd/nonexistent` is run
- **THEN** the command exits with code 3

#### Scenario: Target workspace has no schemas section

- **WHEN** `specd schema fork @specd/schema-std --workspace billing` is run and `billing` has no `schemas` section
- **THEN** the command exits with code 1
