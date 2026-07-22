# Verification: Discarded List

## Requirements

### Requirement: Command signature

#### Scenario: No positional arguments

- **WHEN** `specd discarded list` is run
- **THEN** the command proceeds without positional arguments
- **AND** output format defaults to text

#### Scenario: Default limit is 100

- **GIVEN** more than 100 discarded changes exist
- **WHEN** `specd discarded list --format json` is run without `--limit`
- **THEN** `meta.limit` is 100

#### Scenario: --limit all omits limit from ListDiscarded

- **WHEN** `specd discarded list --limit all --format json` is run
- **THEN** `ListDiscarded.execute` is called without a `limit` option

#### Scenario: --page with omitted limit uses host default 100

- **WHEN** `specd discarded list --page 2 --format json` is run without `--limit`
- **THEN** `ListDiscarded.execute` is called with `limit` 100 and `page` 2

#### Scenario: --page with --limit all is rejected

- **WHEN** `specd discarded list --page 2 --limit all` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListDiscarded.execute` is not invoked

#### Scenario: --page and keyset cursors are mutually exclusive

- **WHEN** `specd discarded list --page 2 --after-key 2024-01-01T00:00:00.000Z` is run
- **THEN** a typed validation error is thrown (e.g. `CliValidationError`)
- **AND** the machine-readable code is `CLI_VALIDATION_ERROR`
- **AND** `ListDiscarded.execute` is not invoked

### Requirement: Uses ListDiscarded read model

#### Scenario: Invokes ListDiscarded

- **WHEN** `specd discarded list --limit 10` runs
- **THEN** `ListDiscarded.execute` is called with list options derived from CLI flags

#### Scenario: Does not invoke GetStatus per row

- **GIVEN** two discarded changes exist
- **WHEN** `specd discarded list` runs
- **THEN** `GetStatus` is not invoked for each listed name

### Requirement: List options forwarding

#### Scenario: Include flags forwarded only when set

- **WHEN** `specd discarded list --description --reason --superseded-by --format json` is run
- **THEN** `ListDiscarded.execute` is called with `includeDescription: true`, `includeReason: true`, and `includeSupersededBy: true`

#### Scenario: CLI does not re-sort after the use case returns

- **GIVEN** `ListDiscarded.execute` returns items in repository canonical order
- **WHEN** `specd discarded list --format json` is run
- **THEN** stdout `items` appear in the same order as returned by the use case

### Requirement: Output format — toon

#### Scenario: TOON format output

- **GIVEN** `discarded/` contains changes
- **WHEN** `specd discarded list --format toon` is run
- **THEN** output is encoded in Token-Oriented Object Notation (toon)

### Requirement: Output format — text

#### Scenario: Discarded changes listed with correct fields

- **GIVEN** `discarded/` contains two changes: `old-experiment` (discarded `2024-01-10`, actor `alice`, reason `"no longer needed"`, no supersededBy) and `bad-idea` (discarded `2024-01-08`, actor `bob`, reason `"duplicate effort"`, supersededBy `['new-approach']`)
- **WHEN** `specd discarded list --reason --superseded-by` is run
- **THEN** stdout contains one row for each change showing name, date, actor, and reason
- **AND** the row for `bad-idea` includes `→ new-approach`
- **AND** the row for `old-experiment` does not include a `→` segment
- **AND** the process exits with code 0

#### Scenario: Reason and superseded-by hidden without include flags

- **GIVEN** a discarded change with reason `"duplicate effort"` and supersededBy `['new-approach']`
- **WHEN** `specd discarded list` is run without `--reason` or `--superseded-by`
- **THEN** stdout does not include the reason text or `→ new-approach`

#### Scenario: Truncation hint when results are partial

- **GIVEN** 125 discarded changes and default pagination
- **WHEN** `specd discarded list` is run
- **THEN** stdout contains `showing 100 of 125 (use --limit/--page)`

#### Scenario: CLI preserves use-case row order

- **GIVEN** `ListDiscarded.execute` returns entries ordered by `discardedAt` descending
- **WHEN** `specd discarded list` is run
- **THEN** stdout rows appear in the same order as the returned `items`

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `discarded/` contains one change named `old-experiment` discarded at `2024-01-10T09:00:00.000Z`, actor `alice`, reason `"no longer needed"`, no supersededBy
- **WHEN** `specd discarded list --format json` is run
- **THEN** stdout is valid JSON with `items` and `meta`
- **AND** the object for `old-experiment` contains `name`, `discardedAt`, and `discardedBy`
- **AND** the object does not contain `reason`, `description`, or `supersededBy`
- **AND** the process exits with code 0

#### Scenario: JSON format output — supersededBy present

- **GIVEN** `discarded/` contains one change named `bad-idea` with `supersededBy` set to `['new-approach']`
- **WHEN** `specd discarded list --format json --superseded-by` is run
- **THEN** the JSON object for `bad-idea` contains a `supersededBy` array with `"new-approach"`
- **AND** the process exits with code 0

### Requirement: Empty discarded list

#### Scenario: No discarded changes — text

- **GIVEN** `discarded/` is empty
- **WHEN** `specd discarded list` is run
- **THEN** stdout contains `no discarded changes`
- **AND** the process exits with code 0

#### Scenario: No discarded changes — JSON

- **GIVEN** `discarded/` is empty
- **WHEN** `specd discarded list --format json` is run
- **THEN** stdout is `{"items":[],"meta":{"total":0,"count":0,"limit":100}}`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading discarded directory

- **GIVEN** the `discarded/` directory cannot be read due to a permissions error
- **WHEN** `specd discarded list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
