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
