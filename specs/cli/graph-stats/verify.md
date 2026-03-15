# Verification: Graph Stats

## Requirements

### Requirement: Statistics retrieval

#### Scenario: Successful statistics display

- **GIVEN** the workspace has been indexed with 459 files, 1497 symbols, and 122 specs
- **WHEN** `specd graph stats` is run
- **THEN** stdout shows `Files:     459`, `Symbols:   1497`, and `Specs:     122`
- **AND** the process exits with code 0

#### Scenario: Custom path

- **GIVEN** `/tmp/my-project` has been indexed
- **WHEN** `specd graph stats --path /tmp/my-project` is run
- **THEN** the statistics reflect the graph at `/tmp/my-project`

#### Scenario: Process exits explicitly

- **GIVEN** statistics retrieval completes successfully
- **WHEN** the provider is closed
- **THEN** `process.exit(0)` is called to prevent the LadybugDB addon from keeping the process alive

### Requirement: Output format

#### Scenario: Text output shows languages

- **GIVEN** the graph contains files in `javascript` and `typescript`
- **WHEN** `specd graph stats` is run
- **THEN** stdout contains `Languages: javascript, typescript`

#### Scenario: Text output omits zero relation counts

- **GIVEN** the graph has `IMPORTS: 1227`, `DEFINES: 1497`, and `CALLS: 0`
- **WHEN** `specd graph stats` is run
- **THEN** stdout shows `IMPORTS: 1227` and `DEFINES: 1497` under `Relations:`
- **AND** `CALLS` is not shown

#### Scenario: Text output shows last indexed timestamp

- **GIVEN** the graph was last indexed at `2026-03-14T10:38:30.178Z`
- **WHEN** `specd graph stats` is run
- **THEN** stdout contains `Last indexed: 2026-03-14T10:38:30.178Z`

#### Scenario: JSON output

- **GIVEN** the graph has been indexed
- **WHEN** `specd graph stats --format json` is run
- **THEN** stdout is valid JSON containing `fileCount`, `symbolCount`, `specCount`, `languages`, `relationCounts`, and `lastIndexedAt`

### Requirement: Error cases

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened (e.g. database file is corrupted)
- **WHEN** `specd graph stats` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3
