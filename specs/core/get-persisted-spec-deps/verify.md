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
