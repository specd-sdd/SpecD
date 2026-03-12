# Verification: SchemaRegistry Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `SchemaRegistry`
- **WHEN** the class implements both `resolve` and `list`
- **THEN** it compiles and can be instantiated

### Requirement: Resolve method signature

#### Scenario: Resolve returns Schema on success

- **GIVEN** a `SchemaRegistry` implementation and a valid schema reference
- **WHEN** `resolve` is called with the ref and a workspace schemas map
- **THEN** it returns a `Promise<Schema>` containing the parsed schema

#### Scenario: Resolve returns null for missing schema

- **GIVEN** a `SchemaRegistry` implementation and a reference to a non-existent schema file
- **WHEN** `resolve` is called
- **THEN** it returns `null`

### Requirement: Resolve prefix routing

#### Scenario: npm-scoped reference routes to node_modules

- **WHEN** `resolve` is called with `"@specd/schema-std"`
- **THEN** the implementation loads from `node_modules/@specd/schema-std/schema.yaml`

#### Scenario: Workspace-qualified reference routes to workspace schemasPath

- **GIVEN** `workspaceSchemasPaths` maps `"billing"` to `/project/schemas`
- **WHEN** `resolve` is called with `"#billing:my-schema"`
- **THEN** the implementation loads from `/project/schemas/my-schema/schema.yaml`

#### Scenario: Bare name defaults to the default workspace

- **WHEN** `resolve` is called with `"spec-driven"` (no prefix)
- **THEN** it behaves identically to `"#default:spec-driven"`

#### Scenario: Hash-only reference defaults to the default workspace

- **WHEN** `resolve` is called with `"#my-schema"`
- **THEN** it behaves identically to `"#default:my-schema"`

#### Scenario: Filesystem path is loaded directly

- **WHEN** `resolve` is called with `"./custom/schema.yaml"`
- **THEN** the implementation loads from that path directly without prefix routing

### Requirement: List result ordering

#### Scenario: Workspace entries appear before npm entries

- **GIVEN** schemas exist in both a workspace directory and in npm packages
- **WHEN** `list` is called
- **THEN** all workspace `SchemaEntry` items appear before npm `SchemaEntry` items

### Requirement: SchemaEntry shape

#### Scenario: Workspace entry has workspace field

- **GIVEN** a schema discovered in workspace `"billing"`
- **WHEN** `list` returns the entry
- **THEN** `source` is `"workspace"` and `workspace` is `"billing"`

#### Scenario: npm entry omits workspace field

- **GIVEN** a schema discovered as an npm package
- **WHEN** `list` returns the entry
- **THEN** `source` is `"npm"` and `workspace` is `undefined`
