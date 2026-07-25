# Verification: core:regenerate-spec-metadata

## Requirements

### Requirement: Input and target shapes

#### Scenario: Batch mode ignores metadata freshness for target selection

- **GIVEN** a batch target with no `workspaces` filter
- **WHEN** `execute()` runs in batch mode
- **THEN** every discovered spec within scope is targeted regardless of whether its persisted metadata currently looks fresh
- **AND** there is no partial-selection mode based on metadata status

### Requirement: Delegates generation to forced materialization

#### Scenario: Regeneration never reimplements generation or persistence

- **GIVEN** a single-spec or batch target
- **WHEN** `RegenerateSpecMetadata` processes each target spec
- **THEN** it invokes `MaterializeSpecMetadata` with `policy: 'force'` for that spec
- **AND** it does not reimplement generation, freshness comparison, or persistence logic itself

### Requirement: Batch discovery avoids the ListSpecs cycle

#### Scenario: Batch discovery uses ListWorkspaces and repository listing, not ListSpecs

- **GIVEN** a batch target scoped to a set of workspaces
- **WHEN** raw spec identities are discovered for the batch
- **THEN** discovery goes through `ListWorkspaces` and each workspace repository's spec identity listing
- **AND** `ListSpecs` is never called to select specs for forced regeneration

### Requirement: One-spec failure semantics

#### Scenario: Forced cache-write failure fails the single-spec result

- **GIVEN** a single-spec target whose underlying `MaterializeSpecMetadata` call with `policy: 'force'` fails because the forced cache write fails
- **WHEN** `execute()` returns
- **THEN** the operation reports a failed result for that spec

### Requirement: Batch failure semantics

#### Scenario: Batch continues after an individual spec fails

- **GIVEN** a batch target where one targeted spec fails materialization
- **WHEN** `execute()` processes the batch
- **THEN** processing continues for all remaining targeted specs
- **AND** the returned per-spec result set marks every targeted spec as succeeded or failed
- **AND** the overall outcome is reported as failing because at least one spec failed

#### Scenario: Workspace-filtered-out specs are absent from the result set

- **GIVEN** a batch target scoped to a subset of workspaces via `workspaces`
- **WHEN** `execute()` returns its per-spec result set
- **THEN** specs belonging to workspaces excluded by the filter do not appear in that result set at all

### Requirement: Construction and composition

#### Scenario: Config-based factory delegates through the resolver

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createRegenerateSpecMetadata(config, options?)` is called
- **THEN** exactly one `CompositionResolver` is created
- **AND** dependencies are derived via `resolveRegenerateSpecMetadataDeps(resolver)` before delegating to the canonical `createRegenerateSpecMetadata(deps)` form

#### Scenario: Kernel exposes regenerateMetadata

- **GIVEN** a constructed `Kernel`
- **WHEN** `Kernel.specs.regenerateMetadata` is invoked
- **THEN** it behaves as the `RegenerateSpecMetadata` use case's `execute()`
