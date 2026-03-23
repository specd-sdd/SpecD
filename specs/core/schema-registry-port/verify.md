# Verification: SchemaRegistry Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `SchemaRegistry`
- **WHEN** the class implements `resolve`, `resolveRaw`, and `list`
- **THEN** it compiles and can be instantiated

### Requirement: Resolve method signature

#### Scenario: Resolve returns Schema on success

- **GIVEN** a `SchemaRegistry` implementation with workspace repositories configured
- **AND** a valid schema reference
- **WHEN** `resolve` is called with the ref
- **THEN** it returns a `Promise<Schema>` containing the parsed schema

#### Scenario: Resolve returns null for missing schema

- **GIVEN** a `SchemaRegistry` implementation and a reference to a non-existent schema file
- **WHEN** `resolve` is called
- **THEN** it returns `null`

### Requirement: Resolve prefix routing

#### Scenario: npm-scoped reference routes to node_modules

- **WHEN** `resolve` is called with `"@specd/schema-std"`
- **THEN** the implementation loads from `node_modules/@specd/schema-std/schema.yaml`

#### Scenario: Workspace-qualified reference delegates to SchemaRepository

- **GIVEN** a `SchemaRepository` for workspace `"billing"` is in the registry's map
- **WHEN** `resolve` is called with `"#billing:my-schema"`
- **THEN** the registry delegates to the `"billing"` repository's `resolve("my-schema")`

#### Scenario: Bare name delegates to default workspace repository

- **WHEN** `resolve` is called with `"spec-driven"` (no prefix)
- **THEN** the registry delegates to the `"default"` repository's `resolve("spec-driven")`

#### Scenario: Hash-only reference delegates to default workspace repository

- **WHEN** `resolve` is called with `"#my-schema"`
- **THEN** the registry delegates to the `"default"` repository's `resolve("my-schema")`

#### Scenario: Filesystem path is loaded directly

- **WHEN** `resolve` is called with `"./custom/schema.yaml"`
- **THEN** the implementation loads from that path directly without delegating to any repository

#### Scenario: Unknown workspace returns null

- **GIVEN** no `SchemaRepository` exists for workspace `"unknown"` in the registry's map
- **WHEN** `resolve` is called with `"#unknown:my-schema"`
- **THEN** it returns `null`

### Requirement: ResolveRaw method signature

#### Scenario: ResolveRaw returns intermediate data on success

- **GIVEN** a valid schema reference
- **WHEN** `resolveRaw` is called
- **THEN** it returns a `SchemaRawResult` with `data` (SchemaYamlData), `templates` (Map), and `resolvedPath` (string)

#### Scenario: ResolveRaw returns null for missing schema

- **GIVEN** a reference to a non-existent schema file
- **WHEN** `resolveRaw` is called
- **THEN** it returns `null`

#### Scenario: ResolveRaw uses same prefix routing as resolve

- **WHEN** `resolveRaw` is called with `"@specd/schema-std"`
- **THEN** it resolves from the same location as `resolve` would

#### Scenario: ResolveRaw delegates workspace schemas to repository

- **GIVEN** a `SchemaRepository` for workspace `"billing"` is in the registry's map
- **WHEN** `resolveRaw` is called with `"#billing:my-schema"`
- **THEN** the registry delegates to the `"billing"` repository's `resolveRaw("my-schema")`

### Requirement: List result ordering

#### Scenario: Workspace entries appear before npm entries

- **GIVEN** schemas exist in workspace repositories and in npm packages
- **WHEN** `list` is called (no parameters)
- **THEN** all workspace `SchemaEntry` items appear before npm `SchemaEntry` items

#### Scenario: List aggregates from all workspace repositories

- **GIVEN** `SchemaRepository` instances for `"default"` and `"billing"` are in the registry's map
- **AND** each has schemas
- **WHEN** `list` is called
- **THEN** entries from both repositories are included in the result

### Requirement: SchemaEntry shape

#### Scenario: Workspace entry has workspace field

- **GIVEN** a schema discovered in workspace `"billing"`
- **WHEN** `list` returns the entry
- **THEN** `source` is `"workspace"` and `workspace` is `"billing"`

#### Scenario: npm entry omits workspace field

- **GIVEN** a schema discovered as an npm package
- **WHEN** `list` returns the entry
- **THEN** `source` is `"npm"` and `workspace` is `undefined`
