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

### Requirement: Mutual exclusivity and minimum operation

#### Scenario: Providing both set and clear throws a validation error

- **WHEN** `execute({ specId, set: { optimizedDescription: 'x' }, clear: ['optimizedContext'] })` is called
- **THEN** a typed validation error is thrown
- **AND** persisted state is not mutated

#### Scenario: Neither set nor clear throws a validation error

- **WHEN** `execute({ specId })` is called with neither `set` nor `clear`
- **THEN** a typed validation error is thrown

#### Scenario: Empty set object throws a validation error

- **WHEN** `execute({ specId, set: {} })` is called
- **THEN** a typed validation error is thrown

#### Scenario: Empty clear array throws a validation error

- **WHEN** `execute({ specId, clear: [] })` is called
- **THEN** a typed validation error is thrown

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

#### Scenario: Clearing an existing field removes only that field

- **GIVEN** persisted optimizations has both `optimizedDescription` and `optimizedContext`
- **WHEN** `execute({ specId, clear: ['optimizedContext'] })` is called
- **THEN** only `optimizedDescription` remains in persisted state

#### Scenario: Clearing an already-absent field is a silent no-op for that field

- **GIVEN** persisted optimizations has only `optimizedDescription`
- **WHEN** `execute({ specId, clear: ['optimizedContext'] })` is called
- **THEN** no error is thrown
- **AND** `optimizedDescription` remains unchanged

#### Scenario: Clearing the last remaining field omits the optimizations block entirely

- **GIVEN** persisted optimizations has only `optimizedDescription`
- **WHEN** `execute({ specId, clear: ['optimizedDescription'] })` is called
- **THEN** the resulting persisted state has no `optimizations` key at all
- **AND** it is not left as an empty object

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

#### Scenario: createUpdatePersistedSpecOptimizations config form derives deps through the resolver

- **WHEN** `createUpdatePersistedSpecOptimizations(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdatePersistedSpecOptimizationsDeps` through `resolveUpdatePersistedSpecOptimizationsDeps(resolver)`
- **AND** `resolveUpdatePersistedSpecOptimizationsDeps(resolver)` resolves `specs: ReadonlyMap<string, SpecRepository>` and an `initializePersistedSpecState` collaborator sufficient to invoke `resolveInitialPersistedDependsOn()`
- **AND** the factory delegates to canonical `createUpdatePersistedSpecOptimizations(deps)`
