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
