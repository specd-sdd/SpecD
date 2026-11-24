# Verification: project optimized-context command

## Requirements

### Requirement: Command signature

#### Scenario: optimized-context group is registered

- **WHEN** the CLI `project` parent command's subcommands are inspected
- **THEN** an `optimized-context` command group is registered with `get`, `set`, and `clear` subcommands

#### Scenario: update-metadata is not registered alongside the new group

- **WHEN** the CLI `project` parent command's subcommands are inspected
- **THEN** no `update-metadata` command, or any alias of it, is registered

### Requirement: Get subcommand

#### Scenario: Prints persisted optimized context

- **GIVEN** a project with a persisted `project-metadata.json` containing optimized context
- **WHEN** `specd project optimized-context get` is run
- **THEN** it prints the optimized context string from Core

#### Scenario: Reports absence without hard failure

- **GIVEN** a project with no `project-metadata.json`
- **WHEN** `specd project optimized-context get` is run
- **THEN** it reports that no optimized context is persisted
- **AND** it does not exit as a hard Kernel failure for a missing cache

### Requirement: Set subcommand

#### Scenario: Sets from --text

- **WHEN** `specd project optimized-context set --text "optimized markdown"` is run
- **THEN** it calls `UpdateProjectMetadata` once with `optimizedContext` equal to that string
- **AND** it reports the persisted path

#### Scenario: Sets from --input file

- **GIVEN** a file whose contents are the raw optimized context string
- **WHEN** `specd project optimized-context set --input that-file` is run
- **THEN** it passes the file contents as `optimizedContext` to Core

#### Scenario: Sets from stdin via --input -

- **WHEN** `specd project optimized-context set --input -` is run with stdin providing the optimized context string
- **THEN** it passes the stdin contents as `optimizedContext` to Core

#### Scenario: Rejects combined --text and --input

- **WHEN** `specd project optimized-context set --text "a" --input file.txt` is run
- **THEN** it fails at the CLI boundary before any Kernel call

#### Scenario: Rejects missing input form

- **WHEN** `specd project optimized-context set` is run with neither `--text` nor `--input`
- **THEN** it fails at the CLI boundary before any Kernel call

#### Scenario: Rejects implicit stdin without --input -

- **WHEN** `specd project optimized-context set` is run with piped stdin but without `--input -` or `--text`
- **THEN** it fails at the CLI boundary before any Kernel call

### Requirement: Clear subcommand

#### Scenario: Clears existing cache

- **GIVEN** a project with a persisted `project-metadata.json`
- **WHEN** `specd project optimized-context clear` is run
- **THEN** it calls the Core clear use case once
- **AND** it reports that the cache was cleared

#### Scenario: Clear is idempotent when absent

- **GIVEN** a project with no `project-metadata.json`
- **WHEN** `specd project optimized-context clear` is run
- **THEN** it succeeds
- **AND** it reports that the cache was already absent

### Requirement: No CLI-owned hashing or persistence

#### Scenario: Set does not write the cache file directly

- **WHEN** `specd project optimized-context set --text "x"` succeeds
- **THEN** persistence is performed only through the Kernel update-metadata use case
- **AND** the CLI handler does not compute freshness hashes itself
