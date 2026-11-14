# Verification: EditChange

## Requirements

### Requirement: Change lookup

#### Scenario: Change does not exist

- **WHEN** `execute` is called with a `name` that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: No-op when no spec changes requested

#### Scenario: Description provided with no spec changes

- **GIVEN** a change with description "Original description" and no separate input drift
- **WHEN** `EditChange.execute` receives only a new description
- **THEN** the description is updated and `scopeChanged`, `validityChanged`, and `invalidated` are false

#### Scenario: Both add and remove are absent

- **GIVEN** a current change with no separate drift or pending recovery
- **WHEN** `execute` receives no addSpecIds, removeSpecIds, description, or policy changes
- **THEN** it returns the unchanged change without a persistence-worthy mutation

#### Scenario: Both add and remove are empty arrays

- **GIVEN** a current change with no separate drift or pending recovery
- **WHEN** `execute` receives empty addSpecIds and removeSpecIds and no other edit
- **THEN** it returns the unchanged change without a persistence-worthy mutation

#### Scenario: Description and addSpecIds together without existing evidence

- **GIVEN** a change with no approval or completed verification evidence and no separate drift
- **WHEN** `execute` receives a new spec ID and description together
- **THEN** both edits are applied and `scopeChanged` is true
- **AND** `validityChanged` and its compatibility alias `invalidated` are false

#### Scenario: addSpecIds with no effective change

- **GIVEN** a current change already containing the spec with no separate input drift
- **WHEN** `execute` adds that same spec again
- **THEN** scope remains unchanged and `scopeChanged`, `validityChanged`, and `invalidated` are false

### Requirement: Description update does not invalidate

#### Scenario: Description-only update does not invalidate

- **GIVEN** a change in spec-approved state with active spec approval
- **WHEN** `EditChange.execute` is called with only description
- **THEN** `invalidated` returns `false`
- **AND** the change remains in spec-approved state

### Requirement: Removal precedes addition

Scenarios:

#### Scenario: Remove and add in same call

- **GIVEN** a change with `specIds: ['default:auth/login', 'default:billing/invoices']`, no approval or completed verification evidence, and no separate drift
- **WHEN** `execute` receives `removeSpecIds: ['default:auth/login']` and `addSpecIds: ['default:auth/signup']`
- **THEN** the resulting specIds are `['default:billing/invoices', 'default:auth/signup']` and `scopeChanged` is true
- **AND** `validityChanged` and `invalidated` are false because no existing evidence became invalid

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

Scenarios:

#### Scenario: Scope change reconciles fingerprints atomically

- **WHEN** effective spec scope changes
- **THEN** affected artifact review and evidence are updated in the same mutation
- **AND** required stale spec consent returns to design while ungated preserve retains state

#### Scenario: Scope change always affects spec consent but not unrelated evidence

- **WHEN** the canonical spec set changes but verification or sign-off inputs remain equal
- **THEN** spec approval becomes stale with explicit added or removed spec differences
- **AND** unaffected verification or sign-off remains unchanged with history retained

#### Scenario: Scope reordering is not a semantic change

- **WHEN** an edit only reorders or duplicates inputs that normalize to the approved canonical spec set
- **THEN** spec approval remains valid and no scope-change invalidation event is appended

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
- **WHEN** `EditChange.execute` removes a spec from canonical `specIds`
- **THEN** `refreshImplementationTracking.execute({ name })` sweeps dangling links

#### Scenario: Ungated preserve scope edit refreshes without validity change

- **GIVEN** a change with no existing approval or verification evidence and workflow `preserve`
- **WHEN** an edit adds a canonical spec ID
- **THEN** `scopeChanged` is true and tracking refresh runs
- **AND** `validityChanged` and the compatibility `invalidated` field may remain false

### Requirement: Input contract

#### Scenario: execute accepts EditChangeInput

- **WHEN** `EditChange.execute` is called
- **THEN** it accepts `EditChangeInput` with `name` (required), `addSpecIds` (optional), `removeSpecIds` (optional), `description` (optional)

### Requirement: Invalidation policy edits

Scenarios:

#### Scenario: Policy-only edit changes no current validity

- **WHEN** one structured policy dimension is edited without other input changes
- **THEN** the v2 policy is persisted without invented drift, review, or lifecycle movement

#### Scenario: Repeating the same policy is a no-op

- **WHEN** an edit supplies the already persisted structured policy
- **THEN** no persistence-worthy policy change or invalidation is reported

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

Scenarios:

#### Scenario: Result distinguishes edits from invalidation

- **WHEN** description or policy alone changes
- **THEN** output reports the edit without claiming projection invalidation unless fresh reconciliation found separate drift

#### Scenario: Scope edit reports committed recovery

- **WHEN** a scope edit changes evidence and triggers a return
- **THEN** result includes `scopeChanged`, actual validity change, affected files, projection changes, effective policy, blockers, next action, and automatic return

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `EditChange` is instantiated
- **THEN** it requires a `ChangeRepository` port in its constructor

#### Scenario: Uses ActorResolver port

- **WHEN** `EditChange` is instantiated
- **THEN** it requires an `ActorResolver` port in its constructor

#### Scenario: Uses ListWorkspaces for repository views and dependency seeding

- **WHEN** `EditChange` is instantiated through direct dependencies or the config factory
- **THEN** it receives `ListWorkspaces` and obtains the relevant `SpecRepository` views from it
- **AND** it does not require a separate `ReadonlyMap<string, SpecRepository>` constructor argument

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

#### Scenario: Uninitialized spec is compatible without consulting the global schema

- **GIVEN** a change whose `schemaName` is `custom-workflow`
- **AND** an added spec with no persisted semantic state
- **AND** a workspace default schema that is incompatible with `custom-workflow`
- **WHEN** `EditChange` validates the added spec
- **THEN** the spec is accepted as compatible
- **AND** `GetActiveSchema` and the workspace default are never consulted

### Requirement: Sovereign schema resolution

#### Scenario: Added-spec compatibility ignores a different workspace default

- **GIVEN** a change whose `schemaName` is `custom-workflow`
- **AND** the workspace default is another schema with incompatible compatibility declarations
- **WHEN** `EditChange` validates an added spec
- **THEN** it calls `SchemaProvider.get('custom-workflow')`
- **AND** decides compatibility using the custom schema only

#### Scenario: Serialized reconciliation owns artifact topology

- **GIVEN** the fresh change loaded inside `ChangeRepository.mutate` records `schemaName: 'custom-workflow'`
- **AND** the workspace default exposes a different artifact DAG
- **WHEN** `EditChange` applies the canonical scope edit
- **THEN** it updates the fresh entity through `replaceSpecIds()` and invokes `ctx.reconcileAfter()`
- **AND** it does not call `updateSpecIds()` or perform a second direct `SchemaProvider.get()` lookup
- **AND** the reconciler determines artifact topology and validity from the fresh persisted change

#### Scenario: Schema resolution failure leaves scope unchanged

- **GIVEN** the serialized mutation callback has invoked `replaceSpecIds()` on the fresh aggregate
- **WHEN** `ctx.reconcileAfter()` then rejects
- **THEN** the corresponding error propagates
- **AND** no partial scope mutation is persisted
- **AND** persisted spec IDs, history, artifact topology, and validity remain unchanged

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

### Requirement: Host-neutral SpecNotInChangeError

#### Scenario: SpecNotInChangeError omits CLI command syntax

- **WHEN** `EditChange` throws `SpecNotInChangeError` for an absent `specId`
- **THEN** `error.message` does not contain `specd specs show`
- **AND** `error.specId` and `error.changeName` are exposed as metadata properties
