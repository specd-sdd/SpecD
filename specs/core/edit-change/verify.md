# Verification: EditChange

## Requirements

### Requirement: Change lookup

#### Scenario: Change does not exist

- **WHEN** `execute` is called with a `name` that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: No-op when no spec changes requested

#### Scenario: Description provided with no spec changes

- **GIVEN** a change with description "Original description"
- **WHEN** `EditChange.execute` is called with description but no addSpecIds/removeSpecIds
- **THEN** the change description is updated
- **AND** `invalidated` returns `false`

#### Scenario: Both add and remove are absent

- **GIVEN** a change exists
- **WHEN** `EditChange.execute` is called with no addSpecIds, no removeSpecIds, no description
- **THEN** the use case returns unchanged change
- **AND** no mutation is performed

#### Scenario: Both add and remove are empty arrays

- **GIVEN** a change exists
- **WHEN** `EditChange.execute` is called with empty arrays for addSpecIds and removeSpecIds
- **THEN** the use case returns unchanged change
- **AND** no mutation is performed

#### Scenario: Description and addSpecIds together

- **GIVEN** a change with description "Original"
- **WHEN** `EditChange.execute` is called with both addSpecIds and description
- **THEN** both are applied atomically
- **AND** `invalidated` is `true` because specIds changed

#### Scenario: addSpecIds with no effective change

- **GIVEN** a change containing the spec already
- **WHEN** `EditChange.execute` is called adding a spec already in specIds
- **THEN** specIds unchanged (idempotent)
- **AND** `invalidated` is `false` because updateSpecIds was not called

### Requirement: Description update does not invalidate

#### Scenario: Description-only update does not invalidate

- **GIVEN** a change in spec-approved state with active spec approval
- **WHEN** `EditChange.execute` is called with only description
- **THEN** `invalidated` returns `false`
- **AND** the change remains in spec-approved state

### Requirement: Removal precedes addition

#### Scenario: Remove and add in same call

- **GIVEN** a change with `specIds: ['default:auth/login', 'default:billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['default:auth/login']` and `addSpecIds: ['default:auth/signup']`
- **THEN** the resulting `specIds` are `['default:billing/invoices', 'default:auth/signup']`
- **AND** `invalidated` is `true`

### Requirement: Removal of absent spec throws

#### Scenario: Removing a spec not in the change

- **GIVEN** a change with `specIds: ['default:auth/login']`
- **WHEN** `execute` is called with `removeSpecIds: ['default:billing/invoices']`
- **THEN** it throws `SpecNotInChangeError`

### Requirement: Addition is idempotent

#### Scenario: Adding a spec already present

- **GIVEN** a change with `specIds: ['default:auth/login']`
- **WHEN** `execute` is called with `addSpecIds: ['default:auth/login']`
- **THEN** `specIds` remains `['default:auth/login']`
- **AND** `invalidated` is `false`

### Requirement: Seed specDependsOn for added specs

#### Scenario: Persisted dependency state seeds new spec entry

- **GIVEN** a persisted spec being added to the change has semantic dependency state available through `readPersistedDependsOn(spec)`
- **WHEN** `EditChange.execute` adds that spec to the change
- **THEN** the seeded `change.specDependsOn` entry comes from that semantic persisted state

#### Scenario: Legacy metadata seeds when persisted semantic state is absent

- **GIVEN** a persisted spec being added has no semantic persisted dependency state
- **AND** `metadata.json.dependsOn` exists for that spec
- **WHEN** `EditChange.execute` adds that spec
- **THEN** the seeded `change.specDependsOn` entry comes from `metadata.json.dependsOn`

#### Scenario: Stale metadata still seeds as legacy fallback

- **GIVEN** a persisted spec being added has no semantic persisted dependency state
- **AND** `metadata.json.dependsOn` exists for that spec but the metadata is marked stale
- **WHEN** `EditChange.execute` adds that spec
- **THEN** the seeded `change.specDependsOn` entry still comes from the persisted metadata dependency list

#### Scenario: Existing in-change dependency snapshot is not overwritten

- **GIVEN** a spec is already present in the change
- **AND** `change.specDependsOn` already contains an entry for it
- **WHEN** later scope edits run
- **THEN** `EditChange` does not overwrite that existing dependency snapshot automatically

### Requirement: No-op when specIds unchanged after processing

#### Scenario: Remove and re-add the same spec

- **GIVEN** a change with `specIds: ['default:auth/login', 'default:billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['default:billing/invoices']` and `addSpecIds: ['default:billing/invoices']`
- **THEN** the resulting `specIds` are `['default:auth/login', 'default:billing/invoices']`
- **AND** `invalidated` is `false`

### Requirement: Approval invalidation on effective change

#### Scenario: Adding a new spec triggers invalidation

- **GIVEN** a change with `specIds: ['default:auth/login']`
- **WHEN** `execute` is called with `addSpecIds: ['default:billing/invoices']`
- **THEN** `change.updateSpecIds` is called with the new spec list and the resolved actor
- **AND** the change is persisted via `ChangeRepository.mutate(input.name, fn)`
- **AND** `invalidated` is `true`

#### Scenario: Removing a spec triggers invalidation

- **GIVEN** a change with `specIds: ['default:auth/login', 'default:billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['default:billing/invoices']`
- **THEN** `change.updateSpecIds` is called with `['default:auth/login']` and the resolved actor
- **AND** the change is persisted through the repository mutation callback
- **AND** `invalidated` is `true`

#### Scenario: Effective change is applied on the freshest persisted spec list

- **GIVEN** another operation updates the same change before the edit persistence step starts
- **WHEN** `EditChange.execute` performs its effective update
- **THEN** the mutation callback receives the freshest persisted `specIds`
- **AND** the edit is applied on top of that state instead of overwriting it with an older snapshot

### Requirement: Directory cleanup on removal

#### Scenario: Removing a spec cleans up its scaffolded directories

- **GIVEN** a change with `specIds: ['core:edit-change']` and scaffolded directories at `specs/core/core/edit-change/` and `deltas/core/core/edit-change/`
- **WHEN** `execute` is called with `removeSpecIds: ['core:edit-change']`
- **THEN** `ChangeRepository.unscaffold` is called with the removed spec IDs
- **AND** the directories `specs/core/core/edit-change/` and `deltas/core/core/edit-change/` are removed from the change directory

#### Scenario: Removing multiple specs cleans up all their directories

- **GIVEN** a change with `specIds: ['core:edit-change', 'core:change-repository-port']`
- **AND** scaffolded directories for both specs exist
- **WHEN** `execute` is called with `removeSpecIds: ['core:edit-change', 'core:change-repository-port']`
- **THEN** `ChangeRepository.unscaffold` is called with both removed spec IDs
- **AND** all corresponding directories are removed

#### Scenario: Adding a spec does not trigger unscaffold

- **GIVEN** a change with `specIds: ['core:edit-change']`
- **WHEN** `execute` is called with `addSpecIds: ['core:change-repository-port']`
- **THEN** `ChangeRepository.unscaffold` is NOT called

### Requirement: Implementation tracking refresh on spec change

#### Scenario: Spec removal triggers implementation tracking refresh

- **GIVEN** a change with confirmed implementation links and configured `refreshImplementationTracking`
- **WHEN** `EditChange.execute` is called removing a spec from `specIds`
- **THEN** `refreshImplementationTracking.execute({ name })` is invoked to sweep dangling links

### Requirement: Input contract

#### Scenario: execute accepts EditChangeInput

- **WHEN** `EditChange.execute` is called
- **THEN** it accepts `EditChangeInput` with `name` (required), `addSpecIds` (optional), `removeSpecIds` (optional), `description` (optional)

### Requirement: Invalidation policy edits

#### Scenario: Editing invalidationPolicy persists the new value

- **GIVEN** a change persisted with `invalidationPolicy: 'downstream'`
- **WHEN** `EditChange.execute` is called with `invalidationPolicy: 'none'`
- **THEN** the saved change uses `invalidationPolicy: 'none'`

#### Scenario: Editing invalidationPolicy does not invent drift

- **GIVEN** a file with `hasDrift: false`
- **WHEN** only `invalidationPolicy` is updated
- **THEN** `hasDrift` remains `false`

#### Scenario: Unknown invalidation policy rejected

- **GIVEN** a change exists
- **WHEN** `execute` is called with `invalidationPolicy: 'sugical'`
- **THEN** `InvalidInputError` is thrown quoting `sugical` and listing `none`, `surgical`, `downstream`, `global`
- **AND** nothing is persisted

#### Scenario: Invalid invalidation policy is rejected together with valid edits

- **GIVEN** a change exists
- **WHEN** `execute` is called with `description: 'x'` and `invalidationPolicy: 'bogus'`
- **THEN** `InvalidInputError` is thrown and the description is not changed

### Requirement: Output contract

#### Scenario: execute returns EditChangeResult

- **WHEN** `EditChange.execute` completes
- **THEN** it returns `EditChangeResult` with `change` (the Change entity) and `invalidated` (boolean)

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `EditChange` is instantiated
- **THEN** it requires a `ChangeRepository` port in its constructor

#### Scenario: Uses ActorResolver port

- **WHEN** `EditChange` is instantiated
- **THEN** it requires an `ActorResolver` port in its constructor

#### Scenario: Uses spec repositories map for existence checks and dependency seeding

- **WHEN** `EditChange` is instantiated
- **THEN** it requires a `ReadonlyMap<string, SpecRepository>` for spec existence checks and persisted dependency seeding

### Requirement: Config-based factory delegates through resolveEditChangeDeps

#### Scenario: createEditChange config form derives EditChangeDeps through resolveEditChangeDeps

- **WHEN** `createEditChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `EditChangeDeps` through `resolveEditChangeDeps(resolver)`
- **AND** `resolveEditChangeDeps(resolver)` resolves:
  - `changes: ChangeRepository`
  - `listWorkspaces: ListWorkspaces`
  - `actor: ActorResolver`
  - `schemaProvider: SchemaProvider`
  - `refreshImplementationTracking?: RefreshImplementationTracking`
- **AND** the factory delegates to canonical `createEditChange(deps)`

### Requirement: Schema compatibility guardrail

#### Scenario: Uninitialized spec fallback allows addition if global schema matches change

- **GIVEN** a spec with no persisted semantic state
- **WHEN** the spec is included in `addSpecIds` on a change using the global project schema
- **THEN** the edit succeeds

#### Scenario: Adding a spec with identical schema succeeds

- **GIVEN** a spec whose persisted schema identity matches the Change's schema name
- **WHEN** it is included in `addSpecIds`
- **THEN** the edit succeeds

#### Scenario: Adding a spec with a different but compatible schema succeeds

- **GIVEN** a spec whose persisted schema name is `schema-ui`
- **AND** the Change uses `schema-fullstack` which declares `compat` with `schema-ui`
- **WHEN** the spec is included in `addSpecIds`
- **THEN** the edit succeeds

#### Scenario: Adding a spec with an incompatible schema throws IncompatibleSchemaError

- **GIVEN** a spec whose persisted schema is `schema-api`
- **AND** the Change uses `schema-ui` (no compat mapping to `schema-api`)
- **WHEN** the spec is included in `addSpecIds`
- **THEN** the use case throws `IncompatibleSchemaError` and the change is not modified

### Requirement: Spec ID validation

#### Scenario: Invalid ID rejected and nothing persisted

- **WHEN** `addSpecIds: ['Bad Id']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting `Bad Id`
- **AND** the change is not modified

#### Scenario: Empty ID rejected

- **WHEN** `addSpecIds: ['']` is provided
- **THEN** the use case throws `InvalidSpecIdError`

#### Scenario: ID containing a comma is one invalid ID

- **WHEN** `addSpecIds: ['auth/a,b']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting `auth/a,b` and does not split it

#### Scenario: Unknown workspace rejected

- **WHEN** `addSpecIds: ['nope:auth/login']` is provided
- **THEN** the use case throws `WorkspaceNotFoundError`

#### Scenario: Bare ID stored qualified

- **WHEN** `addSpecIds: ['auth/login']` is provided
- **THEN** the change gains `default:auth/login`

#### Scenario: One invalid entry among valid ones

- **WHEN** `addSpecIds: ['core:storage', 'Bad Id']` is provided
- **THEN** the use case throws `InvalidSpecIdError` and `core:storage` is not added

#### Scenario: Spec that does not exist yet is accepted

- **WHEN** `addSpecIds: ['core:brand-new-spec']` is provided and the spec does not exist
- **THEN** the spec is added

#### Scenario: Removal entry is not syntax-validated

- **GIVEN** the change holds `default:auth/login`
- **WHEN** `removeSpecIds: ['Bad Id']` is provided
- **THEN** it fails with `SpecNotInChangeError` quoting `Bad Id`, not with `InvalidSpecIdError`

#### Scenario: Duplicate removal entries collapse

- **GIVEN** the change holds `default:auth/login` and `default:billing/invoices`
- **WHEN** `removeSpecIds: ['auth/login', 'default:auth/login']` is provided
- **THEN** `default:auth/login` is removed once
- **AND** no `SpecNotInChangeError` is raised

#### Scenario: Removal of a bare ID matches the qualified stored form

- **GIVEN** the change holds `default:auth/login`
- **WHEN** `removeSpecIds: ['auth/login']` is provided
- **THEN** the spec is removed

### Requirement: ReadOnly workspace rejection

#### Scenario: Adding a readOnly spec fails with the typed error

- **GIVEN** workspace `platform` has `ownership: readOnly`
- **WHEN** `addSpecIds: ['platform:auth/tokens']` is provided
- **THEN** the use case throws `ReadOnlyWorkspaceError`
- **AND** the message contains `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`
- **AND** no remediation step is suggested

#### Scenario: One line per offending spec and nothing applied

- **WHEN** `addSpecIds: ['default:auth/register', 'platform:a/b', 'platform:c/d']` is provided
- **THEN** the message has one line for each readOnly spec
- **AND** `default:auth/register` is not added

#### Scenario: Removal is not subject to ownership

- **WHEN** `removeSpecIds` names a spec in a readOnly workspace
- **THEN** the spec is removed without an ownership error

#### Scenario: SDK callers are covered

- **WHEN** an SDK caller adds a readOnly spec
- **THEN** the same rejection applies without the CLI
