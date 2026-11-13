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

#### Scenario: Absolute path outside the codeRoot rejected

- **GIVEN** the codeRoot of `core` is `/repo/packages/core`
- **WHEN** `add` is called with `file: '/etc/passwd'`
- **THEN** `ImplementationWorkspaceBoundaryError` is thrown and nothing is written

#### Scenario: Parent traversal rejected

- **WHEN** `add` is called with `file: '../other/x.ts'`
- **THEN** `ImplementationWorkspaceBoundaryError` is thrown

#### Scenario: Sibling directory sharing the codeRoot prefix rejected

- **GIVEN** the codeRoot is `/repo/core`
- **WHEN** `add` is called with a file under `/repo/core-evil/x.ts`
- **THEN** `ImplementationWorkspaceBoundaryError` is thrown

#### Scenario: Qualified path leaving the codeRoot rejected

- **WHEN** `add` is called with `file: 'core:../x.ts'` or `file: 'core:../../etc/passwd'`
- **THEN** `ImplementationWorkspaceBoundaryError` is thrown and no existence check or write happens

#### Scenario: Qualified path naming another workspace rejected

- **GIVEN** `specId` is in workspace `core`
- **WHEN** `add` is called with `file: 'cli:src/x.ts'`
- **THEN** `ImplementationWorkspaceBoundaryError` is thrown

#### Scenario: Windows drive path is not a workspace qualifier

- **WHEN** `add` is called with `file: 'C:\\x\\y.ts'` outside the codeRoot
- **THEN** it is confined as an absolute host path and `ImplementationWorkspaceBoundaryError` is thrown

#### Scenario: Nested path is stored forward-slashed

- **WHEN** `add` is called with a nested file inside the codeRoot
- **THEN** the stored identity is `core:src/domain/x.ts` using forward slashes

#### Scenario: Add symbols to a file-level link keeps the file-level entry

- **GIVEN** a file-level entry exists for the file
- **WHEN** `add` is called with `symbols: ['A']`
- **THEN** the link carries symbol `A` and previously recorded symbols are not discarded

#### Scenario: Add without symbols keeps symbol entries

- **GIVEN** a symbol-level entry exists for the file
- **WHEN** `add` is called without `symbols`
- **THEN** a file-level entry exists and the symbol entries are unchanged

#### Scenario: Remove symbols, last symbol, and whole entry

- **WHEN** `remove` is called with some symbols, with the last remaining symbol, and with no symbols
- **THEN** respectively only those symbols are removed, the entry is removed unless an explicit file-level link was recorded, and the whole entry including refinements is removed

#### Scenario: Add against missing state creates it from the resolved base

- **GIVEN** the spec has no persisted state
- **WHEN** `add` is called with an existing file
- **THEN** the base comes from `resolveInitialPersistedDependsOn`, `implementation` starts at `[]`, `created` is `true`, and `expectedRevision` is `null`

#### Scenario: Remove against missing state is a no-op

- **GIVEN** the spec has no persisted state
- **WHEN** `remove` is called
- **THEN** `writePersistedState` is not called and the result is `implementation: []`, `created: false`

#### Scenario: Expected revision and conflict

- **GIVEN** the snapshot has `originalHash: 'h1'`
- **WHEN** a mutation is applied
- **THEN** `writePersistedState` receives `expectedRevision: 'h1'`
- **AND** an `ArtifactConflictError` from the write is rethrown without retry

#### Scenario: Unknown spec and readOnly workspace

- **WHEN** the spec does not exist, or its workspace is `readOnly`
- **THEN** respectively `SpecNotFoundError` or `ReadOnlyWorkspaceError` is thrown and nothing is written

#### Scenario: Factory resolves collaborators

- **WHEN** the config-based factory is invoked
- **THEN** its deps come from `resolveUpdatePersistedSpecImplementationDeps(resolver)` including `files`, `workspaces`, and `initializePersistedSpecState`

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
