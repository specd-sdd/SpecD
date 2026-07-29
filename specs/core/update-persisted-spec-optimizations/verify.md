# Verification: Update Persisted Spec Optimizations

## Requirements

### Requirement: Input contract

#### Scenario: Set with a single field updates only that field

- **GIVEN** persisted optimizations with both `optimizedDescription` and `optimizedContext` set
- **WHEN** `execute({ specId, set: { optimizedDescription: 'new text' } })` is called
- **THEN** only `optimizedDescription` is updated in persisted state
- **AND** `optimizedContext` is unaffected

#### Scenario: Clear with multiple field names removes every listed field

- **GIVEN** persisted optimizations with both fields set
- **WHEN** `execute({ specId, clear: ['optimizedDescription', 'optimizedContext'] })` is called
- **THEN** the persisted state has no `optimizations` block afterward

#### Scenario: Strict input validation rejects malformed untyped set payloads before I/O

- **GIVEN** an untyped caller supplies an unknown root key, unknown set key, non-string set value, missing or empty `specId`, or a non-object input
- **WHEN** the payload is passed to `execute`
- **THEN** `InvalidInputError` is thrown with actionable issue text
- **AND** workspace lookup, schema resolution, artifact reads, and persisted-state I/O are not performed

#### Scenario: Strict input validation rejects malformed untyped clear payloads before I/O

- **GIVEN** an untyped caller supplies an invalid clear field name, non-array clear value, or non-string clear entry
- **WHEN** the payload is passed to `execute`
- **THEN** `InvalidInputError` is thrown with actionable issue text
- **AND** workspace lookup, schema resolution, artifact reads, and persisted-state I/O are not performed

### Requirement: Mutual exclusivity and minimum operation

#### Scenario: Providing both set and clear throws InvalidInputError

- **WHEN** `execute({ specId, set: { optimizedDescription: 'x' }, clear: ['optimizedContext'] })` is called
- **THEN** `InvalidInputError` is thrown
- **AND** no workspace, schema, artifact, or persisted-state port is called

#### Scenario: Neither set nor clear throws InvalidInputError

- **WHEN** `execute({ specId })` is called with neither `set` nor `clear`
- **THEN** `InvalidInputError` is thrown
- **AND** no workspace, schema, artifact, or persisted-state port is called

#### Scenario: Empty set object throws InvalidInputError

- **WHEN** `execute({ specId, set: {} })` is called
- **THEN** `InvalidInputError` is thrown
- **AND** no workspace, schema, artifact, or persisted-state port is called

#### Scenario: Empty clear array throws InvalidInputError

- **WHEN** `execute({ specId, clear: [] })` is called
- **THEN** `InvalidInputError` is thrown
- **AND** no workspace, schema, artifact, or persisted-state port is called

### Requirement: Set captures a fresh baseline per changed field

#### Scenario: Changed field receives a freshly captured artifactState baseline

- **GIVEN** an existing persisted `optimizedDescription` with a stale baseline
- **WHEN** `execute({ specId, set: { optimizedDescription: 'updated' } })` is called
- **THEN** the new baseline reflects every current schema-declared `scope: spec` artifact's hash and `lastModified`, obtained via `artifactMeta()`

#### Scenario: Unchanged field retains its previous value and baseline

- **GIVEN** persisted state has both fields with distinct existing baselines
- **WHEN** `execute({ specId, set: { optimizedDescription: 'updated' } })` is called
- **THEN** `optimizedContext`'s value and baseline are unchanged by the call

#### Scenario: Recorded schema uses the current persisted schema when state already exists

- **GIVEN** persisted state already exists with schema `{ name: 'default', version: 1 }`
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** the new field's recorded `schema` equals `{ name: 'default', version: 1 }`

#### Scenario: Recorded schema uses the effective project schema when creating state

- **GIVEN** persisted state does not yet exist for the spec
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** the new field's recorded `schema` equals the effective project schema

### Requirement: Set creates missing persisted state

#### Scenario: First set call creates persisted state via resolveInitialPersistedDependsOn

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** an initial base is resolved through `resolveInitialPersistedDependsOn()`
- **AND** the optimization patch is applied on top of that initial base
- **AND** the result reports `created: true`

### Requirement: Clear removes selected fields

#### Scenario: Clearing an existing field removes only that field from the written state

- **GIVEN** persisted optimizations has both `optimizedDescription` and `optimizedContext`
- **WHEN** `execute({ specId, clear: ['optimizedContext'] })` is called
- **THEN** the state passed to `writePersistedState` has no `optimizedContext`
- **AND** its `optimizedDescription` value and baseline remain exactly unchanged
- **AND** the result reports only `optimizedDescription`

#### Scenario: Clearing an already-absent field preserves the written state

- **GIVEN** persisted optimizations has only `optimizedDescription`
- **WHEN** `execute({ specId, clear: ['optimizedContext'] })` is called
- **THEN** no error is thrown
- **AND** any state passed to `writePersistedState` contains the exact original `optimizedDescription`
- **AND** no `optimizedContext` is introduced

#### Scenario: Clearing the last remaining field omits the optimization block from the written state

- **GIVEN** persisted optimizations has only `optimizedDescription`
- **WHEN** `execute({ specId, clear: ['optimizedDescription'] })` is called
- **THEN** the state passed to `writePersistedState` has no `optimizations` key
- **AND** it is not written as an empty object
- **AND** the result has no `optimizations`

#### Scenario: Repository round trip preserves partial and final clear removals

- **GIVEN** a real writable `SpecRepository` contains persisted `optimizedDescription` and `optimizedContext`
- **WHEN** the use case clears `optimizedContext` and the repository state is read again
- **THEN** the reloaded state contains only the unchanged `optimizedDescription`
- **WHEN** the use case then clears `optimizedDescription` and the repository state is read again
- **THEN** the reloaded state has no `optimizations` key
- **AND** the assertions inspect reloaded persisted state rather than relying only on the use-case return value

### Requirement: Clear against missing persisted state is a no-op

#### Scenario: Clear on an uninitialized spec never creates persisted state

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, clear: ['optimizedDescription'] })` is called
- **THEN** `writePersistedState` is never called
- **AND** the result has no `optimizations` and `created: false`

### Requirement: Applying the mutation through the shared patch helper

#### Scenario: Write uses the observed originalHash as expectedRevision

- **GIVEN** persisted state exists with a known revision hash
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** `writePersistedState` is called with `expectedRevision` equal to the observed `originalHash`

#### Scenario: Write uses a null expectedRevision when creating state

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** `writePersistedState` is called with `expectedRevision: null`

### Requirement: Conflict handling

#### Scenario: Revision mismatch at write time propagates ArtifactConflictError

- **GIVEN** persisted state is modified concurrently between the read and the write
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** an `ArtifactConflictError` is thrown
- **AND** the use case does not retry or silently rebase the mutation

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws SpecNotFoundError

- **WHEN** `execute({ specId, set: { optimizedDescription: 'x' } })` is called for a spec identity with no existing artifact set in its workspace
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Result contract

#### Scenario: Result reports created true only when state was newly created

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** `result.created` is `true`

#### Scenario: Result reports created false for an already-initialized spec

- **GIVEN** persisted state already exists for the spec
- **WHEN** `execute({ specId, set: { optimizedContext: 'value' } })` is called
- **THEN** `result.created` is `false`

#### Scenario: Result omits optimizations when none remain after a clear

- **GIVEN** clearing removes the last remaining optimization field
- **WHEN** `execute({ specId, clear: ['optimizedDescription'] })` is called
- **THEN** `result.optimizations` is absent

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps

#### Scenario: Config factory derives exact dependencies through the resolver

- **WHEN** `createUpdatePersistedSpecOptimizations(config, options?)` is invoked
- **THEN** it creates one composition resolver for that composition session
- **AND** it derives `UpdatePersistedSpecOptimizationsDeps` through `resolveUpdatePersistedSpecOptimizationsDeps(resolver)`
- **AND** the resolved dependencies are `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, and `contentHasher`
- **AND** the factory delegates to canonical `createUpdatePersistedSpecOptimizations(deps)`
- **AND** it does not reconstruct filesystem-shaped dependencies inline

#### Scenario: Initial state creation remains behind the shared service

- **GIVEN** the config factory has resolved the established persisted-spec dependencies
- **WHEN** a set operation must create missing persisted state
- **THEN** initial dependencies are derived through `resolveInitialPersistedDependsOn()`
- **AND** `UpdatePersistedSpecOptimizationsDeps` does not require a separate `initializePersistedSpecState` collaborator
