# Verification: SchemaRepository Port

## Requirements

### Requirement: Inheritance from Repository base

#### Scenario: Accessors reflect construction-time values

- **GIVEN** a `SchemaRepository` constructed with workspace `"billing"`, ownership `"readOnly"`, isExternal `true`
- **WHEN** the accessors are called
- **THEN** `workspace()` returns `"billing"`, `ownership()` returns `"readOnly"`, `isExternal()` returns `true`

### Requirement: Workspace scoping

#### Scenario: Operations only access schemas within the bound workspace

- **GIVEN** a `SchemaRepository` bound to workspace `"billing"` with schemasPath `/billing/schemas`
- **WHEN** `resolve("my-schema")` is called
- **THEN** the implementation looks only within `/billing/schemas/my-schema/schema.yaml`
- **AND** never accesses schemas from other workspaces

### Requirement: Abstract class with abstract methods

#### Scenario: Subclass must implement all abstract methods

- **GIVEN** a class that extends `SchemaRepository` without implementing `resolveRaw`, `resolve`, or `list`
- **WHEN** the code is compiled
- **THEN** the TypeScript compiler reports errors for each unimplemented abstract method

### Requirement: resolveRaw method signature

#### Scenario: resolveRaw returns intermediate data on success

- **GIVEN** a schema named `"spec-driven"` exists in this workspace
- **WHEN** `resolveRaw("spec-driven")` is called
- **THEN** it returns a `SchemaRawResult` with `data` (SchemaYamlData), `templates` (Map), and `resolvedPath` (string)

#### Scenario: resolveRaw returns null for missing schema

- **GIVEN** no schema named `"nonexistent"` exists in this workspace
- **WHEN** `resolveRaw("nonexistent")` is called
- **THEN** it returns `null`

### Requirement: resolve method signature

#### Scenario: resolve returns Schema on success

- **GIVEN** a schema named `"spec-driven"` exists in this workspace
- **WHEN** `resolve("spec-driven")` is called
- **THEN** it returns a `Schema` entity

#### Scenario: resolve returns null for missing schema

- **GIVEN** no schema named `"nonexistent"` exists in this workspace
- **WHEN** `resolve("nonexistent")` is called
- **THEN** it returns `null`

### Requirement: list method signature

#### Scenario: list returns entries for all schemas in the workspace

- **GIVEN** a workspace with two schemas: `"alpha"` and `"beta"`
- **WHEN** `list()` is called
- **THEN** it returns two `SchemaEntry` objects
- **AND** each has `source` set to `"workspace"` and `workspace` set to this repository's workspace name

#### Scenario: list does not load schema contents

- **GIVEN** a workspace with a schema that has an invalid `schema.yaml`
- **WHEN** `list()` is called
- **THEN** it returns a `SchemaEntry` for that schema without throwing a validation error

### Requirement: SchemaRawResult and SchemaEntry re-export

#### Scenario: Types are importable from the port module

- **WHEN** a consumer imports `SchemaRawResult` and `SchemaEntry` from the schema-repository port module
- **THEN** the imports resolve successfully
