# Verification: FsSpecRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path` and `metadataPath`
- **AND** the spec and metadata directories exist on disk
- **WHEN** `FsSpecRepository` is constructed with valid context
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in options throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsSpecRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent spec directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the spec directory does not exist on disk
- **WHEN** `FsSpecRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `SpecStorageFactory` created by `createFsSpecStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsSpecRepository` configured with those options
