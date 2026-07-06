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

#### Scenario: Repository resolved through orchestrator

- **WHEN** `GetSpecContext.execute()` is called for a specific workspace
- **THEN** it resolves the corresponding `SpecRepository` using the `ListWorkspaces` orchestrator

### Requirement: Build context entry from metadata

#### Scenario: Full mode produces full entry from fresh metadata

- **GIVEN** a spec with fresh metadata containing title, description, rules, constraints, and scenarios
- **AND** effective context mode is full
- **WHEN** `execute(input)` is called without section filters
- **THEN** the entry has `stale: false` and includes `title`, `description`, `rules`, `constraints`, and `scenarios`

#### Scenario: Summary mode produces summary entry from fresh metadata

- **GIVEN** a spec with fresh metadata containing title and description
- **AND** effective context mode is summary
- **WHEN** `execute(input)` is called
- **THEN** the entry includes title and description but no full section arrays

#### Scenario: List mode produces list entry from fresh metadata

- **GIVEN** a spec with fresh metadata
- **AND** effective context mode is list
- **WHEN** `execute(input)` is called
- **THEN** the entry includes identity/mode fields but no title, description, rules, constraints, or scenarios

#### Scenario: Full mode defaults to Description + Rules + Constraints

- **GIVEN** a spec with fresh metadata
- **AND** effective context mode is `full`
- **WHEN** `GetSpecContext.execute` is called without section filters
- **THEN** the entry includes Title, Description, Rules, and Constraints

### Requirement: Stale or absent metadata produces minimal entry

#### Scenario: No metadata yields stale list entry in list mode

- **GIVEN** a spec with no metadata
- **AND** effective context mode is list
- **WHEN** `execute(input)` is called
- **THEN** the entry is stale and includes only minimal list-shape fields

#### Scenario: Stale hashes yield stale summary/full-compatible entry

- **GIVEN** a spec with metadata whose content hashes do not match current files
- **WHEN** `execute(input)` is called
- **THEN** the entry is stale
- **AND** a warning of type `'stale-metadata'` is emitted

### Requirement: Section filtering

#### Scenario: Only requested sections included in full mode

- **GIVEN** a spec with fresh metadata
- **AND** effective context mode is `full`
- **WHEN** `execute({ ..., sections: ['rules'] })` is called
- **THEN** the entry includes Title, Description (persistence), and Rules
- **AND** Constraints and Scenarios are omitted

#### Scenario: Empty sections array defaults to Description + Rules + Constraints

- **GIVEN** effective context mode is `full`
- **WHEN** `execute({ ..., sections: [] })` is called
- **THEN** the entry includes Title, Description, Rules, and Constraints
- **AND** Scenarios are omitted unless explicitly requested

### Requirement: Transitive dependency traversal

#### Scenario: Dependencies resolved recursively

- **GIVEN** spec A depends on spec B and spec B depends on spec C
- **WHEN** `execute({ ..., followDeps: true })` is called on spec A
- **THEN** `entries` contains A, B, and C in that order

#### Scenario: Canonical metadata dependsOn works without extraction

- **GIVEN** the root spec has fresh `metadata.json.dependsOn: ['default:B']`
- **AND** the active schema omits `metadataExtraction.dependsOn`
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** dependency traversal still includes spec B

#### Scenario: Stale metadata remains usable for dependency traversal with warning

- **GIVEN** the root spec has persisted `metadata.json.dependsOn: ['default:B']`
- **AND** that metadata is marked stale
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** dependency traversal still includes spec B
- **AND** the result includes a `stale-metadata` warning

#### Scenario: Circular dependency does not cause infinite loop

- **GIVEN** spec A depends on spec B and spec B depends on spec A
- **WHEN** `execute({ ..., followDeps: true })` is called on spec A
- **THEN** `entries` includes each spec at most once

#### Scenario: Dependencies not followed when followDeps is false

- **GIVEN** spec A depends on spec B
- **WHEN** `execute({ ..., followDeps: false })` is called on spec A
- **THEN** `entries` contains only spec A

#### Scenario: Transitive dependencies resolved via orchestrator

- **GIVEN** traversal crosses workspaces
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** repositories are resolved through the orchestrator for each dependency

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

- **GIVEN** a dependency refers to an unknown workspace
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** the result includes a warning for the unknown workspace

#### Scenario: Missing dependency spec emits warning

- **GIVEN** a dependency spec cannot be found
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** the result includes a warning for the missing spec

#### Scenario: Missing metadata during traversal emits warning

- **GIVEN** traversal reaches a dependency with no metadata
- **WHEN** `execute({ ..., followDeps: true })` is called
- **THEN** the result includes a `missing-metadata` warning

### Requirement: Result shape

#### Scenario: Result entries include explicit display mode

- **WHEN** `execute(input)` is called
- **THEN** each returned entry includes its resolved display mode

### Requirement: Prefer LLM-optimized context

#### Scenario: Uses optimized context for single spec

- **GIVEN** `llmOptimizedContext: true`
- **AND** the spec has `optimizedContext` populated
- **WHEN** `GetSpecContext` is executed
- **THEN** the entry uses the optimized content
