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
- **WHEN** `archive(change)` or `archivePath(entry)` resolves that path
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

#### Scenario: List with limit and page

- **GIVEN** the archive has 250 archived changes indexed in fs-cache
- **WHEN** `list({ limit: 100, page: 2 })` is called
- **THEN** it returns 100 `ArchiveListEntry` rows (entries 101 to 200 in canonical order)
- **AND** `meta.total` is 250
- **AND** `meta.page` is 2
- **AND** items are ordered by `archivedAt` descending (newest first)

#### Scenario: Duplicate entries in index

- **GIVEN** the fs-cache archive index contains duplicate entries for the same change name
- **WHEN** `list()` is called
- **THEN** only the last entry per name is included in the result

#### Scenario: No archived changes

- **WHEN** `list()` is called and no changes have been archived
- **THEN** `{ items: [], meta: { total: 0, count: 0, limit: 0 } }` is returned

### Requirement: list returns index entries

#### Scenario: List returns result object with items and meta

- **GIVEN** the archive contains archived changes
- **WHEN** `list()` is called
- **THEN** the result is `ListResult<ArchiveListEntry>` with `items` and `meta`
- **AND** `meta.total` reflects the count from `{configPath}/tmp/fs-cache/archive/.specd-index-meta.json`

#### Scenario: archivedBy appears only when includeArchivedBy is set

- **GIVEN** cached archive list entries that include `archivedBy`
- **WHEN** `list({ includeArchivedBy: true })` is called
- **THEN** returned items may include projected `archivedBy`
- **WHEN** `list()` is called without `includeArchivedBy`
- **THEN** returned items do not include `archivedBy`

#### Scenario: List does not read every manifest

- **GIVEN** an archive with many indexed entries
- **WHEN** `list()` is called
- **THEN** the repository satisfies the listing from index entries without reading every archive `manifest.json`

### Requirement: Archive list count

#### Scenario: Count matches list meta.total from fs-cache index

- **GIVEN** an archive with a known number of indexed entries
- **WHEN** `count()` and `list().meta.total` are queried
- **THEN** both return the same total
- **AND** `count()` does not scan every archive manifest

### Requirement: get returns an archived change or null

#### Scenario: Change found in index

- **GIVEN** a change named `add-oauth-login` exists in `index.jsonl`
- **WHEN** `get(\"add-oauth-login\")` is called
- **THEN** the `ArchivedChange` is returned
- **AND** it is loaded from the archived directory `manifest.json`

#### Scenario: Change not in index but exists on disk

- **GIVEN** a change directory exists in the archive but its entry is missing from `index.jsonl`
- **WHEN** `get(\"orphaned-change\")` is called
- **THEN** the `ArchivedChange` is returned from the filesystem scan
- **AND** it is loaded from the archived directory `manifest.json`
- **AND** the recovered entry is appended to `index.jsonl`

#### Scenario: Change does not exist

- **WHEN** `get(\"nonexistent\")` is called and no matching change exists anywhere
- **THEN** `null` is returned

### Requirement: fs implementation maintains archive runtime ignore rules

#### Scenario: Archive creation ensures staging ignore rule

- **GIVEN** the archive root `.gitignore` is missing or incomplete
- **WHEN** `FsArchiveRepository.archive(change)` commits a successful archive
- **THEN** the archive root `.gitignore` contains an entry for `.staging`

#### Scenario: Reindex does not require root-local index gitignore entries

- **GIVEN** the archive root `.gitignore` is missing or incomplete
- **WHEN** `FsArchiveRepository.reindex()` rebuilds the fs-cache archive index
- **THEN** the archive root `.gitignore` contains an entry for `.staging`
- **AND** list index files remain governed by `{configPath}/tmp/.gitignore`, not the archive root `.gitignore`

### Requirement: archivePath returns the absolute path for an archived change

#### Scenario: Path resolved from archive pattern for ArchivedChange

- **GIVEN** an archive pattern `{{year}}/{{change.archivedName}}` and archive root `/project/.specd/archive`
- **AND** an `ArchivedChange` with `archivedName: "20260322-120000-my-change"`
- **WHEN** `archivePath(archivedChange)` is called
- **THEN** it returns the absolute path to the archived change directory

#### Scenario: Path resolved from ArchiveListEntry

- **GIVEN** an `ArchiveListEntry` for the same archived change
- **WHEN** `archivePath(entry)` is called
- **THEN** it returns the same absolute archived directory path as for the full `ArchivedChange`

### Requirement: internalPaths returns absolute storage paths

#### Scenario: FsArchiveRepository returns archive root

- **GIVEN** `FsArchiveRepository` is configured with an archive root path
- **WHEN** `internalPaths()` is called
- **THEN** it returns an array containing the absolute path to the archive root

#### Scenario: Non-filesystem implementation returns undefined

- **GIVEN** an `ArchiveRepository` implementation that does not manage local directories
- **WHEN** `internalPaths()` is called
- **THEN** it returns `undefined`

### Requirement: reindex rebuilds the archive index

#### Scenario: Corrupted fs-cache index is rebuilt newest first

- **GIVEN** a corrupted or stale index under `{configPath}/tmp/fs-cache/archive/`
- **WHEN** `reindex()` is called
- **THEN** the fs-cache index is rewritten with all archive entries sorted by `archivedAt` descending
- **AND** each entry corresponds to a manifest file found in the archive directory

#### Scenario: Migration deletes legacy root-local index files

- **GIVEN** legacy `.specd-index.jsonl` and `.specd-index-meta.json` exist at the archive root
- **WHEN** `reindex()` or the first full fs-cache rebuild runs
- **THEN** those legacy root-local index files are deleted (ENOENT ignored)
- **AND** normal cache-hit `list()` / `count()` calls do not scan or delete root-local legacy files

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
- **THEN** it is an abstract class with abstract methods for `archive`, `list`, `count`, `get`, and `reindex`
- **AND** concrete implementations must implement all abstract methods

### Requirement: Archive index metadata persistence

#### Scenario: reindex rebuilds fs-cache metadata file

- **GIVEN** the archive has 150 directories with manifests
- **AND** `{configPath}/tmp/fs-cache/archive/.specd-index-meta.json` is missing or incorrect
- **WHEN** `reindex()` is called
- **THEN** the fs-cache meta file is created or updated with `totalCount: 150`

#### Scenario: list and count share fs-cache meta total

- **GIVEN** a populated fs-cache archive index with `totalCount` recorded in meta
- **WHEN** `list().meta.total` and `count()` are queried after freshness checks
- **THEN** both return the same total from the fs-cache meta file
