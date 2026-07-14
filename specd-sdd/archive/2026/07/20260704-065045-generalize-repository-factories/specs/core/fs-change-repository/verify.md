# Verification: FsChangeRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path` and context with `draftsPath` and `discardedPath`
- **AND** all directories exist on disk
- **WHEN** `FsChangeRepository` is constructed
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in config throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsChangeRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent active changes directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the active changes directory does not exist on disk
- **WHEN** `FsChangeRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `ChangeStorageFactory` created by `createFsChangeStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsChangeRepository` configured with those options
