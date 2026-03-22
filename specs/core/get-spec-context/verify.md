# Verification: Get Spec Context

## Requirements

### Requirement: Resolve workspace and spec from input

#### Scenario: Unknown workspace throws WorkspaceNotFoundError

- **WHEN** `execute({ workspace: 'nonexistent', specPath })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown

#### Scenario: Spec not found throws SpecNotFoundError

- **GIVEN** a valid workspace with no spec at the requested path
- **WHEN** `execute(input)` is called
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Build context entry from metadata

#### Scenario: Fresh metadata produces full entry

- **GIVEN** a spec with fresh metadata containing title, description, rules, constraints, and scenarios
- **WHEN** `execute(input)` is called without section filters
- **THEN** the entry has `stale: false` and includes `title`, `description`, `rules`, `constraints`, and `scenarios`

#### Scenario: Empty rules/constraints/scenarios omitted from entry

- **GIVEN** a spec with fresh metadata where `rules` is an empty array
- **WHEN** `execute(input)` is called
- **THEN** the entry does not include a `rules` field

### Requirement: Stale or absent metadata produces minimal entry

#### Scenario: No metadata yields stale entry

- **GIVEN** a spec with no metadata
- **WHEN** `execute(input)` is called
- **THEN** the entry has `stale: true` and only `spec` and `stale` fields

#### Scenario: Stale hashes yield stale entry

- **GIVEN** a spec with metadata whose content hashes do not match current files
- **WHEN** `execute(input)` is called
- **THEN** the entry has `stale: true`
- **AND** a warning of type `'stale-metadata'` is emitted

### Requirement: Section filtering

#### Scenario: Only requested sections included

- **GIVEN** a spec with fresh metadata containing rules, constraints, and scenarios
- **WHEN** `execute({ ..., sections: ['rules'] })` is called
- **THEN** the entry includes `rules` but not `constraints`, `scenarios`, `title`, or `description`

#### Scenario: Empty sections array shows all

- **WHEN** `execute({ ..., sections: [] })` is called
- **THEN** the entry includes all available fields (same as no filter)

### Requirement: Transitive dependency traversal

#### Scenario: Dependencies resolved recursively

- **GIVEN** spec A depends on spec B, which depends on spec C, all with fresh metadata
- **WHEN** `execute({ ..., followDeps: true })` is called on spec A
- **THEN** `entries` contains A, B, and C in that order

#### Scenario: Circular dependency does not cause infinite loop

- **GIVEN** spec A depends on spec B, and spec B depends on spec A
- **WHEN** `execute({ ..., followDeps: true })` is called on spec A
- **THEN** `entries` contains A and B (each visited once)

#### Scenario: Dependencies not followed when followDeps is false

- **GIVEN** a spec with `dependsOn` links in its metadata
- **WHEN** `execute(input)` is called without `followDeps`
- **THEN** `entries` contains only the root spec

### Requirement: Depth limiting

#### Scenario: Depth 0 returns only root

- **GIVEN** spec A depends on spec B
- **WHEN** `execute({ ..., followDeps: true, depth: 0 })` is called
- **THEN** `entries` contains only spec A

#### Scenario: Depth 1 returns root and direct deps only

- **GIVEN** spec A depends on spec B, which depends on spec C
- **WHEN** `execute({ ..., followDeps: true, depth: 1 })` is called
- **THEN** `entries` contains A and B but not C

### Requirement: Warnings for unresolvable dependencies

#### Scenario: Unknown workspace in dependency emits warning

- **GIVEN** a spec whose metadata references `dependsOn: ['unknown-ws:some/spec']`
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** `warnings` contains an entry with `type: 'unknown-workspace'`
- **AND** traversal continues for remaining dependencies

#### Scenario: Missing dependency spec emits warning

- **GIVEN** a spec whose metadata references a dependency that does not exist in the target workspace
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** `warnings` contains an entry with `type: 'missing-spec'`

#### Scenario: Missing metadata during traversal emits warning

- **GIVEN** a dependency spec with no metadata
- **WHEN** dependency traversal reaches that spec
- **THEN** `warnings` contains an entry with `type: 'missing-metadata'`
