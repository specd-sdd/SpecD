# Verification: Schema Merge

## Requirements

### Requirement: Five operations with fixed intra-layer order

#### Scenario: Remove before create — no collision

- **GIVEN** a base schema with artifact `id: old-artifact`
- **AND** a layer that removes `old-artifact` and creates `new-artifact`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the result contains `new-artifact` but not `old-artifact`
- **AND** no collision error is thrown because `remove` runs before `create`

#### Scenario: Create collides with existing entry

- **GIVEN** a base schema with artifact `id: specs`
- **AND** a layer that creates an artifact with `id: specs`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** a `SchemaValidationError` is thrown identifying the collision

#### Scenario: Append adds entries at the end in declaration order

- **GIVEN** a base schema with `workflow: [{ step: designing }, { step: implementing }]`
- **AND** a layer that appends `[{ step: reviewing }, { step: deploying }]`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the result `workflow` is `[designing, implementing, reviewing, deploying]` in that order

#### Scenario: Prepend adds entries at the beginning in declaration order

- **GIVEN** a base schema with `artifacts[].validations: [{ id: has-purpose }, { id: has-requirements }]`
- **AND** a layer that prepends `[{ id: has-title }]` to that artifact's validations
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the result validations array is `[has-title, has-purpose, has-requirements]`

#### Scenario: Set replaces an existing array entry in-place

- **GIVEN** a base schema with artifact `id: specs` having `instruction: 'Old instruction'`
- **AND** a layer with `set.artifacts: [{ id: specs, instruction: 'New instruction' }]`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the `specs` artifact's `instruction` is `'New instruction'`
- **AND** all other fields of the `specs` artifact are preserved

#### Scenario: Set on non-existent entry throws

- **GIVEN** a base schema with no artifact `id: nonexistent`
- **AND** a layer with `set.artifacts: [{ id: nonexistent, instruction: 'text' }]`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** a `SchemaValidationError` is thrown

### Requirement: Cross-layer ordering

#### Scenario: Later layer overrides earlier layer

- **GIVEN** a base schema
- **AND** layer 1 (plugin) sets `description` to `'Plugin description'`
- **AND** layer 2 (override) sets `description` to `'Override description'`
- **WHEN** `mergeSchemaLayers` is applied with `[layer1, layer2]`
- **THEN** the result `description` is `'Override description'`

#### Scenario: Plugin appends, then override removes

- **GIVEN** a base schema with no `rules.post` on artifact `specs`
- **AND** layer 1 (plugin) appends `rules.post: [{ id: rfc-rule, text: '...' }]` to `specs`
- **AND** layer 2 (override) removes `rules.post` entry `id: rfc-rule` from `specs`
- **WHEN** `mergeSchemaLayers` is applied with `[layer1, layer2]`
- **THEN** the `specs` artifact has no `rfc-rule` in `rules.post`

### Requirement: Identity matching

#### Scenario: Nested hook removal targets correct step

- **GIVEN** a base schema with workflow steps `designing` and `implementing`, each with hooks
- **AND** a layer that removes hook `id: run-tests` from `step: implementing`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** only the `implementing` step's hook is removed; `designing` hooks are untouched

#### Scenario: Remove non-existent entry throws

- **GIVEN** a base schema with no hook `id: nonexistent` in any step
- **AND** a layer that removes `id: nonexistent` from `step: implementing`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** a `SchemaValidationError` is thrown identifying the missing entry

### Requirement: Remove operation semantics

#### Scenario: Remove optional scalar field

- **GIVEN** a base schema with artifact `specs` having `description: 'Some text'`
- **AND** a layer that removes `description` from artifact `specs`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the `specs` artifact's `description` is `undefined`

#### Scenario: Remove required field throws

- **GIVEN** a layer that attempts to remove `id` from an artifact
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** a `SchemaValidationError` is thrown — `id` is a required field

### Requirement: Post-merge validation

#### Scenario: Dangling requires after removal detected

- **GIVEN** a base schema with artifact `tasks` requiring `design`
- **AND** a layer that removes artifact `design`
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** post-merge validation throws `SchemaValidationError` because `tasks.requires` references `design` which no longer exists

#### Scenario: Duplicate identity after merge detected

- **GIVEN** a base schema with artifact `specs`
- **AND** a layer that appends an artifact also with `id: specs` (bypassing the per-operation check somehow)
- **WHEN** `mergeSchemaLayers` performs post-merge validation
- **THEN** a `SchemaValidationError` is thrown identifying the duplicate

### Requirement: Immutability

#### Scenario: Base is not mutated

- **GIVEN** a base `SchemaYamlData` object
- **AND** a layer that modifies multiple fields
- **WHEN** `mergeSchemaLayers` is applied
- **THEN** the original `base` object is unchanged — a new object is returned
