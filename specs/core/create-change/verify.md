# Verification: CreateChange

## Requirements

### Requirement: Name uniqueness enforcement

#### Scenario: Change with duplicate name is rejected

- **GIVEN** a change named `'add-login'` already exists in the repository
- **WHEN** `CreateChange.execute` is called with `name: 'add-login'`
- **THEN** it throws `ChangeAlreadyExistsError`
- **AND** no change is persisted to the repository

#### Scenario: Change with unique name succeeds

- **GIVEN** no change named `'add-login'` exists in the repository
- **WHEN** `CreateChange.execute` is called with `name: 'add-login'`
- **THEN** it returns a `Change` with `name === 'add-login'`

### Requirement: Actor resolution

#### Scenario: Actor identity is recorded in the created event

- **WHEN** `CreateChange.execute` is called
- **THEN** the `created` event's `by` field matches the identity returned by `ActorResolver.identity()`

### Requirement: Initial history contains a single created event

#### Scenario: History contains exactly one created event

- **WHEN** `CreateChange.execute` returns a change
- **THEN** `change.history` has length 1
- **AND** `change.history[0].type === 'created'`
- **AND** the event contains `specIds`, `schemaName`, and `schemaVersion` matching the effective schema identity

#### Scenario: Active schema identity recorded when not provided on input

- **GIVEN** `GetActiveSchema.execute()` returns a schema with name `'spec-driven'` and version `1`
- **WHEN** `CreateChange.execute` is called without `schemaName` or `schemaVersion`
- **THEN** the created event records `schemaName: 'spec-driven'` and `schemaVersion: 1`

### Requirement: Change construction

#### Scenario: Description is included when provided

- **WHEN** `CreateChange.execute` is called with `description: 'OAuth support'`
- **THEN** the returned change has `description === 'OAuth support'`

#### Scenario: Description is omitted when not provided

- **WHEN** `CreateChange.execute` is called without a `description` field
- **THEN** the returned change has `description === undefined`

#### Scenario: Initial state is drafting

- **WHEN** `CreateChange.execute` returns a change
- **THEN** `change.state === 'drafting'`

### Requirement: Initial specDependsOn seeding

#### Scenario: Persisted dependency state seeds dependencies at creation time

- **GIVEN** `CreateChange.execute` is called with a spec that already exists in a repository
- **AND** that repository returns persisted dependencies from `readPersistedDependsOn(spec)`
- **WHEN** the change is constructed
- **THEN** the change seeds `specDependsOn` for that spec from that semantic persisted state

#### Scenario: Legacy metadata seeds when persisted semantic state is absent

- **GIVEN** `CreateChange.execute` is called with a persisted spec whose repository returns no semantic persisted dependency state
- **AND** `metadata.json.dependsOn` exists for that spec
- **WHEN** the change is constructed
- **THEN** the change seeds `specDependsOn` from `metadata.json.dependsOn`

#### Scenario: Stale metadata still seeds as legacy fallback

- **GIVEN** `CreateChange.execute` is called with a persisted spec whose repository returns no semantic persisted dependency state
- **AND** `metadata.json.dependsOn` exists for that spec but the metadata is marked stale
- **WHEN** the change is constructed
- **THEN** the change still seeds `specDependsOn` from the persisted metadata dependency list

#### Scenario: New spec starts without seeded dependency entry

- **GIVEN** `CreateChange.execute` is called with a spec ID that does not yet exist in the repository
- **WHEN** the change is constructed
- **THEN** no seeded dependency entry is required for that spec at creation time

### Requirement: Input contract

#### Scenario: execute accepts CreateChangeInput without schema fields

- **WHEN** `CreateChange.execute` is called with `name` and `specIds` only
- **THEN** it accepts the input without `schemaName` or `schemaVersion`

#### Scenario: execute accepts explicit schema override

- **WHEN** `CreateChange.execute` is called with `schemaName` and `schemaVersion` provided
- **THEN** it uses the provided values without calling `GetActiveSchema`

#### Scenario: Partial schema override is rejected

- **WHEN** `CreateChange.execute` is called with only `schemaName` or only `schemaVersion`
- **THEN** it throws before persisting the change

#### Scenario: specIds are recorded in the created event

- **WHEN** `CreateChange.execute` is called with `specIds: ['auth/login', 'auth/register']`
- **THEN** the created event contains `specIds: ['auth/login', 'auth/register']`

### Requirement: Active schema resolution

#### Scenario: Delegates to GetActiveSchema in project mode

- **GIVEN** `CreateChange.execute` is called without `schemaName` or `schemaVersion`
- **WHEN** the use case resolves schema identity
- **THEN** it calls `GetActiveSchema.execute()` with no arguments
- **AND** it does not implement resolution logic itself

#### Scenario: Schema resolution errors propagate

- **GIVEN** `GetActiveSchema.execute()` throws `SchemaNotFoundError`
- **WHEN** `CreateChange.execute` is called without explicit schema fields
- **THEN** the error propagates to the caller
- **AND** no change is persisted

### Requirement: Optional overlap check

#### Scenario: Overlap report included when requested

- **GIVEN** `CreateChange.execute` is called with `includeOverlapCheck: true` and non-empty `specIds`
- **AND** `DetectOverlap.execute({ name })` returns a report with `hasOverlap: true`
- **WHEN** creation completes
- **THEN** the result includes `overlapReport` with the same entries

#### Scenario: Overlap detection failure does not fail creation

- **GIVEN** `CreateChange.execute` is called with `includeOverlapCheck: true`
- **AND** `DetectOverlap.execute` throws
- **WHEN** creation completes
- **THEN** the change is persisted successfully
- **AND** `overlapReport` is omitted from the result

#### Scenario: Overlap check skipped when flag absent

- **WHEN** `CreateChange.execute` is called without `includeOverlapCheck`
- **THEN** `DetectOverlap.execute` is not called

#### Scenario: Overlap check skipped when specIds empty

- **WHEN** `CreateChange.execute` is called with `includeOverlapCheck: true` and empty `specIds`
- **THEN** `DetectOverlap.execute` is not called

### Requirement: Initial invalidation policy

#### Scenario: New change persists the project default invalidationPolicy

- **GIVEN** the project default invalidation policy is `downstream`
- **WHEN** `CreateChange.execute` creates a new change
- **THEN** the returned and persisted change uses `invalidationPolicy: 'downstream'`

### Requirement: Persistence and scaffolding

#### Scenario: Change is saved to repository

- **WHEN** `CreateChange.execute` completes successfully
- **THEN** `ChangeRepository.save` was called with the returned `Change` instance

#### Scenario: Change is saved then scaffolded

- **WHEN** `CreateChange.execute` completes successfully
- **THEN** `ChangeRepository.save` is called before scaffolding
- **AND** `ChangeRepository.scaffold` is called after saving

#### Scenario: Scaffolding uses specExists callback

- **GIVEN** a `specExists` callback that checks workspace spec maps via `ListWorkspaces`
- **WHEN** `CreateChange.execute` completes
- **THEN** `ChangeRepository.scaffold` is called with the specExists callback

#### Scenario: Result includes changePath

- **GIVEN** no change named `'add-login'` exists
- **WHEN** `CreateChange.execute` is called with `name: 'add-login'`
- **THEN** the result includes `changePath` as an absolute path to the change directory
- **AND** the result includes `change` as the `Change` entity

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires a `ChangeRepository` port in its constructor

#### Scenario: Uses ActorResolver port

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires an `ActorResolver` port in its constructor

#### Scenario: Uses ListWorkspaces for spec existence and dependency seeding

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires a `ListWorkspaces` use case for workspace orchestration

#### Scenario: Uses GetActiveSchema for active schema resolution

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires a `GetActiveSchema` use case in its constructor

#### Scenario: Uses DetectOverlap for optional overlap check

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires a `DetectOverlap` use case in its constructor

### Requirement: Config-based factory delegates through resolveCreateChangeDeps

#### Scenario: createCreateChange config form derives CreateChangeDeps through resolveCreateChangeDeps

- **WHEN** `createCreateChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `CreateChangeDeps` through `resolveCreateChangeDeps(resolver)`
- **AND** `resolveCreateChangeDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `actor: ActorResolver`
- `getActiveSchema: GetActiveSchema`
- `detectOverlap: DetectOverlap`
- **AND** the factory delegates to canonical `createCreateChange(deps)`
