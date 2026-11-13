# Verification: Get Persisted Spec Schema

## Requirements

### Requirement: Input contract

#### Scenario: specId is the only input consulted

- **WHEN** `execute({ specId })` is called
- **THEN** the read is resolved solely from `specId`

### Requirement: Reads persisted state through the repository port

#### Scenario: Query never reads spec-lock.json directly or materializes metadata

- **GIVEN** a spec with generated metadata present and a distinct persisted schema
- **WHEN** `execute({ specId })` is called
- **THEN** the result is derived entirely from `SpecRepository.readPersistedState(spec)`
- **AND** no metadata materialization or regeneration occurs

#### Scenario: Unresolvable spec throws SpecNotFoundError

- **GIVEN** the workspace is valid and the spec does not exist there
- **WHEN** `execute` is called with that spec ID
- **THEN** `SpecNotFoundError` is thrown

#### Scenario: Only readPersistedState reads persisted data

- **WHEN** `execute` succeeds
- **THEN** the only persisted-data port call is `readPersistedState`
- **AND** no generated metadata or lock file is read directly

#### Scenario: Reading creates no state

- **GIVEN** the spec has no persisted state
- **WHEN** `execute` is called
- **THEN** no write method of the repository is called

#### Scenario: Factory derives deps from the resolver

- **WHEN** the config-based factory is invoked
- **THEN** its deps come from the resolver helper and include the configured workspaces used for ID validation

#### Scenario: Unknown spec fails before the initialization check

- **GIVEN** the spec does not exist
- **WHEN** `execute` is called
- **THEN** `SpecNotFoundError` is thrown and `SpecNotInitializedError` is not

#### Scenario: Persisted schema identity is returned exactly

- **GIVEN** the persisted schema is `{ name: 'default', version: 2 }`
- **WHEN** `execute` is called
- **THEN** the result schema is `{ name: 'default', version: 2 }`

### Requirement: Requires an initialized spec

#### Scenario: Uninitialized spec throws SpecNotInitializedError

- **GIVEN** `readPersistedState` returns `null` for an existing spec
- **WHEN** `execute({ specId })` is called
- **THEN** a `SpecNotInitializedError` identifying `specId` is thrown
- **AND** no partial or default schema identity is returned

### Requirement: Result contract

#### Scenario: Result returns the exact persisted schema identity

- **GIVEN** persisted state records `schema: { name: 'default', version: 2 }`
- **WHEN** `execute({ specId })` is called
- **THEN** `result.schema` equals `{ name: 'default', version: 2 }` exactly
- **AND** `result.specId` equals the fully-qualified spec identity

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unknown spec throws SpecNotFoundError before the initialization check

- **WHEN** `execute({ specId })` is called for a spec identity with no existing artifact set in its workspace
- **THEN** a `SpecNotFoundError` is thrown
- **AND** `SpecNotInitializedError` is never thrown for this case

### Requirement: Config-based factory delegates through resolveGetPersistedSpecSchemaDeps

#### Scenario: createGetPersistedSpecSchema config form derives deps through the resolver

- **WHEN** `createGetPersistedSpecSchema(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetPersistedSpecSchemaDeps` through `resolveGetPersistedSpecSchemaDeps(resolver)`
- **AND** `resolveGetPersistedSpecSchemaDeps(resolver)` resolves `specs: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createGetPersistedSpecSchema(deps)`

### Requirement: Spec ID validation

#### Scenario: Empty spec ID rejected before any repository access

- **WHEN** `execute` is called with `specId: ''`
- **THEN** `InvalidSpecIdError` is thrown
- **AND** no repository is read or written

#### Scenario: Malformed spec ID rejected

- **WHEN** `execute` is called with `specId: 'Bad Id'`
- **THEN** `InvalidSpecIdError` is thrown quoting `Bad Id`

#### Scenario: Unknown workspace rejected

- **WHEN** `execute` is called with `specId: 'nope:auth/login'`
- **THEN** `WorkspaceNotFoundError` is thrown

#### Scenario: Bare spec ID resolved to the default workspace

- **WHEN** `execute` is called with `specId: '_global/architecture'`
- **THEN** it behaves as for `default:_global/architecture`
- **AND** any `specId` in the result is `default:_global/architecture`

#### Scenario: Qualified spec ID accepted unchanged

- **WHEN** `execute` is called with `specId: 'core:storage'`
- **THEN** it proceeds with workspace `core` and path `storage`
