# Verification: ResolveSchema

## Requirements

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

### Requirement: Execute takes no arguments

#### Scenario: Multiple executions resolve the same schema

- **GIVEN** `ResolveSchema` was constructed with specific config
- **WHEN** `execute()` is called twice
- **THEN** both calls produce an equivalent `Schema` object
