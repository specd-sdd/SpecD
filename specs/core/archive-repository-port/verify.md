# Verification: ArchiveRepository Port

## Requirements

### Requirement: archive moves a change to the archive

#### Scenario: Successful archive of an archivable change

- **GIVEN** a change in `archivable` state
- **WHEN** `archive(change)` is called
- **THEN** the change directory is moved to the archive location
- **AND** an `ArchivedChange` record is returned with the correct metadata
- **AND** a new entry is appended to `index.jsonl`

#### Scenario: Actor identity is recorded

- **GIVEN** a change in `archivable` state and an actor identity
- **WHEN** `archive(change, { actor: { name: "Jane", email: "jane@example.com" } })` is called
- **THEN** the `ArchivedChange` has `archivedBy` set to the provided identity

#### Scenario: Archive pattern determines destination path

- **GIVEN** an archive pattern `{{year}}/{{change.archivedName}}`
- **WHEN** `archive(change)` is called
- **THEN** the `archiveDirPath` reflects the pattern with variables resolved (e.g. `2026/add-oauth-login`)

### Requirement: archive persists through a staged commit

#### Scenario: Failure before commit does not expose a successful archive result

- **GIVEN** archive persistence requires more than one durable update
- **AND** a failure occurs before commit completes
- **WHEN** `archive(change)` aborts
- **THEN** no partial archive result is visible as a successful archived change
- **AND** no final archive index entry is exposed as committed

#### Scenario: Successful commit exposes the archive result once

- **WHEN** `archive(change)` completes successfully
- **THEN** the archived manifest and index entry become visible as one committed archive result

### Requirement: Archive path confinement

#### Scenario: Escaping archive pattern is rejected

- **GIVEN** archive path derivation from pattern variables would resolve outside the configured archive root
- **WHEN** `archive(change)` or `archivePath(archivedChange)` resolves that path
- **THEN** the repository rejects the path

#### Scenario: Recovered index path outside root is rejected

- **GIVEN** a stored or recovered archive location points outside the configured archive root
- **WHEN** the repository consumes that location
- **THEN** it is rejected instead of being treated as a valid archive entry

### Requirement: Archive repository debug logging

#### Scenario: Debug logs cover staging and confinement diagnostics

- **WHEN** debug logging is enabled for `ArchiveRepository`
- **THEN** logs include archive path resolution, staged commit start, staged commit completion, and confinement-related failures

### Requirement: archive rejects non-archivable state

#### Scenario: Change not in archivable state

- **GIVEN** a change in `implementing` state
- **WHEN** `archive(change)` is called without `force`
- **THEN** `InvalidStateTransitionError` is thrown
- **AND** the change directory is not moved
- **AND** no entry is appended to `index.jsonl`

#### Scenario: Force bypasses state check

- **GIVEN** a change in `implementing` state
- **WHEN** `archive(change, { force: true })` is called
- **THEN** the change is archived successfully despite not being in `archivable` state

### Requirement: list returns all archived changes in chronological order

#### Scenario: Multiple archived changes

- **GIVEN** three changes archived at different times
- **WHEN** `list()` is called
- **THEN** all three are returned in chronological order (oldest first)

#### Scenario: Duplicate entries in index

- **GIVEN** `index.jsonl` contains duplicate entries for the same change name (from manual recovery)
- **WHEN** `list()` is called
- **THEN** only the last entry per name is included in the result

#### Scenario: No archived changes

- **WHEN** `list()` is called and no changes have been archived
- **THEN** an empty array is returned

### Requirement: get returns an archived change or null

#### Scenario: Change found in index

- **GIVEN** a change named `add-oauth-login` exists in `index.jsonl`
- **WHEN** `get("add-oauth-login")` is called
- **THEN** the `ArchivedChange` is returned

#### Scenario: Change not in index but exists on disk

- **GIVEN** a change directory exists in the archive but its entry is missing from `index.jsonl`
- **WHEN** `get("orphaned-change")` is called
- **THEN** the `ArchivedChange` is returned from the filesystem scan
- **AND** the recovered entry is appended to `index.jsonl`

#### Scenario: Change does not exist

- **WHEN** `get("nonexistent")` is called and no matching change exists anywhere
- **THEN** `null` is returned

### Requirement: archivePath returns the absolute path for an archived change

#### Scenario: Path resolved from archive pattern

- **GIVEN** an archive pattern `{{year}}/{{change.archivedName}}` and archive root `/project/.specd/archive`
- **AND** an `ArchivedChange` with `archivedName: "20260322-120000-my-change"`
- **WHEN** `archivePath(archivedChange)` is called
- **THEN** it returns the absolute path to the archived change directory (e.g. `/project/.specd/archive/20260322-120000-my-change`)

#### Scenario: Path is consistent with archive() result

- **GIVEN** an `ArchivedChange` returned by `archive(change)`
- **WHEN** `archivePath(archivedChange)` is called with the same `ArchivedChange`
- **THEN** the returned path matches the `archiveDirPath` that was returned by `archive()`

### Requirement: reindex rebuilds the archive index

#### Scenario: Corrupted index is rebuilt

- **GIVEN** an `index.jsonl` with missing or extra entries
- **WHEN** `reindex()` is called
- **THEN** `index.jsonl` is rewritten with all archive entries sorted by `archivedAt` (oldest first)
- **AND** each entry corresponds to a manifest file found in the archive directory

### Requirement: Append-only archive semantics

#### Scenario: No mutation of archived entries

- **GIVEN** an archived change record
- **WHEN** any operation is performed on the repository
- **THEN** the archived change's directory contents and manifest remain unchanged

### Requirement: Inheritance from Repository base

#### Scenario: Repository extends Repository base class

- **WHEN** `ArchiveRepository` is examined in the codebase
- **THEN** it extends a base `Repository` class that provides common repository infrastructure

### Requirement: Abstract class with abstract methods

#### Scenario: ArchiveRepository declares abstract methods

- **WHEN** `ArchiveRepository` is declared
- **THEN** it is an abstract class with abstract methods for `archive`, `list`, `get`, and `archivePath`
- **AND** concrete implementations must implement all abstract methods
