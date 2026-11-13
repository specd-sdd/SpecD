# Verification: Update Persisted Spec Schema

## Requirements

### Requirement: Input contract

#### Scenario: schemaRef is always explicit, unlike initialization

- **GIVEN** a project with an effective project schema configured
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** the target schema is resolved solely from the given `schemaRef`
- **AND** the effective project schema is never consulted as a fallback

### Requirement: Requires an existing lock; never creates one

#### Scenario: Uninitialized spec throws SpecNotInitializedError

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** a `SpecNotInitializedError` identifying `specId` is thrown
- **AND** no persisted state is created

#### Scenario: Never delegates to InitializePersistedSpecState or initial-base construction

- **GIVEN** a spec with no persisted state
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** `InitializePersistedSpecState` is never invoked
- **AND** no initial-base derivation occurs

### Requirement: Unknown spec fails with a typed error

#### Scenario: Unknown spec throws SpecNotFoundError before the initialization check

- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called for a spec identity with no existing artifact set in its workspace
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Resolving the target schema

#### Scenario: Target schema is resolved in ref mode without project overrides

- **GIVEN** a project with plugins and overrides configured for schema resolution
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** `GetActiveSchema` is invoked with `{ mode: 'ref', ref: schemaRef }`
- **AND** project plugins or overrides beyond ref-mode resolution are not applied

### Requirement: Loading and parsing declared artifacts under the target schema

#### Scenario: Parse failure under the target schema aborts without mutation

- **GIVEN** the spec's current artifacts do not parse successfully under the resolved target schema
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** a typed error is thrown
- **AND** persisted state is not mutated

### Requirement: Selecting the already-persisted schema is a no-op

#### Scenario: Target schema equals the currently persisted schema

- **GIVEN** persisted state has `schema: { name: 'default', version: 1 }`
- **WHEN** `execute({ specId, schemaRef: 'default@1' })` is called
- **THEN** dependency-conflict validation is skipped
- **AND** `writePersistedState` is never called
- **AND** `result.changed` is `false`
- **AND** `result.schema` equals the unchanged current schema identity

### Requirement: Dependency compatibility when the target schema does not extract dependencies

#### Scenario: Current dependsOn is preserved unchanged

- **GIVEN** the target schema declares no dependency extraction for the spec's artifacts
- **AND** persisted `dependsOn` is `['core:a', 'core:b']`
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds
- **THEN** the reassigned state's `dependsOn` is unchanged (`['core:a', 'core:b']`)

### Requirement: Dependency compatibility when the target schema extracts dependencies

#### Scenario: Extracted dependencies equal to the current list allow reassignment to proceed

- **GIVEN** the target schema extracts a dependency list equal to the persisted `dependsOn`
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** reassignment proceeds using the current `dependsOn` value unchanged

#### Scenario: Extracted dependencies differing from the current list throw a conflict error

- **GIVEN** the target schema extracts a dependency list different from the persisted `dependsOn`
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** a `PersistedSchemaDependencyConflictError` identifying `specId`, the current dependencies, and the extracted dependencies is thrown
- **AND** persisted state is not mutated
- **AND** the extracted value is never silently adopted

### Requirement: Implementation and optimization values are preserved verbatim

#### Scenario: Implementation links and optimizations survive reassignment unchanged

- **GIVEN** persisted state has implementation links and an `optimizedDescription` field with a recorded baseline
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds
- **THEN** the resulting persisted state has the same implementation links
- **AND** the same `optimizedDescription` value and `artifactState` baseline, unmodified

#### Scenario: A successful reassignment makes existing optimizations stale via freshness computation, not special-casing

- **GIVEN** persisted state has a fresh `optimizedContext` field baselined against the old schema
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds with a different schema
- **THEN** a subsequent `GetPersistedSpecOptimizations` call reports `optimizedContext` as stale with reason `schema-changed`
- **AND** `UpdatePersistedSpecSchema` itself performs no optimization re-baselining or invalidation logic

### Requirement: Constructing and writing the reassigned state

#### Scenario: Complete state is constructed directly, bypassing applyPersistedSpecStatePatch for the schema field

- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds with a schema change
- **THEN** the resulting `PersistedSpecState` is constructed directly with the new `schema`, the resolved `dependsOn`, and the preserved `implementation`/`optimizations`
- **AND** the generic `applyPersistedSpecStatePatch()` helper is not used to change `schema`

#### Scenario: Write uses the originalHash observed by the initial read as expectedRevision

- **GIVEN** persisted state exists with a known revision hash
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds
- **THEN** `writePersistedState` is called with `expectedRevision` equal to the `originalHash` observed by the initial `readPersistedState` call

#### Scenario: Reassignment succeeds and preserves other state

- **GIVEN** an initialized spec with `implementation` and `optimizations`
- **WHEN** a different compatible schema is selected
- **THEN** the result has `changed: true` and the new schema identity
- **AND** `implementation` and `optimizations` are written verbatim

#### Scenario: Same schema is a no-op

- **WHEN** the resolved schema equals the persisted one
- **THEN** `changed` is `false`, `writePersistedState` is not called, and dependency conflict validation is skipped

#### Scenario: Target schema resolved in ref mode

- **WHEN** the use case resolves the target schema
- **THEN** `GetActiveSchema.execute` is called with `{ mode: 'ref', ref }` and no project fallback

#### Scenario: Parse failure aborts without mutation, even without dependency extraction

- **GIVEN** the target schema declares no dependency extraction and a canonical artifact does not parse under it
- **WHEN** the schema is selected
- **THEN** a typed error is thrown and `writePersistedState` is not called

#### Scenario: Dependencies preserved when the target does not extract them

- **WHEN** the target schema declares no dependency extraction
- **THEN** the written `dependsOn` equals the current `dependsOn`

#### Scenario: Extracted dependencies equal the current ones

- **WHEN** the target schema extracts a list equal to the current `dependsOn`
- **THEN** reassignment proceeds with the current value

#### Scenario: Extracted dependencies differ

- **WHEN** the extracted list differs from the current `dependsOn`
- **THEN** `PersistedSchemaDependencyConflictError` is thrown with `specId`, current, and extracted lists and nothing is written

#### Scenario: Optimizations become stale after reassignment

- **WHEN** reassignment succeeds
- **THEN** the optimizations remain stored and freshness reports `schema-changed`

#### Scenario: Revision, conflict, unknown spec, and readOnly

- **WHEN** schema reassignment is requested
- **THEN** the write carries `expectedRevision` equal to the observed `originalHash`, an `ArtifactConflictError` is rethrown, an unknown spec fails with `SpecNotFoundError` before the initialization check, and a `readOnly` workspace fails with `ReadOnlyWorkspaceError`

#### Scenario: Factory resolves collaborators

- **WHEN** the config-based factory is invoked
- **THEN** its deps come from the resolver helper and include `specs` and `getActiveSchema`

### Requirement: Conflict handling

#### Scenario: Revision mismatch at write time propagates ArtifactConflictError

- **GIVEN** persisted state is modified concurrently between the read and the write
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` is called
- **THEN** an `ArtifactConflictError` is thrown
- **AND** the use case does not retry or silently rebase the reassignment

### Requirement: Result contract

#### Scenario: Successful reassignment reports changed true with the new schema and dependsOn

- **GIVEN** a schema reassignment that differs from the current schema
- **WHEN** `execute({ specId, schemaRef: 'other-schema@2' })` succeeds
- **THEN** `result.changed` is `true`
- **AND** `result.schema` equals the new schema identity
- **AND** `result.dependsOn` equals the resolved dependency list

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps

#### Scenario: createUpdatePersistedSpecSchema config form derives deps through the resolver

- **WHEN** `createUpdatePersistedSpecSchema(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdatePersistedSpecSchemaDeps` through `resolveUpdatePersistedSpecSchemaDeps(resolver)`
- **AND** `resolveUpdatePersistedSpecSchemaDeps(resolver)` resolves `specs: ReadonlyMap<string, SpecRepository>` and `getActiveSchema: GetActiveSchema`
- **AND** the factory delegates to canonical `createUpdatePersistedSpecSchema(deps)`

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
