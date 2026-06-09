# Verification: Archive List

## Requirements

### Requirement: Command signature

#### Scenario: No positional arguments

- **WHEN** `specd archive list` is run
- **THEN** the command proceeds without positional arguments
- **AND** output format defaults to text

#### Scenario: Pagination flags are accepted

- **WHEN** `specd archive list --limit 10 --page 2` is run
- **THEN** the command parses the flags and delegates them to the use case

### Requirement: Output format — toon

#### Scenario: TOON format output

- **GIVEN** the archive directory contains changes
- **WHEN** `specd archive list --format toon` is run
- **THEN** output is encoded in Token-Oriented Object Notation (toon)

### Requirement: Output format — text

#### Scenario: Normal text output

- **GIVEN** the archive contains 5 changes
- **WHEN** `specd archive list` is run
- **THEN** stdout contains a table with `NAME` and `DATE` columns
- **AND** the `WORKSPACE` column is NOT present
- **AND** the summary line `Showing 5 archived changes of 5.` is printed at the end

### Requirement: Output format — JSON

#### Scenario: JSON format output with metadata

- **GIVEN** the archive contains 125 changes and `limit` is 100
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is a JSON object with `items` array and `meta` object
- **AND** `meta.total` is 125
- **AND** `meta.count` is 100
- **AND** `meta.limit` is 100
- **AND** `meta.page` is 1

### Requirement: Empty archive

#### Scenario: No archived changes — text

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list` is run
- **THEN** stdout contains `no archived changes`
- **AND** the process exits with code 0

#### Scenario: No archived changes — JSON

- **GIVEN** the archive directory is empty
- **WHEN** `specd archive list --format json` is run
- **THEN** stdout is `[]`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: I/O error reading archive directory

- **GIVEN** the archive directory cannot be read due to a permissions error
- **WHEN** `specd archive list` is run
- **THEN** the command exits with code 3
- **AND** stderr contains an `error:` message
