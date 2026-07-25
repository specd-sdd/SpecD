# Verification: UpdatePersistedSpecImplementation

## Requirements

### Requirement: Input contract

#### Scenario: action must be add or remove

- **GIVEN** an `UpdatePersistedSpecImplementationInput` with an `action` value other than `'add'` or `'remove'`
- **WHEN** `execute` is called
- **THEN** it is rejected as an invalid input

### Requirement: File must exist for add

#### Scenario: Adding a link for a non-existent file fails without mutating state

- **GIVEN** `action: 'add'` and a `file` that does not exist on disk within the codeRoot of `specId`'s workspace
- **WHEN** `execute` is called
- **THEN** it throws `ImplementationFileNotFoundError`
- **AND** persisted state is not mutated

### Requirement: Canonical file identity and workspace confinement

#### Scenario: Path outside the workspace codeRoot fails instead of being coerced

- **GIVEN** a `file` value that resolves outside the codeRoot implied by `specId`'s workspace
- **WHEN** `execute` is called
- **THEN** it throws `ImplementationWorkspaceBoundaryError`
- **AND** it does not silently coerce or drop the out-of-boundary path, and persisted state is not mutated

#### Scenario: Nested path is normalized to a forward-slash canonical identity

- **GIVEN** a `file` value referring to a nested path within the workspace codeRoot
- **WHEN** `execute` normalizes it for `action: 'add'`
- **THEN** the resulting canonical identity uses forward slashes and is relative to the codeRoot, per `core:spec-lock`

### Requirement: Add creates or enriches a canonical link

#### Scenario: Adding symbols to an existing file-level link preserves previously recorded symbols

- **GIVEN** persisted state with a file-level link for `core:src/a.ts` (no `symbols`) and a prior symbol-level entry for a different file
- **WHEN** `execute` is called with `action: 'add'`, `file: 'src/a.ts'`, and `symbols: ["foo"]`
- **THEN** the link for `core:src/a.ts` includes `foo` in its symbol set
- **AND** previously recorded symbols for other files are not discarded

#### Scenario: Adding without symbols does not alter existing symbol-level entries

- **GIVEN** persisted state with a symbol-level link for `core:src/a.ts` with `symbols: ["foo"]`
- **WHEN** `execute` is called with `action: 'add'`, `file: 'src/a.ts'`, and no `symbols`
- **THEN** a file-level link exists for that file
- **AND** the existing symbol-level entry for `foo` is not altered

### Requirement: Remove removes canonical links

#### Scenario: Removing specific symbols leaves other symbols intact

- **GIVEN** a persisted link for `core:src/a.ts` with `symbols: ["foo", "bar"]`
- **WHEN** `execute` is called with `action: 'remove'`, `file: 'src/a.ts'`, `symbols: ["foo"]`
- **THEN** the resulting link retains `symbols: ["bar"]`

#### Scenario: Removing the last symbol may remove the entry entirely when no separate file-level link exists

- **GIVEN** a persisted link for `core:src/a.ts` with only `symbols: ["foo"]` and no separately recorded file-level link
- **WHEN** `execute` is called with `action: 'remove'`, `file: 'src/a.ts'`, `symbols: ["foo"]`
- **THEN** the remaining symbol set becomes empty
- **AND** the entry may be removed entirely for that file

#### Scenario: Removing without symbols removes the whole entry including symbol refinements

- **GIVEN** a persisted link for `core:src/a.ts` with `symbols: ["foo", "bar"]`
- **WHEN** `execute` is called with `action: 'remove'`, `file: 'src/a.ts'`, and no `symbols`
- **THEN** the whole implementation entry for `core:src/a.ts` is removed, including all symbol-level refinements

### Requirement: Add creates missing persisted state

#### Scenario: add against a lock-less spec derives an initial base with empty implementation

- **GIVEN** a spec with no persisted state and an existing file on disk
- **WHEN** `execute` is called with `action: 'add'`
- **THEN** `resolveInitialPersistedDependsOn()` is used to derive the initial base
- **AND** `implementation` defaults to `[]` before the requested link addition is applied

### Requirement: Remove against missing state is a no-op

#### Scenario: remove against a lock-less spec does not create state

- **GIVEN** a spec with no persisted state
- **WHEN** `execute` is called with `action: 'remove'`
- **THEN** the result reflects `implementation: []` and `created: false`
- **AND** `writePersistedState` is never called

### Requirement: Applying the mutation through the shared patch helper

#### Scenario: Only the computed implementation array is patched

- **GIVEN** an effective base and a newly computed `implementation` array
- **WHEN** `execute` applies the mutation
- **THEN** it passes the computed `implementation` array as a patch to `applyPersistedSpecStatePatch()`
- **AND** the complete resulting `PersistedSpecState` is passed to `SpecRepository.writePersistedState()` with `expectedRevision` equal to the observed `originalHash`, or `null` when absent

### Requirement: Conflict handling

#### Scenario: Stale expectedRevision produces ArtifactConflictError without retry

- **GIVEN** the observed revision no longer matches the persisted state at write time
- **WHEN** `execute` calls `writePersistedState`
- **THEN** it propagates `ArtifactConflictError`
- **AND** it does not retry or silently rebase the mutation

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws SpecNotFoundError

- **GIVEN** a `specId` that does not resolve to an existing spec artifact set in its workspace
- **WHEN** `execute` is called
- **THEN** it throws `SpecNotFoundError`

### Requirement: Result contract

#### Scenario: created is true only when persisted state was newly created

- **GIVEN** a spec with no persisted state
- **WHEN** `execute` is called with `action: 'add'` for an existing file
- **THEN** the result's `created` field is `true`
- **AND** `implementation` reflects the resulting link list after the mutation

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps

#### Scenario: Config-based factory resolves the file reader, workspace lookup, and initializePersistedSpecState collaborator

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createUpdatePersistedSpecImplementation(config, options?)` is called
- **THEN** `UpdatePersistedSpecImplementationDeps` is derived through `resolveUpdatePersistedSpecImplementationDeps(resolver)`, including a repository per workspace, workspace configuration lookup, a `FileReader`, and an `initializePersistedSpecState` collaborator
- **AND** the factory does not reconstruct fs-shaped wiring inline
