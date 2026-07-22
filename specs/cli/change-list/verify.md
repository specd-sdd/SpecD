# Verification: Change List

## Requirements

### Requirement: Command signature

#### Scenario: Canonical plural command

- **WHEN** `specd changes list` is run
- **THEN** the command executes successfully using the canonical group

#### Scenario: Singular alias command

- **WHEN** `specd change list` is run
- **THEN** it behaves as an alias of `specd changes list`

#### Scenario: Default limit is 100

- **GIVEN** more than 100 active changes exist
- **WHEN** `specd change list --format json` is run without `--limit`
- **THEN** `meta.limit` is 100
- **AND** `items` contains at most 100 entries

#### Scenario: --page and keyset cursors are mutually exclusive

- **WHEN** `specd change list --page 2 --after-key 2024-01-01T00:00:00.000Z` is run
- **THEN** the command exits with a CLI usage error before invoking the use case

#### Scenario: --after-id requires --after-key

- **WHEN** `specd change list --after-id add-login` is run without `--after-key`
- **THEN** the command exits with a CLI usage error before invoking the use case

### Requirement: List options forwarding

#### Scenario: Pagination flags forwarded to ListChanges

- **WHEN** `specd change list --limit 25 --page 2 --format json` is run
- **THEN** `ListChanges.execute` is called with `limit` 25 and `page` 2

#### Scenario: Keyset cursor forwarded with tiebreak id

- **WHEN** `specd change list --after-key 2024-01-01T00:00:00.000Z --after-id add-login --format json` is run
- **THEN** `ListChanges.execute` is called with `after.key` equal to the ISO timestamp and `after.id` equal to `add-login`

#### Scenario: --description sets includeDescription only when present

- **WHEN** `specd change list --description --format json` is run
- **THEN** `ListChanges.execute` is called with `includeDescription: true`

#### Scenario: CLI does not re-sort results

- **GIVEN** `ListChanges.execute` returns items in repository canonical order
- **WHEN** `specd change list --format json` is run
- **THEN** stdout `items` appear in the same order as returned by the use case

### Requirement: Output format

#### Scenario: Only active changes shown

- **GIVEN** the project has one active change in `changes/` and one drafted change in `drafts/`
- **WHEN** `specd change list` is run
- **THEN** stdout shows only the active change
- **AND** the drafted change is not shown

#### Scenario: Discarded changes not shown

- **GIVEN** the project has one discarded change in `discarded/` and no active changes
- **WHEN** `specd change list` is run
- **THEN** stdout does not show the discarded change
- **AND** stdout contains `no changes`

#### Scenario: Rows contain name, state, specIds, and schema

- **GIVEN** a change named `add-login` in state `designing` with specIds `['auth/login']` and schema `std` version `1`
- **WHEN** `specd change list` is run without `--description`
- **THEN** the row for `add-login` shows `add-login`, `designing`, `auth/login`, and `std@1`
- **AND** no description sub-row is printed

#### Scenario: --description includes description sub-row

- **GIVEN** an active change with description `Add OAuth2 login`
- **WHEN** `specd change list --description` is run
- **THEN** a dim indented description line `Add OAuth2 login` is printed below the main row

#### Scenario: Truncation hint when results are partial

- **GIVEN** 125 active changes and default pagination
- **WHEN** `specd change list` is run
- **THEN** stdout contains `showing 100 of 125 (use --limit/--page)`

#### Scenario: JSON format output

- **GIVEN** one active change `add-login` in state `designing` with specId `auth/login`, schema `std` version `1`, and `createdAt` recorded
- **WHEN** `specd change list --format json` is run
- **THEN** stdout is valid JSON with `items` array and `meta` object
- **AND** `items[0]` contains `name`, `state`, `specIds`, `schemaName`, `schemaVersion`, and `createdAt`
- **AND** `items[0]` does not contain a `description` field
- **AND** `meta` contains `total`, `count`, `limit`, and `page`
- **AND** the process exits with code 0

### Requirement: Empty output

#### Scenario: No active changes — text mode

- **WHEN** `specd change list` is run with no active changes in `changes/`
- **THEN** stdout contains `no changes`
- **AND** the process exits with code 0

#### Scenario: No active changes — JSON mode

- **WHEN** `specd change list --format json` is run with no active changes
- **THEN** stdout is `{"items":[],"meta":{"total":0,"count":0,"limit":100}}`
- **AND** the process exits with code 0
