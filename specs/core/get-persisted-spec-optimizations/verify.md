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
- **THEN** the result omits `optimizedContext` and annotates it with reason `missing`
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
