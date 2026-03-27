# Verification: ValidateSchema

## Requirements

### Requirement: Construction dependencies

#### Scenario: Use case constructed with required dependencies

- **GIVEN** a `SchemaRegistry` and a `buildSchema` function
- **WHEN** `ValidateSchema` is constructed with both
- **THEN** it does not throw

### Requirement: Project mode — resolved

#### Scenario: Valid project schema resolves successfully

- **GIVEN** a project with a valid schema, plugins, and overrides
- **WHEN** `execute` is called with `mode: 'project'`
- **THEN** result is `{ valid: true }` with the resolved `Schema`

#### Scenario: Project schema with invalid plugin

- **GIVEN** a project referencing a non-existent plugin
- **WHEN** `execute` is called with `mode: 'project'`
- **THEN** result is `{ valid: false }` with an error mentioning the missing plugin

#### Scenario: Project schema with validation error

- **GIVEN** a project whose merged schema has a duplicate artifact ID
- **WHEN** `execute` is called with `mode: 'project'`
- **THEN** result is `{ valid: false }` with the validation error message

### Requirement: Project mode — raw

#### Scenario: Valid base schema without plugins

- **GIVEN** a valid base schema with no extends
- **WHEN** `execute` is called with `mode: 'project-raw'`
- **THEN** result is `{ valid: true }` with the base `Schema`

#### Scenario: Base schema with extends chain

- **GIVEN** a base schema that extends a parent
- **WHEN** `execute` is called with `mode: 'project-raw'`
- **THEN** the extends chain is resolved and cascaded
- **AND** result is `{ valid: true }`

#### Scenario: Base schema not found

- **GIVEN** a schema ref that does not resolve
- **WHEN** `execute` is called with `mode: 'project-raw'`
- **THEN** result is `{ valid: false }` with a "not found" error

#### Scenario: Raw mode with semantic error in base

- **GIVEN** a base schema with an invalid artifact ID
- **WHEN** `execute` is called with `mode: 'project-raw'`
- **THEN** result is `{ valid: false }` with the validation error

### Requirement: File mode

#### Scenario: Valid external file

- **GIVEN** a valid schema YAML file on disk
- **WHEN** `execute` is called with `mode: 'file'` and the file path
- **THEN** result is `{ valid: true }` with the validated `Schema`

#### Scenario: External file with extends

- **GIVEN** a schema file that declares `extends: @specd/schema-std`
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** the extends chain is resolved
- **AND** result is `{ valid: true }`

#### Scenario: External file not found

- **GIVEN** a file path that does not exist
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** result is `{ valid: false }` with a "file not found" error

#### Scenario: External file with invalid artifact ID

- **GIVEN** a schema file with an artifact ID that fails format validation
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** result is `{ valid: false }` with the validation error

#### Scenario: External file with circular extends

- **GIVEN** a schema file whose extends chain forms a cycle
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** result is `{ valid: false }` with a cycle detection error

#### Scenario: External file with unresolvable extends

- **GIVEN** a schema file that extends a reference that cannot be resolved
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** result is `{ valid: false }` with a resolution error

### Requirement: Ref mode

#### Scenario: Valid schema resolved by ref

- **GIVEN** a valid schema registered in the SchemaRegistry under ref `@specd/schema-std`
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '@specd/schema-std' }`
- **THEN** result is `{ valid: true }` with the validated `Schema`

#### Scenario: Ref with extends chain

- **GIVEN** a schema ref `#default:child` that declares `extends: '#default:parent'`
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '#default:child' }`
- **THEN** the extends chain is resolved and cascaded
- **AND** result is `{ valid: true }`

#### Scenario: Ref not found

- **GIVEN** a ref that does not resolve in the SchemaRegistry
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '@nonexistent/schema' }`
- **THEN** result is `{ valid: false }` with a "schema not found" error

#### Scenario: Ref with invalid artifact ID

- **GIVEN** a schema ref whose schema file has an invalid artifact ID
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '#default:bad-schema' }`
- **THEN** result is `{ valid: false }` with the validation error

#### Scenario: Ref with circular extends

- **GIVEN** a schema ref whose extends chain forms a cycle
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '#default:cyclic' }`
- **THEN** result is `{ valid: false }` with a cycle detection error

#### Scenario: No project plugins or overrides applied

- **GIVEN** a project with `schemaPlugins` and `schemaOverrides` configured
- **AND** a valid schema ref `@specd/schema-std`
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '@specd/schema-std' }`
- **THEN** the result schema does NOT include project plugin or override modifications

### Requirement: Result type

#### Scenario: Success result structure

- **WHEN** validation succeeds
- **THEN** result has `valid: true`, `schema` (Schema entity), and `warnings` (string array)

#### Scenario: Failure result structure

- **WHEN** validation fails
- **THEN** result has `valid: false`, `errors` (non-empty string array), and `warnings` (string array)

### Requirement: Extends chain warnings in file mode

#### Scenario: File with extends emits resolution warning

- **GIVEN** a schema file that extends `@specd/schema-std` resolved from `/path/to/schema.yaml`
- **WHEN** `execute` is called with `mode: 'file'`
- **THEN** `warnings` contains `extends '@specd/schema-std' resolved from /path/to/schema.yaml`

#### Scenario: Ref with extends emits resolution warning

- **GIVEN** a schema ref that extends `@specd/schema-std` resolved from `/path/to/schema.yaml`
- **WHEN** `execute` is called with `{ mode: 'ref', ref: '#default:child' }`
- **THEN** `warnings` contains `extends '@specd/schema-std' resolved from /path/to/schema.yaml`
