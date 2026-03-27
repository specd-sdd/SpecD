# Verification: Schema Extend

## Requirements

### Requirement: Extend behaviour

#### Scenario: Extend from npm package

- **GIVEN** `@specd/schema-std` is installed with `kind: schema`
- **WHEN** `specd schema extend @specd/schema-std my-custom` is run
- **THEN** a new directory `<default-schemasPath>/my-custom/` is created
- **AND** `schema.yaml` contains `kind: schema`, `name: my-custom`, `extends: '@specd/schema-std'`, and `artifacts: []`
- **AND** no templates are copied

#### Scenario: Extend from npm package in pnpm monorepo

- **GIVEN** `@specd/schema-std` is installed via pnpm and only exists in `packages/cli/node_modules/`
- **WHEN** `specd schema extend @specd/schema-std my-custom` is run
- **THEN** the schema is resolved successfully via the kernel's registry

#### Scenario: Extend with --output

- **WHEN** `specd schema extend @specd/schema-std my-ext --output /tmp/my-ext` is run
- **THEN** the schema is created at `/tmp/my-ext/`
- **AND** the directory is created if it does not exist
- **AND** `schema.yaml` contains `name: my-ext`

#### Scenario: Extend with --output to non-existent nested path

- **GIVEN** `/tmp/deep/nested/path` does not exist
- **WHEN** `specd schema extend @specd/schema-std my-ext --output /tmp/deep/nested/path` is run
- **THEN** the full directory tree is created recursively
- **AND** the schema.yaml is written into it

#### Scenario: Target directory already exists

- **GIVEN** the target directory already exists
- **WHEN** `specd schema extend @specd/schema-std my-ext` is run
- **THEN** the command exits with code 1 and does not overwrite

### Requirement: Error cases

#### Scenario: Source schema not found

- **WHEN** `specd schema extend @specd/nonexistent my-ext` is run
- **THEN** the command exits with code 3

#### Scenario: Source is a plugin

- **GIVEN** `my-plugin` has `kind: schema-plugin`
- **WHEN** `specd schema extend '#my-plugin' my-ext` is run
- **THEN** the command exits with code 1 with a message explaining only schemas can be extended

#### Scenario: Target workspace has no schemas section

- **GIVEN** workspace `billing` has no `schemas` section configured
- **WHEN** `specd schema extend @specd/schema-std my-ext --workspace billing` is run
- **THEN** the command exits with code 1

#### Scenario: Both --workspace and --output provided

- **WHEN** `specd schema extend @specd/schema-std my-ext --workspace billing --output /tmp/out` is run
- **THEN** the command exits with code 1 with a message explaining mutual exclusion
