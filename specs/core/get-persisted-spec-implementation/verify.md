# Verification: GetPersistedSpecImplementation

## Requirements

### Requirement: Input contract

#### Scenario: specId is required

- **GIVEN** a `GetPersistedSpecImplementationInput` missing `specId`
- **WHEN** `execute` is called
- **THEN** it is rejected as an invalid input

### Requirement: Reads persisted state through the repository port

#### Scenario: The query never reads spec-lock.json or materializes metadata

- **GIVEN** a spec with both persisted implementation links and a generated metadata cache
- **WHEN** `GetPersistedSpecImplementation.execute` runs
- **THEN** it obtains its answer by calling `SpecRepository.readPersistedState(spec)` only
- **AND** it does not read `spec-lock.json` directly or materialize/read generated metadata

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

#### Scenario: File-level and symbol-level entries are distinguished and ordered

- **GIVEN** the persisted `implementation` holds a file-level entry and a symbol-level entry in that order
- **WHEN** `execute` is called
- **THEN** the result returns both entries untouched, in stored order, the file-level one without a `symbols` field

### Requirement: Result contract for an initialized spec

#### Scenario: File-level and symbol-level links are distinguished unchanged from storage

- **GIVEN** a persisted state with a file-level link for `core:src/a.ts` (no `symbols`) and a symbol-level link for `core:src/b.ts` with `symbols: ["foo"]`
- **WHEN** `execute` returns
- **THEN** the file-level link is returned with `symbols` absent
- **AND** the symbol-level link is returned with its exact non-empty `symbols` list, in stored order

### Requirement: Result contract for a spec with no persisted state

#### Scenario: Uninitialized spec returns an empty list without creating state

- **GIVEN** a spec whose `readPersistedState` returns `null`
- **WHEN** `execute` is called
- **THEN** the result has `implementation: []` and `initialized: false`
- **AND** no persisted state is created as a side effect

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws SpecNotFoundError

- **GIVEN** a `specId` that does not resolve to an existing spec artifact set in its workspace
- **WHEN** `execute` is called
- **THEN** it throws `SpecNotFoundError`

### Requirement: Config-based factory delegates through resolveGetPersistedSpecImplementationDeps

#### Scenario: Config-based factory resolves one repository per workspace via the shared helper

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createGetPersistedSpecImplementation(config, options?)` is called
- **THEN** `GetPersistedSpecImplementationDeps` is derived through `resolveGetPersistedSpecImplementationDeps(resolver)`
- **AND** the factory does not reconstruct fs-shaped wiring inline

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
