# Verification: Change Archive

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change archive` is run without a name
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Skip hooks accepts archive phases

- **WHEN** `specd change archive my-change --skip-hooks pre,post` is run
- **THEN** the command accepts the invocation
- **AND** it forwards both archive hook phases to the use case

### Requirement: Prerequisites

#### Scenario: Change not in archivable state

- **GIVEN** a change `my-change` in `done` state (not yet `archivable`)
- **WHEN** `specd change archive my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message mentioning the current state

### Requirement: Behaviour

#### Scenario: Successful archive

- **GIVEN** a change `my-change` in `archivable` state
- **WHEN** `specd change archive my-change` is run
- **THEN** spec deltas are merged into the permanent spec directories
- **AND** the change directory is moved to the archive path
- **AND** the process exits with code 0

### Requirement: Hook execution

#### Scenario: Skip all archive hooks

- **WHEN** `specd change archive my-change --skip-hooks all` is run
- **THEN** the command skips all archive hook execution
- **AND** the archive still delegates the rest of the work to `ArchiveChange`

#### Scenario: Skip only pre-archive hooks

- **WHEN** `specd change archive my-change --skip-hooks pre` is run
- **THEN** pre-archive hooks are skipped
- **AND** post-archive hooks remain enabled

#### Scenario: Skip only post-archive hooks

- **WHEN** `specd change archive my-change --skip-hooks post` is run
- **THEN** post-archive hooks are skipped
- **AND** pre-archive hooks remain enabled

### Requirement: Post-archive hooks

#### Scenario: Post-hook failure

- **GIVEN** a `run:` post-hook that exits with code 1 is declared on the archivable step
- **WHEN** `specd change archive my-change` is run after successful merge
- **THEN** the process exits with code 2

### Requirement: Output on success

#### Scenario: Archive path in output

- **WHEN** `specd change archive my-change` succeeds
- **THEN** stdout contains `archived change my-change →` followed by the archive path
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change archive nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output on success (extended)

#### Scenario: Text output shows invalidated changes when overlap occurred

- **GIVEN** `ArchiveChange` returns `invalidatedChanges` with two entries
- **WHEN** `specd change archive <name> --allow-overlap` succeeds in text mode
- **THEN** stdout includes the archive path line
- **AND** stdout includes an "invalidated N overlapping changes:" section listing each change and its overlapping specs

#### Scenario: Text output omits invalidated section when no changes were invalidated

- **GIVEN** `ArchiveChange` returns an empty `invalidatedChanges` array
- **WHEN** `specd change archive <name>` succeeds in text mode
- **THEN** stdout includes only the archive path line
- **AND** no invalidated changes section is shown

#### Scenario: JSON output includes invalidatedChanges array

- **GIVEN** `ArchiveChange` returns `invalidatedChanges` with one entry
- **WHEN** `specd change archive <name> --allow-overlap --format json` succeeds
- **THEN** the JSON output includes `invalidatedChanges` with the entry's `name` and `specIds`

### Requirement: Output on success

#### Scenario: JSON output on success

- **WHEN** `specd change archive my-change --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `name` equal to `"my-change"`, and `archivePath` containing the archive path
- **AND** the process exits with code 0
