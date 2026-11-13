# Verification: UpdatePersistedSpecDeps

## Requirements

### Requirement: Input contract

#### Scenario: specId is required

- **GIVEN** an `UpdatePersistedSpecDepsInput` missing `specId`
- **WHEN** `execute` is called
- **THEN** it is rejected as an invalid input

### Requirement: Mutual exclusivity and minimum operation

#### Scenario: set combined with add is rejected

- **GIVEN** an input providing both `set` and `add`
- **WHEN** `execute` validates the input
- **THEN** it throws a typed validation error before reading or writing persisted state

#### Scenario: clear combined with remove is rejected

- **GIVEN** an input providing both `clear` and `remove`
- **WHEN** `execute` validates the input
- **THEN** it throws a typed validation error

#### Scenario: No operation provided is rejected

- **GIVEN** an input with none of `add`, `remove`, `set`, or `clear` provided
- **WHEN** `execute` is called
- **THEN** it throws a typed validation error

### Requirement: Remove is applied before add

#### Scenario: A dependency present in both remove and add ends up present without duplication

- **GIVEN** a current persisted `dependsOn` of `["core:a", "core:b"]`
- **WHEN** `execute` is called with `remove: ["core:a"]` and `add: ["core:a", "core:c"]`
- **THEN** removals are applied first, producing `["core:b"]`
- **AND** `add` is then applied idempotently, yielding `["core:b", "core:a", "core:c"]` without duplication

### Requirement: Reading current persisted state

#### Scenario: originalHash from the read snapshot is used for optimistic concurrency

- **GIVEN** an existing persisted state with `originalHash: "h1"`
- **WHEN** `execute` reads current state before mutating
- **THEN** the observed `originalHash` is captured for use as `expectedRevision` on the later write

### Requirement: Set and clear create missing persisted state

#### Scenario: set against a lock-less spec creates state with exactly the supplied list

- **GIVEN** a spec with no persisted state
- **WHEN** `execute` is called with `set: ["core:a"]`
- **THEN** persisted state is created with `dependsOn: ["core:a"]`
- **AND** deterministic artifact-based dependency derivation is not invoked

#### Scenario: clear against a lock-less spec creates state with an empty list

- **GIVEN** a spec with no persisted state
- **WHEN** `execute` is called with `clear: true`
- **THEN** persisted state is created with `dependsOn: []`
- **AND** `created` is `true`

### Requirement: Non-empty add creates missing persisted state

#### Scenario: add against a lock-less spec derives an initial base before adding

- **GIVEN** a spec with no persisted state and current canonical artifacts from which the effective schema can extract dependencies
- **WHEN** `execute` is called with `add: ["core:x"]`
- **THEN** `resolveInitialPersistedDependsOn()` is used to derive the initial base from current artifacts
- **AND** `core:x` is added on top of that initial base

#### Scenario: add against a lock-less spec falls back to an empty base when the schema cannot extract dependencies

- **GIVEN** a spec with no persisted state whose effective schema cannot extract `dependsOn` from current artifacts
- **WHEN** `execute` is called with `add: ["core:x"]`
- **THEN** the initial base is `[]`
- **AND** the result is `["core:x"]`

### Requirement: Remove and empty add against missing state are no-ops

#### Scenario: remove against a lock-less spec does not create state

- **GIVEN** a spec with no persisted state
- **WHEN** `execute` is called with `remove: ["core:a"]`
- **THEN** the result reflects `dependsOn: []` and `created: false`
- **AND** `writePersistedState` is never called

#### Scenario: add whose resulting merge would be empty against missing state does not create state

- **GIVEN** a spec with no persisted state and a schema unable to extract dependencies
- **WHEN** `execute` is called with `add: []`
- **THEN** the result reflects `dependsOn: []` and `created: false`
- **AND** `writePersistedState` is never called

### Requirement: Applying the mutation through the shared patch helper

#### Scenario: Only dependsOn is included in the patch

- **GIVEN** an effective base and a resolved target `dependsOn` value
- **WHEN** `execute` applies the mutation
- **THEN** it calls `applyPersistedSpecStatePatch()` with a patch containing only the updated `dependsOn`
- **AND** other fields of the base, such as `schema`, `implementation`, and `optimizations`, are carried through unchanged

#### Scenario: Remove before add with overlapping ID

- **GIVEN** the lock holds `['core:a', 'core:b']`
- **WHEN** `remove: ['core:a']` and `add: ['core:a', 'core:c']` are provided
- **THEN** the persisted `dependsOn` is `['core:b', 'core:a', 'core:c']`

#### Scenario: Original hash is passed as expected revision

- **GIVEN** `readPersistedState` returns a snapshot with `originalHash: 'h1'`
- **WHEN** any mutation is applied
- **THEN** `writePersistedState` is called with `expectedRevision: 'h1'`

#### Scenario: Set against a lock-less spec creates exactly the given list

- **GIVEN** the spec has no persisted state
- **WHEN** `set: ['core:storage']` is provided
- **THEN** the persisted `dependsOn` is `['core:storage']`, `created` is `true`, `initialized` is `true`, and `expectedRevision` is `null`
- **AND** `resolveInitialPersistedDependsOn` is not called

#### Scenario: Clear against a lock-less spec creates an empty list

- **GIVEN** the spec has no persisted state
- **WHEN** `clear: true` is provided
- **THEN** persisted state is created with `dependsOn: []` and `created: true`

#### Scenario: Add against a lock-less spec derives the base first

- **GIVEN** the spec has no persisted state and the resolver yields `['core:storage']`
- **WHEN** `add: ['core:config']` is provided
- **THEN** the persisted `dependsOn` is `['core:storage', 'core:config']` and `created` is `true`

#### Scenario: Remove with non-empty add against a lock-less spec removes from the derived base

- **GIVEN** the spec has no persisted state and the resolver yields `['core:a', 'core:b']`
- **WHEN** `remove: ['core:a']` and `add: ['core:c']` are provided
- **THEN** the persisted `dependsOn` is `['core:b', 'core:c']`

#### Scenario: Add with no resolver result starts from the empty list

- **GIVEN** the spec has no persisted state and the resolver yields nothing
- **WHEN** `add: ['core:c']` is provided
- **THEN** the persisted `dependsOn` is `['core:c']`

#### Scenario: Remove alone against a lock-less spec is a no-op

- **GIVEN** the spec has no persisted state
- **WHEN** `remove: ['core:a']` is provided
- **THEN** `writePersistedState` is not called
- **AND** the result is `dependsOn: []`, `created: false`, `initialized: false`

#### Scenario: Empty add against a lock-less spec is a no-op

- **GIVEN** the spec has no persisted state
- **WHEN** `add: []` is provided
- **THEN** `writePersistedState` is not called and `created` is `false`

#### Scenario: Patch helper carries the other persisted fields unchanged

- **GIVEN** the lock holds `schema`, `implementation`, and `optimizations`
- **WHEN** a dependency mutation is applied
- **THEN** the written state keeps `schema`, `implementation`, and `optimizations` unchanged

#### Scenario: Concurrent modification propagates without retry

- **WHEN** `writePersistedState` rejects with `ArtifactConflictError`
- **THEN** the use case rethrows it and does not retry

#### Scenario: Existing state with add reports created false

- **GIVEN** the spec has persisted state
- **WHEN** `add: ['core:storage']` is provided
- **THEN** `created` is `false` and `initialized` is `true`

#### Scenario: ReadOnly workspace rejected before any I/O

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** any mutation is requested
- **THEN** `ReadOnlyWorkspaceError` is thrown before `readPersistedState` is called

#### Scenario: Factory resolves collaborators from the resolver

- **WHEN** `createUpdatePersistedSpecDeps(config)` is invoked
- **THEN** its deps come from `resolveUpdatePersistedSpecDepsDeps(resolver)`, including the `initializePersistedSpecState` collaborator

### Requirement: Conditional write and concurrency

#### Scenario: Stale expectedRevision produces ArtifactConflictError without retry

- **GIVEN** `readPersistedState` observed `originalHash: "h1"` but the persisted state was replaced by another writer before this write
- **WHEN** `execute` calls `writePersistedState` with `expectedRevision: "h1"`
- **THEN** it propagates `ArtifactConflictError`
- **AND** it does not retry or silently rebase the mutation onto the concurrent winner

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws SpecNotFoundError

- **GIVEN** a `specId` that does not resolve to an existing spec artifact set
- **WHEN** `execute` is called
- **THEN** it throws `SpecNotFoundError`

### Requirement: Result contract

#### Scenario: created is false when mutating existing persisted state

- **GIVEN** a spec with existing persisted state
- **WHEN** `execute` successfully applies `add`
- **THEN** the result's `created` field is `false`
- **AND** `dependsOn` reflects the resulting list after the mutation

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecDepsDeps

#### Scenario: Config-based factory resolves the initializePersistedSpecState collaborator

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createUpdatePersistedSpecDeps(config, options?)` is called
- **THEN** `UpdatePersistedSpecDepsDeps` is derived through `resolveUpdatePersistedSpecDepsDeps(resolver)`, including a repository per workspace and an `initializePersistedSpecState` collaborator
- **AND** the factory does not reconstruct fs-shaped wiring inline

### Requirement: Spec ID validation and existing targets

#### Scenario: Empty dependency rejected before any I/O

- **WHEN** `set: ['']` is provided
- **THEN** the use case throws `InvalidSpecIdError`
- **AND** `writePersistedState` is not called

#### Scenario: Dependency target that does not exist rejected

- **WHEN** `add: ['core:no-such-spec']` is provided and that spec does not exist
- **THEN** the use case throws `SpecNotFoundError` naming it
- **AND** nothing is written

#### Scenario: Unknown workspace rejected

- **WHEN** `add: ['nope:auth/login']` is provided
- **THEN** the use case throws `WorkspaceNotFoundError`

#### Scenario: Bare dependency stored qualified

- **GIVEN** `default:_global/architecture` exists
- **WHEN** `add: ['_global/architecture']` is provided
- **THEN** the stored dependency is `default:_global/architecture`

#### Scenario: Remove deletes an invalid stored value

- **GIVEN** the lock already holds an invalid value in `dependsOn`
- **WHEN** `remove` names that value
- **THEN** the lock is read with `lenientDependsOn: true`
- **AND** the value is removed without a syntax error and the lock is written

#### Scenario: Remove normalizes a bare valid ID

- **GIVEN** the lock holds `default:auth/shared`
- **WHEN** `remove: ['auth/shared']` is provided
- **THEN** `default:auth/shared` is removed

#### Scenario: Clear and set repair a lock with invalid dependencies

- **GIVEN** the lock holds an invalid value in `dependsOn`
- **WHEN** `clear: true` or a valid `set` is provided
- **THEN** the invalid value is gone from the written lock

#### Scenario: Add reads strictly

- **GIVEN** the lock holds an invalid value in `dependsOn`
- **WHEN** `add` is provided
- **THEN** `InvalidSpecLockError` is thrown and nothing is written

#### Scenario: Remaining invalid entry after mutation fails

- **GIVEN** the lock holds two invalid values in `dependsOn`
- **WHEN** `remove` names only one of them
- **THEN** `InvalidSpecLockError` naming the remaining `dependsOn` field is thrown and nothing is written

#### Scenario: Invalid lock on strict read raises the typed lock error

- **GIVEN** the spec's lock fails validation in a field other than `dependsOn`
- **WHEN** any mutation reads it
- **THEN** `InvalidSpecLockError` is thrown and nothing is written

#### Scenario: Clear works on a valid lock

- **GIVEN** the lock has dependencies
- **WHEN** `clear: true` is provided
- **THEN** the persisted `dependsOn` is `[]`

#### Scenario: Valid entries accepted

- **WHEN** `add: ['core:storage']` is provided and the spec exists
- **THEN** the dependency is persisted
