# Verification: core:initialize-persisted-spec-state

## Requirements

### Requirement: Input shape

#### Scenario: Batch target without workspaces scopes to the whole project

- **GIVEN** an input with `target: { kind: 'all' }` and no `workspaces` filter
- **WHEN** `execute()` is called
- **THEN** every eligible spec across the whole project is considered a candidate target

#### Scenario: schemaRef omitted uses the effective project schema

- **GIVEN** an input with `target.kind: 'spec'` and no `schemaRef`
- **WHEN** `execute()` resolves the schema
- **THEN** it uses the effective project schema rather than requiring an explicit reference

### Requirement: Schema selection

#### Scenario: One invocation applies exactly one schema across its whole target set

- **GIVEN** a batch invocation covering specs from repositories that would otherwise use different schemas
- **WHEN** a single `schemaRef` (or the effective project schema) is resolved
- **THEN** that one schema is applied to every target in the invocation
- **AND** repositories requiring a different schema are not mixed in; they must be initialized in a separate targeted invocation with a different `schemaRef`

### Requirement: Per-target initialization algorithm

#### Scenario: Schema is resolved once, not per spec, for a batch

- **GIVEN** a batch initialization request for multiple specs
- **WHEN** `InitializePersistedSpecState` executes
- **THEN** it resolves the schema once and applies `schema.canonicalSpecSchema()` across all initialized specs

#### Scenario: Unparseable canonical artifacts fail that target before any write

- **GIVEN** a spec has unparseable canonical artifacts under the selected schema
- **WHEN** `InitializePersistedSpecState` attempts to initialize that spec
- **THEN** it records a failure for that target without writing `spec-lock.json`

### Requirement: No import from generated metadata

#### Scenario: Initialization ignores an existing metadata.json cache entirely

- **GIVEN** a lock-less spec with a `metadata.json` containing `dependsOn`, optimization fields, and implementation entries
- **WHEN** `InitializePersistedSpecState` initializes that spec
- **THEN** the resulting persisted state has `implementation: []`, omits `optimizations`, and derives `dependsOn` only from current artifacts
- **AND** none of the cached metadata values are copied into the new persisted state

### Requirement: No eager metadata materialization

#### Scenario: Initialization does not trigger metadata generation or persistence

- **GIVEN** a lock-less spec being initialized
- **WHEN** the lock write completes successfully
- **THEN** no metadata projection is generated or persisted as part of this call
- **AND** any pre-existing stale metadata cache is left for the next normal metadata consumer to self-heal

### Requirement: Initial dependency resolution rules

#### Scenario: Explicitly supplied complete dependency value wins over projection

- **GIVEN** an initialization call accompanied by an explicit complete `dependsOn` value, for example from an accompanying `deps set` intent or an archive publication plan
- **WHEN** initial dependencies are resolved
- **THEN** that explicit value is used
- **AND** the deterministic artifact projection is not consulted

#### Scenario: Schema unable to extract dependencies yields an empty list

- **GIVEN** a selected schema whose extraction cannot produce a `dependsOn` value from the target's canonical artifacts
- **WHEN** initial dependencies are resolved without an explicit override
- **THEN** `dependsOn` is `[]`

#### Scenario: Dependency resolution reuses deterministic projection without persisting an intermediate cache

- **GIVEN** a target with no explicit dependency override
- **WHEN** initial `dependsOn` is derived from current canonical artifacts
- **THEN** the same deterministic projection logic behind `GenerateSpecMetadata` is reused directly
- **AND** no persisted metadata snapshot is read as an input, and no intermediate cache entry is persisted

### Requirement: One-time operation, no force or reassignment path

#### Scenario: Single-spec target with existing persisted state fails regardless of matching schemaRef

- **GIVEN** a spec that already has persisted state under schema version 2
- **WHEN** a single-spec initialization is requested with `schemaRef` matching that same schema version 2
- **THEN** the call fails with `SpecAlreadyInitializedError`
- **AND** no `--force` option or schema-reassignment path exists to bypass this failure

### Requirement: Batch selection and result reporting

#### Scenario: Specs with existing persisted state are excluded from the eligible set

- **GIVEN** a batch target where some specs already have persisted state
- **WHEN** eligible targets are selected
- **THEN** only lock-less specs are attempted
- **AND** specs with existing persisted state are counted in `existingSkipped`, not reattempted

#### Scenario: One eligible failure marks the whole batch outcome as failed

- **GIVEN** a batch where nine eligible specs succeed and one eligible spec fails
- **WHEN** `execute()` returns
- **THEN** `initialized` contains the nine successes and `failed` contains the one failure with per-spec detail
- **AND** the overall batch outcome is reported as a failure

#### Scenario: Read-only workspace target surfaces as a failure, not a skip

- **GIVEN** a batch target including a lock-less spec in a read-only workspace
- **WHEN** initialization attempts to write persisted state for that spec
- **THEN** that spec appears in `failed`, not silently omitted and not counted in `existingSkipped`

### Requirement: Concurrency

#### Scenario: Concurrent initializers of the same lock-less spec race on expectedRevision null

- **GIVEN** two concurrent `InitializePersistedSpecState` calls targeting the same lock-less spec
- **WHEN** both attempt the conditional write with `expectedRevision: null`
- **THEN** only one write succeeds
- **AND** the losing call's write fails because persisted state for that spec already exists at write time

### Requirement: Construction and composition

#### Scenario: Config-based factory delegates through the resolver

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createInitializePersistedSpecState(config, options?)` is called
- **THEN** exactly one `CompositionResolver` is created
- **AND** dependencies are derived via `resolveInitializePersistedSpecStateDeps(resolver)` before delegating to the canonical `createInitializePersistedSpecState(deps)` form

#### Scenario: Kernel exposes initializePersistedState

- **GIVEN** a constructed `Kernel`
- **WHEN** `Kernel.specs.initializePersistedState` is invoked
- **THEN** it behaves as the `InitializePersistedSpecState` use case's `execute()`
