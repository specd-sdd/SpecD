# Verification: Schema Fork

## Requirements

### Requirement: Fork behaviour

#### Scenario: Fork from npm package

- **GIVEN** `@specd/schema-std` is installed and the default workspace has a `schemasPath`
- **WHEN** `specd schema fork @specd/schema-std my-schema` is run
- **THEN** the schema directory is copied to `<default-schemasPath>/my-schema/`
- **AND** the copied `schema.yaml` has `kind: schema`, `name: my-schema`, and no `extends` field
- **AND** templates are copied alongside `schema.yaml`

#### Scenario: Fork from npm package in pnpm monorepo

- **GIVEN** `@specd/schema-std` is installed via pnpm and only exists in `packages/cli/node_modules/` as a symlink
- **WHEN** `specd schema fork @specd/schema-std my-fork` is run
- **THEN** the schema is resolved successfully via the kernel's registry
- **AND** symlinks are dereferenced during copy
- **AND** the schema directory is copied to the target

#### Scenario: Fork with --output

- **WHEN** `specd schema fork @specd/schema-std my-fork --output /tmp/my-schema` is run
- **THEN** the schema directory is copied to `/tmp/my-schema/`
- **AND** the directory is created if it does not exist
- **AND** `schema.yaml` contains `name: my-fork`

#### Scenario: Fork with --output to non-existent nested path

- **GIVEN** `/tmp/deep/nested/path` does not exist
- **WHEN** `specd schema fork @specd/schema-std my-fork --output /tmp/deep/nested/path` is run
- **THEN** the full parent directory tree is created recursively
- **AND** the schema is copied into it

#### Scenario: Target directory already exists

- **GIVEN** the target directory already exists
- **WHEN** `specd schema fork @specd/schema-std my-fork` is run
- **THEN** the command exits with code 1 and does not overwrite

### Requirement: Error cases

#### Scenario: Source schema not found

- **WHEN** `specd schema fork @specd/nonexistent my-fork` is run
- **THEN** the command exits with code 3

#### Scenario: Target workspace has no schemas section

- **GIVEN** workspace `billing` has no `schemas` section configured
- **WHEN** `specd schema fork @specd/schema-std my-fork --workspace billing` is run
- **THEN** the command exits with code 1

#### Scenario: Both --workspace and --output provided

- **WHEN** `specd schema fork @specd/schema-std my-fork --workspace billing --output /tmp/out` is run
- **THEN** the command exits with code 1 with a message explaining mutual exclusion
