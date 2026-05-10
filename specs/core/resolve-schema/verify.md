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

- **GIVEN** a base schema with `kind: schema` and no `extends`
- **AND** `schemaPlugins` is empty and `schemaOverrides` is undefined
- **WHEN** `execute()` is called
- **THEN** the resolved schema is identical to the base schema (no merge layers applied)

#### Scenario: Base schema with extends chain

- **GIVEN** schema A declares `extends: '#b'`, schema B declares `extends: '#c'`, schema C has no `extends`
- **WHEN** `execute()` is called with `schemaRef` pointing to A
- **THEN** merge layers are applied in order: C → B → A (root to leaf)
- **AND** the final schema reflects all merged changes

#### Scenario: Base schema with plugins

- **GIVEN** a base schema and `schemaPlugins: ['@specd/plugin-rfc']`
- **AND** the plugin has `kind: schema-plugin` with append operations
- **WHEN** `execute()` is called
- **THEN** the plugin's operations are applied after the base schema

#### Scenario: Base schema with overrides

- **GIVEN** a base schema and `schemaOverrides` with `set.description: 'Custom'`
- **WHEN** `execute()` is called
- **THEN** the resolved schema's description is `'Custom'`

#### Scenario: Override workflow hooks are normalized from YAML format

- **GIVEN** a base schema with workflow step `implementing` and `schemaOverrides` appending a hook `{ id: 'test', run: 'echo ok' }` in YAML format
- **WHEN** `execute()` is called
- **THEN** the resolved schema's `implementing` workflow step contains a hook with `{ id: 'test', type: 'run', command: 'echo ok' }`
- **AND** the hook is usable by `RunStepHooks` (matches `h.type === 'run'`)

#### Scenario: Full pipeline — extends + plugins + overrides

- **GIVEN** schema A extends schema B, one plugin, and overrides
- **WHEN** `execute()` is called
- **THEN** layers are applied in order: B (extends) → plugin → overrides

#### Scenario: Extends cycle detected

- **GIVEN** schema A extends B, B extends A
- **WHEN** `execute()` is called
- **THEN** `SchemaValidationError` is thrown identifying the cycle

#### Scenario: Plugin not found

- **GIVEN** `schemaPlugins: ['@specd/nonexistent']` and the package is not installed
- **WHEN** `execute()` is called
- **THEN** `SchemaNotFoundError` is thrown

#### Scenario: Plugin has wrong kind

- **GIVEN** `schemaPlugins` references a file with `kind: schema`
- **WHEN** `execute()` is called
- **THEN** `SchemaValidationError` is thrown

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
