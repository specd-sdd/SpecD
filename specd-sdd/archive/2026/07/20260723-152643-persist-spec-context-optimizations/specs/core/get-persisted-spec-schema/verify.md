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
