# Verification: Get Persisted Spec Optimizations

## Requirements

### Requirement: Input contract

#### Scenario: Field filter restricts the result to a single field

- **GIVEN** a spec with both `optimizedDescription` and `optimizedContext` persisted
- **WHEN** `execute({ specId, field: 'optimizedDescription' })` is called
- **THEN** the result includes only `optimizedDescription`
- **AND** `optimizedContext` is omitted from the result entirely

#### Scenario: Omitting field returns every present optimization field

- **GIVEN** a spec with both `optimizedDescription` and `optimizedContext` persisted
- **WHEN** `execute({ specId })` is called without `field`
- **THEN** the result includes both fields

### Requirement: Reads persisted state through the repository port

#### Scenario: Query never materializes or reads generated metadata

- **GIVEN** a spec with stale generated metadata but fresh persisted optimizations
- **WHEN** `execute({ specId })` is called
- **THEN** the result is derived entirely from `readPersistedState` and `artifactMeta()`
- **AND** no metadata materialization or regeneration occurs
- **AND** `spec-lock.json` is not read directly

#### Scenario: Missing field has the explicit missing shape

- **GIVEN** persisted state has no `optimizedContext`
- **WHEN** `execute` is called with `field: 'optimizedContext'`
- **THEN** the result field is `{ freshness: 'missing', reasons: ['missing'] }` with no `value`, and `fresh` is `false`

#### Scenario: Filter with both fields present

- **GIVEN** both fields are persisted
- **WHEN** `execute` is called with `field: 'optimizedDescription'`
- **THEN** only that field is returned and, without the filter, both are

#### Scenario: Multiple reasons are ordered

- **GIVEN** a field whose baseline lost one artifact, gained another, and whose schema changed
- **WHEN** `execute` is called
- **THEN** its `reasons` list contains `artifact-removed`, `artifact-added`, and `schema-changed` in a stable order and `freshness` is `stale`

#### Scenario: Unknown spec throws SpecNotFoundError

- **WHEN** `execute` is called for a spec that does not exist in a valid workspace
- **THEN** `SpecNotFoundError` is thrown

#### Scenario: Generated metadata is never read

- **WHEN** `execute` succeeds
- **THEN** only `readPersistedState` and `artifactMeta` are called on the repository

#### Scenario: Factory derives deps from the resolver

- **WHEN** the config-based factory is invoked
- **THEN** its deps come from `resolveGetPersistedSpecOptimizationsDeps(resolver)`

### Requirement: Result contract for a spec with no persisted state

#### Scenario: Uninitialized spec returns initialized false without throwing

- **GIVEN** `readPersistedState` returns `null` for an existing spec
- **WHEN** `execute({ specId })` is called
- **THEN** the result has `initialized: false`
- **AND** `fresh: false`
- **AND** no optimization fields are present
- **AND** no error is thrown

### Requirement: Result contract for an initialized spec with no optimizations

#### Scenario: Initialized spec with no optimizations block returns an empty result

- **GIVEN** persisted state exists with no `optimizations` block
- **WHEN** `execute({ specId })` is called
- **THEN** the result has `initialized: true`
- **AND** no fields are present
- **AND** no error is thrown

#### Scenario: Requested field absent from persisted optimizations is reported as missing

- **GIVEN** persisted state has only `optimizedDescription`
- **WHEN** `execute({ specId, field: 'optimizedContext' })` is called
- **THEN** the result field `optimizedContext` is `{ freshness: 'missing', reasons: ['missing'] }` with no `value`
- **AND** no validation error is thrown

### Requirement: Per-field freshness computation

#### Scenario: Artifact added since baseline marks the field stale

- **GIVEN** the `optimizedDescription` baseline recorded only `spec.md`
- **AND** the spec's current `scope: spec` artifact set also includes `verify.md`
- **WHEN** `execute({ specId })` is called
- **THEN** the field's freshness is `stale` with reason `artifact-added`

#### Scenario: Artifact removed since baseline marks the field stale

- **GIVEN** the baseline included an artifact no longer declared by the schema's current `scope: spec` set
- **WHEN** `execute({ specId })` is called
- **THEN** the field's freshness is `stale` with reason `artifact-removed`

#### Scenario: Changed content hash marks the field stale

- **GIVEN** the baseline hash recorded for `spec.md` differs from its current content hash
- **WHEN** `execute({ specId })` is called
- **THEN** the field's freshness is `stale` with reason `artifact-changed`

#### Scenario: lastModified-only difference is diagnostic and does not affect freshness

- **GIVEN** every artifact's baseline hash equals its current hash
- **AND** an artifact's `lastModified` differs from the baseline
- **AND** the field's recorded schema equals the spec's current persisted schema
- **WHEN** `execute({ specId })` is called
- **THEN** the field's freshness is `fresh`
- **AND** no staleness reason is produced for the `lastModified` difference

#### Scenario: Schema change marks the field stale even when every artifact hash matches

- **GIVEN** every baseline artifact hash equals the current hash
- **AND** the field's recorded schema differs from the spec's current persisted schema identity
- **WHEN** `execute({ specId })` is called
- **THEN** the field's freshness is `stale` with reason `schema-changed`

### Requirement: Field result shape

#### Scenario: Stale field reports value, freshness, and an ordered reasons list

- **GIVEN** `optimizedContext` is stale due to both an artifact change and a schema change
- **WHEN** `execute({ specId })` is called
- **THEN** the field result includes `value`, `freshness: 'stale'`, and `reasons` containing both reasons in order

#### Scenario: Fresh field has an empty reasons list

- **GIVEN** `optimizedDescription` is fresh
- **WHEN** `execute({ specId })` is called
- **THEN** the field's `reasons` array is empty

### Requirement: Aggregate freshness

#### Scenario: Aggregate is fresh only when every present field is fresh

- **GIVEN** `optimizedDescription` is fresh and `optimizedContext` is stale
- **WHEN** `execute({ specId })` is called without a `field` filter
- **THEN** the top-level `fresh` is `false`

#### Scenario: Aggregate reflects only the requested field when filtered

- **GIVEN** `optimizedDescription` is stale and `optimizedContext` is fresh
- **WHEN** `execute({ specId, field: 'optimizedContext' })` is called
- **THEN** the top-level `fresh` is `true`

#### Scenario: No optimization fields present yields aggregate fresh false

- **GIVEN** persisted state exists with no `optimizations` block
- **WHEN** `execute({ specId })` is called
- **THEN** the top-level `fresh` is `false`

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unresolvable spec identity throws SpecNotFoundError

- **WHEN** `execute({ specId })` is called for a spec identity with no existing artifact set in its workspace
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps

#### Scenario: createGetPersistedSpecOptimizations config form derives deps through the resolver

- **WHEN** `createGetPersistedSpecOptimizations(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetPersistedSpecOptimizationsDeps` through `resolveGetPersistedSpecOptimizationsDeps(resolver)`
- **AND** `resolveGetPersistedSpecOptimizationsDeps(resolver)` resolves `specs: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createGetPersistedSpecOptimizations(deps)`

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
