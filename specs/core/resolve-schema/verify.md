# Verification: ResolveSchema

## Requirements

### Requirement: Construction dependencies

#### Scenario: Constructor receives all required dependencies

- **WHEN** `ResolveSchema` is instantiated
- **THEN** it receives `SchemaRegistry`, `schemaRef: string`, `workspaceSchemasPaths: ReadonlyMap<string, string>`, `schemaPlugins: readonly string[]`, and optionally `schemaOverrides: SchemaOperations`
- **AND** they are stored for use during `execute`

### Requirement: Execute takes no arguments

#### Scenario: execute is parameterless

- **WHEN** `ResolveSchema.execute()` is called
- **THEN** it takes no arguments
- **AND** all configuration was provided at construction time

### Requirement: Returns the resolved Schema

#### Scenario: execute returns a Promise of Schema

- **WHEN** `ResolveSchema.execute()` is called
- **THEN** it returns `Promise<Schema>` — the fully-resolved, customized schema

### Requirement: SchemaRegistry returns raw data

#### Scenario: SchemaRegistry provides raw data for merge and templates

- **GIVEN** a `SchemaRegistry` implementation
- **WHEN** `SchemaRegistry.resolve(ref, workspaceSchemasPaths)` is called
- **THEN** it returns data that includes the parsed `SchemaYamlData`, loaded templates, and the resolved file path
- **AND** this data is sufficient for the merge engine and `buildSchema`

### Requirement: Resolution pipeline

#### Scenario: Base schema with no extends, no plugins, no overrides

- **GIVEN** a registry with `#base` containing a valid schema YAML with no extends
- **WHEN** `ResolveSchema` executes for `#base`
- **THEN** it returns the `Schema` entity matching the base schema directly

#### Scenario: Base schema with extends chain

- **GIVEN** `#child` extending `#parent`
- **WHEN** `ResolveSchema` executes for `#child`
- **THEN** artifacts from `#parent` are inherited and child artifacts override parent artifacts by id

#### Scenario: Cascades compat across multi-level extends chain

- **GIVEN** `#root` with no compat, `#intermediate` extending `#root` with `compat: '@specd/rfc-std@2'`, and `#leaf` extending `#intermediate`
- **WHEN** `ResolveSchema` executes for `#leaf`
- **THEN** `leaf.compat()` returns `{ name: '@specd/rfc-std', version: 2 }`
- **AND** `leaf.canonicalSpecSchema()` returns `{ name: '@specd/rfc-std', version: 2 }`

#### Scenario: Base schema with plugins

- **GIVEN** a base schema and one plugin reference in `schemaPlugins`
- **WHEN** `ResolveSchema` executes
- **THEN** plugin operations are applied to the base schema

#### Scenario: Base schema with overrides

- **GIVEN** a base schema and `schemaOverrides` defined
- **WHEN** `ResolveSchema` executes
- **THEN** override operations are applied after plugins

#### Scenario: Override workflow hooks are normalized from YAML format

- **GIVEN** `schemaOverrides` with workflow hook entries in YAML format
- **WHEN** `ResolveSchema` executes
- **THEN** hook entries are converted to domain format before layer construction

#### Scenario: Full pipeline — extends + plugins + overrides

- **GIVEN** a schema that extends a parent, has plugins, and has overrides
- **WHEN** `ResolveSchema` executes
- **THEN** layers are applied in order: extends → plugins → overrides

#### Scenario: Extends cycle detected

- **GIVEN** `#a` extends `#b` and `#b` extends `#a`
- **WHEN** `ResolveSchema` executes for `#a`
- **THEN** it throws `SchemaValidationError`

#### Scenario: Plugin not found

- **GIVEN** a plugin reference that does not exist in the registry
- **WHEN** `ResolveSchema` executes
- **THEN** it throws `SchemaNotFoundError`

#### Scenario: Plugin has wrong kind

- **GIVEN** a plugin reference that resolves to a file with `kind: schema`
- **WHEN** `ResolveSchema` executes
- **THEN** it throws `SchemaValidationError`

### Requirement: Template merging across extends chain

#### Scenario: Child template overrides parent template

- **GIVEN** parent schema has `templates/spec.md` with content A
- **AND** child schema has `templates/spec.md` with content B
- **WHEN** `execute()` is called
- **THEN** the resolved schema uses content B for `templates/spec.md`

#### Scenario: Parent-only templates are inherited

- **GIVEN** parent schema has `templates/proposal.md`
- **AND** child schema does not declare `templates/proposal.md`
- **WHEN** `execute()` is called
- **THEN** the resolved schema includes `templates/proposal.md` from the parent

### Requirement: Multiple executions are idempotent

#### Scenario: Multiple executions resolve the same schema

- **GIVEN** `ResolveSchema` was constructed with specific config
- **WHEN** `execute()` is called twice
- **THEN** both calls produce an equivalent `Schema` object

### Requirement: Config-based factory delegates through resolveResolveSchemaDeps

#### Scenario: createResolveSchema config form derives ResolveSchemaDeps through resolveResolveSchemaDeps

- **WHEN** `createResolveSchema(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ResolveSchemaDeps` through `resolveResolveSchemaDeps(resolver)`
- **AND** `resolveResolveSchemaDeps(resolver)` resolves:
- `schemas: SchemaRegistry`
- `schemaRef: string`
- `schemaPlugins: readonly string[]`
- `schemaOverrides: SchemaOperations | undefined`
- **AND** the factory delegates to canonical `createResolveSchema(deps)`
