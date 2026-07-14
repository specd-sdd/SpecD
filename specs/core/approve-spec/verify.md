# Verification: ApproveSpec

## Requirements

### Requirement: Gate guard

#### Scenario: Spec approval gate is disabled

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: false`
- **WHEN** `execute()` is called with `{ name, reason }`
- **THEN** an `ApprovalGateDisabledError` is thrown with gate `'spec'`
- **AND** no repository access occurs

### Requirement: Change lookup

#### Scenario: Change does not exist

- **GIVEN** the spec approval gate is enabled
- **WHEN** `execute()` is called with a `name` that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Artifact hash computation

#### Scenario: Artifacts are hashed with schema cleanup rules

- **GIVEN** the change has two artifacts of type `spec` and `verify`
- **AND** the schema defines a pre-hash cleanup rule for `spec` but not `verify`
- **WHEN** the use case computes artifact hashes
- **THEN** the `spec` artifact content has the cleanup rule applied before hashing
- **AND** the `verify` artifact content is hashed without cleanup

#### Scenario: Artifact cannot be loaded

- **GIVEN** the change has an artifact entry but `ChangeRepository.artifact()` returns `null` for it
- **WHEN** the use case computes artifact hashes
- **THEN** that artifact is skipped and does not appear in the hash map

#### Scenario: Schema resolution failure propagates

- **GIVEN** `SchemaProvider.get()` throws for the configured schema
- **WHEN** the use case executes
- **THEN** the error propagates from the gate guard before hash computation is reached

### Requirement: Approval recording and state transition

#### Scenario: Change is in pending-spec-approval state

- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `execute()` completes successfully
- **THEN** the change history contains a `spec-approved` event with the provided reason, computed artifact hashes, and the resolved actor
- **AND** the change state is `spec-approved`

#### Scenario: Change is not in pending-spec-approval state

- **GIVEN** the change is in `drafting` state
- **WHEN** `execute()` is called
- **THEN** an `InvalidStateTransitionError` is thrown

### Requirement: Persistence and return value

#### Scenario: Change is saved and returned through serialized mutation

- **GIVEN** a successful approval
- **WHEN** `execute()` returns
- **THEN** `ChangeRepository.mutate(input.name, fn)` has been called
- **AND** the callback records the approval and transitions the fresh persisted change to `spec-approved`
- **AND** the returned `Change` has state `spec-approved`

### Requirement: Input contract

#### Scenario: Input fields are name and reason only

- **WHEN** `ApproveSpecInput` is constructed
- **THEN** `name` and `reason` are required
- **AND** approval gate state is not part of the input

### Requirement: Approval gate baked at construction

#### Scenario: Factory passes config.approvals

- **WHEN** `createApproveSpec(config)` constructs the use case
- **THEN** the instance receives `config.approvals` as its baked gate configuration

#### Scenario: Enabled gate allows execute with name and reason

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: true`
- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `execute({ name, reason })` is called
- **THEN** the change transitions to `spec-approved`

#### Scenario: Schema mismatch fails in gate guard

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: true`
- **GIVEN** the active schema name differs from the change `schemaName`
- **WHEN** `execute({ name, reason })` is called
- **THEN** a `SchemaMismatchError` is thrown before `mutate` is invoked

### Requirement: Config-based factory delegates through resolveApproveSpecDeps

#### Scenario: createApproveSpec config form derives ApproveSpecDeps through resolveApproveSpecDeps

- **WHEN** `createApproveSpec(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ApproveSpecDeps` through `resolveApproveSpecDeps(resolver)`
- **AND** `resolveApproveSpecDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `hasher: ContentHasher`
- `approvals: ApprovalGates`
- **AND** the factory delegates to canonical `createApproveSpec(deps)`
