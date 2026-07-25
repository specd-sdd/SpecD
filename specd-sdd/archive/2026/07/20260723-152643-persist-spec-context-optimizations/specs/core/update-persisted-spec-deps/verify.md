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
