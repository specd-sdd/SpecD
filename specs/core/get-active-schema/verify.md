# Verification: GetActiveSchema

## Requirements

### Requirement: Accepts no input

#### Scenario: Execute called without arguments

- **WHEN** `execute()` is called with no arguments
- **THEN** the call succeeds and uses the `schemaRef` and `workspaceSchemasPaths` provided at construction

### Requirement: Resolves the schema via SchemaRegistry

#### Scenario: Registry receives construction-time parameters

- **GIVEN** the use case was constructed with `schemaRef: "@specd/schema-std"` and a workspace schemas map
- **WHEN** `execute()` is called
- **THEN** `SchemaRegistry.resolve` is called with `"@specd/schema-std"` and the same workspace schemas map

### Requirement: Returns the resolved Schema on success

#### Scenario: Schema resolved from npm package

- **GIVEN** `SchemaRegistry.resolve` returns a valid `Schema` object
- **WHEN** `execute()` is called
- **THEN** the returned promise resolves to that `Schema` object

### Requirement: Throws SchemaNotFoundError when resolution fails

#### Scenario: Schema reference not found

- **GIVEN** `SchemaRegistry.resolve` returns `null`
- **WHEN** `execute()` is called
- **THEN** a `SchemaNotFoundError` is thrown
- **AND** the error message contains the schema reference string

#### Scenario: Workspace schema path does not exist

- **GIVEN** the `schemaRef` is `"#billing:my-schema"` and the billing schemas path does not contain `my-schema/`
- **WHEN** `execute()` is called
- **THEN** a `SchemaNotFoundError` is thrown with the reference `"#billing:my-schema"`

### Requirement: Construction dependencies

#### Scenario: Multiple executions resolve the same reference

- **GIVEN** the use case was constructed with `schemaRef: "@specd/schema-std"`
- **WHEN** `execute()` is called twice
- **THEN** `SchemaRegistry.resolve` is called twice with the same `"@specd/schema-std"` reference
