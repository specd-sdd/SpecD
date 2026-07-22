# Verification: Archive List

## Requirements

### Requirement: Command signature

#### Scenario: No positional arguments

- **WHEN** `specd archive list` is run
- **THEN** the command proceeds without positional arguments
- **AND** output format defaults to text

#### Scenario: Pagination flags are accepted

- **WHEN** `specd archive list --limit 10 --after-key 2024-01-01T00:00:00.000Z --after-id archived-change` is run
- **THEN** `ListArchived.execute` is called with `limit` 10 and keyset cursor `{ key, id }`

#### Scenario: Default limit is 100

- **GIVEN** the archive contains more than 100 changes
- **WHEN** `specd archive list --format json` is run without `--limit`
- **THEN** `meta.limit` is 100

#### Scenario: --limit all omits limit from ListArchived

- **WHEN** `specd archive list --limit all --format json` is run
- **THEN** `ListArchived.execute` is called without a `limit` option

#### Scenario: --page with omitted limit uses host default 100

- **WHEN** `specd archive list --page 2 --format json` is run without `--limit`
- **THEN** `ListArchived.execute` is called with `limit` 100 and `page` 2

#### Scenario: --page with --limit all is rejected

- **WHEN** `specd archive list --page 2 --limit all` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListArchived.execute` is not invoked

#### Scenario: --page and keyset cursors are mutually exclusive

- **WHEN** `specd archive list --page 2 --after-key 2024-01-01T00:00:00.000Z` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListArchived.execute` is not invoked

#### Scenario: --after-id requires --after-key

- **WHEN** `specd archive list --after-id archived-change` is run without `--after-key`
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListArchived.execute` is not invoked

### Requirement: List options forwarding

#### Scenario: --archived-by sets includeArchivedBy

- **WHEN** `specd archive list --archived-by --format json` is run
- **THEN** `ListArchived.execute` is called with `includeArchivedBy: true`

#### Scenario: archivedBy omitted without include flag

- **GIVEN** an archived entry includes `archivedBy`
- **WHEN** `specd archive list --format json` is run without `--archived-by`
- **THEN** stdout `items[0]` does not contain `archivedBy`

#### Scenario: CLI does not re-sort or paginate after the use case returns

- **GIVEN** `ListArchived.execute` returns items in repository canonical order
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout `items` appear in the same order as returned by the use case

### Requirement: Output format — toon

#### Scenario: TOON format output

- **GIVEN** the archive directory contains changes
- **WHEN** `specd archive list --format toon` is run
- **THEN** output is encoded in Token-Oriented Object Notation (toon)

### Requirement: Output format — text

#### Scenario: Normal text output

- **GIVEN** the archive contains 125 changes and default pagination
- **WHEN** `specd archive list` is run
- **THEN** stdout contains a table with `NAME` and `DATE` columns
- **AND** stdout contains `showing 100 of 125 (use --limit/--page)`

#### Scenario: BY column appears only with --archived-by

- **GIVEN** an archived change with `archivedBy` recorded
- **WHEN** `specd archive list --archived-by` is run
- **THEN** stdout includes a `BY` column header
- **AND** the actor appears in the row

#### Scenario: CLI preserves use-case row order

- **GIVEN** `ListArchived.execute` returns entries ordered by `archivedAt` descending
- **WHEN** `specd archive list` is run
- **THEN** stdout rows appear in the same order as the returned `items`

### Requirement: Output format — JSON

#### Scenario: JSON format output with metadata

- **GIVEN** the archive contains 125 changes and `limit` is 100
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is a JSON object with `items` array and `meta` object
- **AND** `meta.total` is 125
- **AND** `meta.count` is 100
- **AND** `meta.limit` is 100
- **AND** `meta.page` is 1
- **AND** list entries do not include an `artifacts` field

### Requirement: Empty archive

#### Scenario: No archived changes — text

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list` is run
- **THEN** stdout contains `no archived changes`
- **AND** the process exits with code 0

#### Scenario: No archived changes — JSON

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is `{"items":[],"meta":{"total":0,"count":0,"limit":100}}`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading archive directory

- **GIVEN** the archive directory cannot be read due to a permissions error
- **WHEN** `specd archive list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
