# Verification: Change Discard

## Requirements

### Requirement: Command signature

#### Scenario: Missing reason flag

- **WHEN** `specd change discard my-change` is run without `--reason`
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Empty reason rejected

- **WHEN** `specd change discard my-change --reason ""` is run
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Force flag is accepted

- **WHEN** `specd change discard my-change --reason "cleanup" --force` is run with a valid change name
- **THEN** the command accepts the flag as part of its input contract

### Requirement: Behaviour

#### Scenario: Active change discarded

- **GIVEN** an active change `old-experiment` in `changes/`
- **WHEN** `specd change discard old-experiment --reason "superseded"` is run
- **THEN** the change is moved to `discarded/`
- **AND** a `discarded` event with the given reason is appended to history

#### Scenario: Drafted change discarded

- **GIVEN** a drafted change `old-experiment` in `drafts/`
- **WHEN** `specd change discard old-experiment --reason "abandoned"` is run
- **THEN** the change is moved to `discarded/`
- **AND** a `discarded` event is appended to history

#### Scenario: Historically implemented change can still be discarded when forced

- **GIVEN** `old-experiment` has previously reached `implementing`
- **WHEN** `specd change discard old-experiment --reason "workflow cleanup" --force` is run
- **THEN** the change is moved to `discarded/`
- **AND** a `discarded` event is appended to history

### Requirement: Output on success

#### Scenario: Success message

- **WHEN** `specd change discard old-experiment --reason "done"` succeeds
- **THEN** stdout contains `discarded change old-experiment`
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change discard nonexistent --reason "done"` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Historically implemented change requires force

- **GIVEN** `old-experiment` has previously reached `implementing`
- **WHEN** `specd change discard old-experiment --reason "done"` is run without `--force`
- **THEN** the command exits with code 1
- **AND** stderr explains that implementation may already exist and discarding the change could leave specs and code out of sync

### Requirement: Output on success

#### Scenario: JSON output on success

- **WHEN** `specd change discard old-experiment --reason "done" --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"` and `name` equal to `"old-experiment"`
- **AND** the process exits with code 0
