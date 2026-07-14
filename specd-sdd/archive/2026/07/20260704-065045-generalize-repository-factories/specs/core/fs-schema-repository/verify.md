# Verification: FsSchemaRepository

## Requirements

### Requirement: Validate options at construction

#### Scenario: Valid constructor options pass validation

- **GIVEN** a valid configuration object with `path`
- **AND** the schema directory exists on disk
- **WHEN** `FsSchemaRepository` is constructed with valid context
- **THEN** it successfully instantiates without error

#### Scenario: Missing path in options throws error

- **GIVEN** a configuration object with a missing `path`
- **WHEN** `FsSchemaRepository` is constructed
- **THEN** Zod validation throws a validation error identifying the missing configuration field

#### Scenario: Non-existent schema directory throws error

- **GIVEN** a valid configuration object with `path`
- **AND** the schema directory does not exist on disk
- **WHEN** `FsSchemaRepository` is constructed
- **THEN** it throws a `StorageDirectoryNotFoundError` indicating the directory does not exist

### Requirement: Storage factory registration

#### Scenario: Factory builds repository correctly

- **GIVEN** a `SchemaStorageFactory` created by `createFsSchemaStorageFactory()`
- **WHEN** `create` is invoked with valid repository context and filesystem options
- **THEN** it returns an instance of `FsSchemaRepository` configured with those options
