# Verification: GetPersistedSpecDeps

## Requirements

### Requirement: Input contract

#### Scenario: specId is required

- **GIVEN** a `GetPersistedSpecDepsInput` missing `specId`
- **WHEN** `execute` is called
- **THEN** it is rejected as an invalid input rather than defaulting to an arbitrary spec

### Requirement: Reads persisted state through the repository port

#### Scenario: The query never reads spec-lock.json or metadata directly

- **GIVEN** a spec with both persisted state and a generated metadata cache
- **WHEN** `GetPersistedSpecDeps.execute` runs
- **THEN** it obtains its answer by calling `SpecRepository.readPersistedState(spec)` only
- **AND** it does not read `spec-lock.json` as a raw file or materialize/read generated metadata

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

#### Scenario: Stored order and duplicates are returned unchanged

- **GIVEN** the persisted `dependsOn` is `['core:b', 'core:a', 'core:a']`
- **WHEN** `execute` is called
- **THEN** the result `dependsOn` is `['core:b', 'core:a', 'core:a']` and `initialized` is `true`

### Requirement: Result contract for an initialized spec

#### Scenario: Stored order is preserved without reordering or deduplication

- **GIVEN** a persisted state with `dependsOn: ["core:b", "core:a", "core:a"]`
- **WHEN** `execute` returns
- **THEN** `dependsOn` is exactly `["core:b", "core:a", "core:a"]` in that stored order
- **AND** no reordering or deduplication is applied

### Requirement: Result contract for a spec with no persisted state

#### Scenario: Uninitialized spec returns an empty list without creating state

- **GIVEN** a spec whose `readPersistedState` returns `null`
- **WHEN** `execute` is called
- **THEN** the result has `dependsOn: []` and `initialized: false`
- **AND** no persisted state is created as a side effect
- **AND** no deterministic artifact projection is computed as a fallback value

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws instead of returning an empty result

- **GIVEN** a `specId` that does not resolve to an existing spec artifact set in its workspace
- **WHEN** `execute` is called
- **THEN** it throws a typed `SpecdError` subclass identifying the unresolved spec
- **AND** it does not return an empty `GetPersistedSpecDepsResult`

### Requirement: Config-based factory delegates through resolveGetPersistedSpecDepsDeps

#### Scenario: Config-based factory resolves one repository per workspace via the shared helper

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createGetPersistedSpecDeps(config, options?)` is called
- **THEN** `GetPersistedSpecDepsDeps` is derived through `resolveGetPersistedSpecDepsDeps(resolver)`
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
