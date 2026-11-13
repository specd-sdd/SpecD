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

Scenarios:

#### Scenario: Creation accepts a complete structured override

- **WHEN** valid artifact and workflow policy values are supplied
- **THEN** they are passed as one structured input without parsing legacy aliases in the use case

#### Scenario: Partial schema override remains invalid

- **WHEN** creation supplies only one member of the schema override pair
- **THEN** input validation rejects the request independently of policy input

#### Scenario: specIds are recorded in the created event

- **WHEN** `CreateChange.execute` is called with `specIds: ['auth/login', 'auth/register']`
- **THEN** the created event contains `specIds: ['default:auth/login', 'default:auth/register']`

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

Scenarios:

#### Scenario: Explicit policy wins over preserve default

- **WHEN** a new change is created with explicit structured policy
- **THEN** its v2 manifest persists that policy and no legacy scalar
- **AND** omission resolves configured values or `{ downstream, preserve }`

#### Scenario: Later policy edits do not rewrite creation history

- **WHEN** the persisted policy changes after creation
- **THEN** no retroactive drift or recovery is fabricated

#### Scenario: Unknown invalidation policy rejected

- **WHEN** `execute` is called with `invalidationPolicy: 'sugical'`
- **THEN** `InvalidInputError` is thrown quoting `sugical` and listing `none`, `surgical`, `downstream`, `global`
- **AND** no change is created

### Requirement: Persistence and scaffolding

#### Scenario: Change is created via repository create

- **WHEN** `CreateChange.execute` completes successfully
- **THEN** `ChangeRepository.create` was called with the returned `Change` instance

#### Scenario: Change is created then scaffolded

- **WHEN** `CreateChange.execute` completes successfully
- **THEN** `ChangeRepository.create` is called before scaffolding
- **AND** `ChangeRepository.scaffold` is called after creating

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

#### Scenario: Config factory injects nondefault project policy

- **GIVEN** resolved project configuration sets `{ artifacts: surgical, workflow: redesign }`
- **WHEN** `createCreateChange(config).execute` creates a change without an input policy
- **THEN** `resolveCreateChangeDeps` supplies that structured default
- **AND** the persisted v2 manifest uses `{ artifacts: surgical, workflow: redesign }`, not the native default

#### Scenario: Kernel creation shares the config factory default

- **GIVEN** the same nondefault project policy
- **WHEN** `kernel.changes.create.execute` receives no input policy
- **THEN** it persists the same project default without a CLI-supplied overlay

#### Scenario: Explicit policy overrides injected project default

- **GIVEN** a config-based factory or kernel with a nondefault project policy
- **WHEN** creation supplies an explicit structured input policy
- **THEN** the explicit policy is persisted and only one creation event is recorded

#### Scenario: Direct dependencies without project default use native default

- **WHEN** `createCreateChange(deps)` receives no injected default and execute supplies no policy
- **THEN** it persists `{ artifacts: downstream, workflow: preserve }`

### Requirement: Schema compatibility guardrail

#### Scenario: Uninitialized spec fallback allows addition if global schema matches change

- **GIVEN** a spec with no persisted semantic state
- **WHEN** the spec is added to a change initialized with the global project schema
- **THEN** creation succeeds (fallback assumption applies)

#### Scenario: Adding a spec with identical schema succeeds

- **GIVEN** a spec whose persisted schema identity matches the Change's schema name
- **WHEN** it is included in `specIds`
- **THEN** creation succeeds

#### Scenario: Adding a spec with a different but compatible schema succeeds

- **GIVEN** a spec whose persisted schema name is `schema-ui`
- **AND** the Change uses `schema-fullstack` which declares `compat` with `schema-ui`
- **WHEN** the spec is included in `specIds`
- **THEN** creation succeeds

#### Scenario: Adding a spec with an incompatible schema throws IncompatibleSchemaError

- **GIVEN** a spec whose persisted schema is `schema-api`
- **AND** the Change uses `schema-ui` (no compat mapping to `schema-api`)
- **WHEN** the spec is included in `specIds`
- **THEN** the use case throws `IncompatibleSchemaError` and creation is aborted

### Requirement: Spec ID validation

#### Scenario: Invalid ID rejected and no change created

- **WHEN** `specIds: ['Bad Id']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting `Bad Id`
- **AND** no change is created

#### Scenario: Empty ID rejected

- **WHEN** `specIds: ['']` is provided
- **THEN** the use case throws `InvalidSpecIdError`
- **AND** no change is created

#### Scenario: Duplicate IDs collapse

- **WHEN** `specIds: ['auth/login', 'default:auth/login']` is provided
- **THEN** the manifest stores `default:auth/login` once

#### Scenario: Existing name is reported before spec ID validation

- **GIVEN** a change named `my-change` already exists
- **WHEN** create is called with name `my-change` and `specIds: ['Bad Id']`
- **THEN** the use case throws `ChangeAlreadyExistsError`

#### Scenario: Comma in an ID is not split

- **WHEN** `specIds: ['auth/a,b']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting `auth/a,b`

#### Scenario: Unknown workspace rejected

- **WHEN** `specIds: ['nope:auth/login']` is provided
- **THEN** the use case throws `WorkspaceNotFoundError`

#### Scenario: Bare ID stored qualified

- **WHEN** `specIds: ['auth/login']` is provided
- **THEN** the manifest stores `default:auth/login`

#### Scenario: Spec that does not exist yet accepted

- **WHEN** `specIds` names a spec that does not exist yet
- **THEN** the change is created

### Requirement: ReadOnly workspace rejection

#### Scenario: readOnly spec rejected

- **GIVEN** workspace `platform` has `ownership: readOnly`
- **WHEN** `specIds: ['platform:auth/tokens']` is provided
- **THEN** the use case throws `ReadOnlyWorkspaceError` with the line `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`
- **AND** no change is created

#### Scenario: Mixed owned and readOnly specs

- **GIVEN** workspace `platform` has `ownership: readOnly` and `default` is owned
- **WHEN** `specIds: ['default:auth/login', 'platform:auth/tokens']` is provided
- **THEN** the use case throws `ReadOnlyWorkspaceError` with exactly one line, for `platform:auth/tokens`
- **AND** the message ends with `ReadOnly workspaces are protected: their specs and code cannot be modified by changes.` and suggests no remediation
- **AND** nothing is created, including no entry for `default:auth/login`

#### Scenario: SDK callers are covered

- **WHEN** an SDK caller creates a change with a readOnly spec
- **THEN** the same rejection applies
