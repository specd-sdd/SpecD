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
- **AND** the event contains `specIds`, `schemaName`, and `schemaVersion` matching the input

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

#### Scenario: Existing sidecar seeds dependencies at creation time

- **GIVEN** `CreateChange.execute` is called with a spec that already exists in a repository
- **AND** that spec already has `spec-lock.json`
- **WHEN** the change is constructed
- **THEN** the change seeds `specDependsOn` for that spec from `spec-lock.json.dependsOn`

#### Scenario: Legacy metadata seeds when sidecar is absent

- **GIVEN** `CreateChange.execute` is called with a persisted spec that has no sidecar
- **AND** `metadata.json.dependsOn` exists for that spec
- **WHEN** the change is constructed
- **THEN** the change seeds `specDependsOn` from `metadata.json.dependsOn`

#### Scenario: New spec starts without seeded dependency entry

- **GIVEN** `CreateChange.execute` is called with a spec ID that does not yet exist in the repository
- **WHEN** the change is constructed
- **THEN** no seeded dependency entry is required for that spec at creation time

### Requirement: Input contract

#### Scenario: execute accepts CreateChangeInput

- **WHEN** `CreateChange.execute` is called
- **THEN** it accepts `CreateChangeInput` with `name`, `specIds`, `schemaName`, `schemaVersion` (required)
- **AND** `description` (optional)

#### Scenario: specIds are recorded in the created event

- **WHEN** `CreateChange.execute` is called with `specIds: ['auth/login', 'auth/register']`
- **THEN** the created event contains `specIds: ['auth/login', 'auth/register']`

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

- **GIVEN** a `specExists` callback that checks workspace spec maps
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

#### Scenario: Uses spec repositories map for existence checks and dependency seeding

- **WHEN** `CreateChange` is instantiated
- **THEN** it requires a `ReadonlyMap<string, SpecRepository>` for spec existence checks and persisted dependency seeding
