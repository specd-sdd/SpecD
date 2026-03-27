# Verification: GetActiveSchema

## Requirements

### Requirement: Optional input

#### Scenario: Execute called without arguments resolves project schema

- **WHEN** `execute()` is called with no arguments
- **THEN** the call succeeds and resolves the project's active schema via `ResolveSchema`

#### Scenario: Execute called with ref resolves referenced schema

- **GIVEN** `@specd/schema-std` is registered in the SchemaRegistry
- **WHEN** `execute({ mode: 'ref', ref: '@specd/schema-std' })` is called
- **THEN** the result is the Schema resolved from that ref with extends chain applied
- **AND** no project plugins or overrides are applied

#### Scenario: Execute called with file resolves file schema

- **GIVEN** a valid schema file at `/tmp/test-schema.yaml`
- **WHEN** `execute({ mode: 'file', filePath: '/tmp/test-schema.yaml' })` is called
- **THEN** the result is the Schema resolved from that file with extends chain applied
- **AND** no project plugins or overrides are applied

#### Scenario: Ref not found throws SchemaNotFoundError

- **GIVEN** a ref that does not resolve in the SchemaRegistry
- **WHEN** `execute({ mode: 'ref', ref: '@nonexistent/schema' })` is called
- **THEN** `SchemaNotFoundError` is thrown

#### Scenario: File not found throws SchemaNotFoundError

- **GIVEN** a file path that does not exist
- **WHEN** `execute({ mode: 'file', filePath: '/tmp/nonexistent.yaml' })` is called
- **THEN** `SchemaNotFoundError` is thrown

### Requirement: Delegates to ResolveSchema

#### Scenario: Project mode delegates to ResolveSchema

- **GIVEN** the use case was constructed with a `ResolveSchema` instance configured for `@specd/schema-std`
- **WHEN** `execute()` is called without arguments
- **THEN** `ResolveSchema.execute()` is called exactly once

#### Scenario: Ref mode uses SchemaRegistry directly

- **WHEN** `execute({ mode: 'ref', ref: '@specd/schema-std' })` is called
- **THEN** `SchemaRegistry.resolveRaw()` is called with the ref
- **AND** `ResolveSchema.execute()` is NOT called

#### Scenario: File mode uses SchemaRegistry directly

- **WHEN** `execute({ mode: 'file', filePath: '/tmp/schema.yaml' })` is called
- **THEN** `SchemaRegistry.resolveRaw()` is called with the file path
- **AND** `ResolveSchema.execute()` is NOT called

### Requirement: Returns the resolved Schema on success

#### Scenario: Schema resolved with extends and plugins

- **GIVEN** `ResolveSchema.execute()` returns a valid `Schema` object (after resolving extends, plugins, and overrides)
- **WHEN** `execute()` is called
- **THEN** the returned promise resolves to that `Schema` object

#### Scenario: Schema not found

- **GIVEN** `ResolveSchema.execute()` throws `SchemaNotFoundError`
- **WHEN** `execute()` is called
- **THEN** the `SchemaNotFoundError` propagates to the caller

#### Scenario: Schema validation failure

- **GIVEN** `ResolveSchema.execute()` throws `SchemaValidationError` (e.g. extends cycle, plugin kind mismatch)
- **WHEN** `execute()` is called
- **THEN** the `SchemaValidationError` propagates to the caller

### Requirement: Construction dependencies

#### Scenario: Constructed with all required dependencies

- **GIVEN** a `ResolveSchema`, `SchemaRegistry`, and `buildSchema` function
- **WHEN** `GetActiveSchema` is constructed with all three
- **THEN** it does not throw

#### Scenario: Multiple project-mode executions resolve the same reference

- **GIVEN** `GetActiveSchema` was constructed with specific config
- **WHEN** `execute()` is called twice without arguments
- **THEN** both calls produce an equivalent `Schema` object
