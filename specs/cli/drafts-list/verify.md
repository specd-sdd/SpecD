# Verification: Drafts List

## Requirements

### Requirement: Command signature

#### Scenario: No positional arguments

- **WHEN** `specd drafts list` is run
- **THEN** the command proceeds without positional arguments
- **AND** output format defaults to text

#### Scenario: Default limit is 100

- **GIVEN** more than 100 drafted changes exist
- **WHEN** `specd drafts list --format json` is run without `--limit`
- **THEN** `meta.limit` is 100

#### Scenario: --page and keyset cursors are mutually exclusive

- **WHEN** `specd drafts list --page 2 --after-key 2024-01-01T00:00:00.000Z` is run
- **THEN** the command exits with a CLI usage error before invoking the use case

### Requirement: Uses ListDrafts read model

#### Scenario: Invokes ListDrafts

- **WHEN** `specd drafts list --limit 10` runs
- **THEN** `ListDrafts.execute` is called with list options derived from CLI flags

#### Scenario: Does not invoke GetStatus per row

- **GIVEN** two drafted changes exist
- **WHEN** `specd drafts list` runs
- **THEN** `GetStatus` is not invoked for each listed name

#### Scenario: JSON output serializes view fields

- **GIVEN** `ListDrafts` returns a paginated result with one drafted entry
- **WHEN** `specd drafts list --format json` is run without include flags
- **THEN** stdout is valid JSON with `items` and `meta`
- **AND** `items[0]` includes `name`, `state`, `createdAt`, `specIds`, `schemaName`, `schemaVersion`, and `draftedAt`
- **AND** `items[0]` does not include `reason`, `description`, or `draftedBy`

### Requirement: List options forwarding

#### Scenario: Include flags forwarded only when set

- **WHEN** `specd drafts list --description --reason --format json` is run
- **THEN** `ListDrafts.execute` is called with `includeDescription: true` and `includeReason: true`

#### Scenario: CLI does not paginate after the use case returns

- **GIVEN** `ListDrafts.execute` returns 10 items with `meta.count` 10 and `meta.total` 50
- **WHEN** `specd drafts list --format json` is run
- **THEN** stdout `items` length is 10
- **AND** stdout `meta.total` is 50

### Requirement: Output format — toon

#### Scenario: TOON format output

- **GIVEN** `drafts/` contains changes
- **WHEN** `specd drafts list --format toon` is run
- **THEN** output is encoded in Token-Oriented Object Notation (toon)

### Requirement: Output format — text

#### Scenario: Drafts listed with correct fields

- **GIVEN** `drafts/` contains two changes: `old-experiment` (state `drafting`, drafted `2024-01-05`, actor `alice`, reason `"parked for later"`) and `shelved-work` (state `designing`, drafted `2024-01-03`, actor `bob`, no reason)
- **WHEN** `specd drafts list --reason --description` is run
- **THEN** stdout contains one row for each change showing name, state, date, actor, and reason
- **AND** the row for `old-experiment` includes `"parked for later"`
- **AND** the process exits with code 0

#### Scenario: Singular alias invocation

- **WHEN** `specd draft list` is run
- **THEN** it behaves as `specd drafts list`
- **AND** the process exits with the same code as the canonical invocation

#### Scenario: REASON column appears only with --reason

- **GIVEN** a drafted change with reason `"parked for later"`
- **WHEN** `specd drafts list` is run without `--reason`
- **THEN** stdout does not include a `REASON` column header
- **AND** the reason text is not shown in the table row

#### Scenario: Truncation hint when results are partial

- **GIVEN** 125 drafted changes and default pagination
- **WHEN** `specd drafts list` is run
- **THEN** stdout contains `showing 100 of 125 (use --limit/--page)`

#### Scenario: CLI preserves use-case row order

- **GIVEN** `ListDrafts.execute` returns entries ordered by `draftedAt` descending
- **WHEN** `specd drafts list` is run
- **THEN** stdout rows appear in the same order as the returned `items`

### Requirement: Output format — JSON

#### Scenario: JSON format output

- **GIVEN** `drafts/` contains one change named `old-experiment` in state `drafting`, drafted at `2024-01-05T10:00:00.000Z`, actor `alice`, reason `"parked for later"`
- **WHEN** `specd drafts list --format json --reason --description` is run
- **THEN** stdout is valid JSON with `items` and `meta`
- **AND** `items[0]` contains `name`, `state`, `draftedAt`, `draftedBy`, and `reason`
- **AND** the process exits with code 0

#### Scenario: JSON format output — no reason or actor

- **GIVEN** `drafts/` contains one change named `shelved-work` with reason and `draftedBy` available on the entry
- **WHEN** `specd drafts list --format json` is run without `--reason` or `--description`
- **THEN** the JSON object for `shelved-work` does not contain `reason`, `description`, or `draftedBy`
- **AND** the process exits with code 0

### Requirement: Empty drafts

#### Scenario: No drafted changes — text

- **GIVEN** `drafts/` is empty
- **WHEN** `specd drafts list` is run
- **THEN** stdout contains `no drafts`
- **AND** the process exits with code 0

#### Scenario: No drafted changes — JSON

- **GIVEN** `drafts/` is empty
- **WHEN** `specd drafts list --format json` is run
- **THEN** stdout is `{"items":[],"meta":{"total":0,"count":0,"limit":100}}`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading drafts directory

- **GIVEN** the `drafts/` directory cannot be read due to a permissions error
- **WHEN** `specd drafts list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
