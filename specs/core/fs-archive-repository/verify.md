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
