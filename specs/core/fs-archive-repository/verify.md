# Verification: FsArchiveRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path` and `pattern`
- **AND** the archive, active changes, and drafts directories exist on disk
- **WHEN** `FsArchiveRepository` is constructed with valid context and config options
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in options throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsArchiveRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent archive directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the archive directory does not exist on disk
- **WHEN** `FsArchiveRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `ArchiveStorageFactory` created by `createFsArchiveStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsArchiveRepository` configured with those options

### Requirement: Archive list index in fs-cache

#### Scenario: list delegates to fs-cache archive helper

- **GIVEN** archived changes exist on disk
- **WHEN** `FsArchiveRepository.list()` is called
- **THEN** results are served from `{configPath}/tmp/fs-cache/archive/`
- **AND** items are `ArchiveListEntry` rows ordered by `archivedAt` descending

#### Scenario: count reads totalCount from fs-cache meta

- **GIVEN** the fs-cache archive index reports `totalCount: 4`
- **WHEN** `FsArchiveRepository.count()` is called with a fresh index
- **THEN** the returned count is `4`

#### Scenario: reindex rebuilds fs-cache archive index only

- **WHEN** `FsArchiveRepository.reindex()` is invoked
- **THEN** `{configPath}/tmp/fs-cache/archive/` is rebuilt from archived manifests
- **AND** no root-local archive index is written during normal operation

#### Scenario: archive upserts archive row and updates source bucket

- **WHEN** `archive(change)` completes successfully
- **THEN** an `ArchiveListEntry` is upserted in the fs-cache archive index
- **AND** the source active change bucket index is updated or invalidated as required

### Requirement: Legacy archive root index orphan cleanup

#### Scenario: Rebuild deletes legacy root index files

- **GIVEN** legacy `.specd-index.jsonl` and `.specd-index-meta.json` exist at the archive storage root
- **WHEN** `reindex()` or the first full rebuild materializes `fs-cache/archive/`
- **THEN** both legacy root files are deleted (ENOENT ignored)

#### Scenario: Normal list hits do not scan archive root for legacy files

- **GIVEN** a fresh fs-cache archive index is served on `list()`
- **WHEN** `list()` or `count()` completes from cache
- **THEN** legacy root index files are not scanned or deleted during that read path

### Requirement: Archive pattern expansion has no workspace token

#### Scenario: Configured pattern with {{change.workspace}} is rejected at construction

- **GIVEN** `storage.archive.pattern` is configured as `{{year}}/{{change.workspace}}/{{change.archivedName}}`
- **WHEN** `FsArchiveRepository` is constructed with that pattern
- **THEN** the constructor throws `UnsupportedPatternError`
- **AND** the error reason explains that a change has no single primary workspace

#### Scenario: Path resolution never derives a workspace value

- **GIVEN** a supported archive pattern `{{year}}/{{change.archivedName}}`
- **AND** a change touching multiple workspaces via `specIds`
- **WHEN** `archive(change)` or `archivePath(entry)` resolves the destination path
- **THEN** the resolved path is computed from `name`, `archivedName`, and `archivedAt` alone
- **AND** the implementation does not read `workspaces[0]`, `specIds[0]`, or any other derived workspace value

#### Scenario: {{change.scope}} and {{change.workspace}} are rejected the same way

- **GIVEN** two otherwise-identical archive pattern configurations, one containing `{{change.scope}}` and one containing `{{change.workspace}}`
- **WHEN** `FsArchiveRepository` is constructed with each pattern in turn
- **THEN** both constructions throw `UnsupportedPatternError`
