# Verification: Schema Extend

## Requirements

### Requirement: Extend behaviour

#### Scenario: Extend from npm package

- **GIVEN** `@specd/schema-std` is installed with `kind: schema`
- **WHEN** `specd schema extend @specd/schema-std` is run
- **THEN** a new directory `specd/schemas/schema-std-custom/` is created
- **AND** `schema.yaml` contains `kind: schema`, `extends: '@specd/schema-std'`, and `artifacts: []`

#### Scenario: Extend with custom name

- **WHEN** `specd schema extend @specd/schema-std --name my-workflow` is run
- **THEN** the schema is created at `specd/schemas/my-workflow/`

#### Scenario: Target directory already exists

- **GIVEN** `specd/schemas/schema-std-custom/` already exists
- **WHEN** `specd schema extend @specd/schema-std` is run
- **THEN** the command exits with code 1 and does not overwrite

### Requirement: Error cases

#### Scenario: Source schema not found

- **WHEN** `specd schema extend @specd/nonexistent` is run
- **THEN** the command exits with code 3

#### Scenario: Source is a plugin

- **GIVEN** `my-plugin` has `kind: schema-plugin`
- **WHEN** `specd schema extend '#my-plugin'` is run
- **THEN** the command exits with code 1 with a message explaining only schemas can be extended
