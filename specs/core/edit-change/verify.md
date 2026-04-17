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

- **GIVEN** a change with `specIds: ['auth/login', 'billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['auth/login']` and `addSpecIds: ['auth/signup']`
- **THEN** the resulting `specIds` are `['billing/invoices', 'auth/signup']`
- **AND** `invalidated` is `true`

### Requirement: Removal of absent spec throws

#### Scenario: Removing a spec not in the change

- **GIVEN** a change with `specIds: ['auth/login']`
- **WHEN** `execute` is called with `removeSpecIds: ['billing/invoices']`
- **THEN** it throws `SpecNotInChangeError`

### Requirement: Addition is idempotent

#### Scenario: Adding a spec already present

- **GIVEN** a change with `specIds: ['auth/login']`
- **WHEN** `execute` is called with `addSpecIds: ['auth/login']`
- **THEN** `specIds` remains `['auth/login']`
- **AND** `invalidated` is `false`

### Requirement: No-op when specIds unchanged after processing

#### Scenario: Remove and re-add the same spec

- **GIVEN** a change with `specIds: ['auth/login', 'billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['billing/invoices']` and `addSpecIds: ['billing/invoices']`
- **THEN** the resulting `specIds` are `['auth/login', 'billing/invoices']`
- **AND** `invalidated` is `false`

### Requirement: Approval invalidation on effective change

#### Scenario: Adding a new spec triggers invalidation

- **GIVEN** a change with `specIds: ['auth/login']`
- **WHEN** `execute` is called with `addSpecIds: ['billing/invoices']`
- **THEN** `change.updateSpecIds` is called with the new spec list and the resolved actor
- **AND** the change is persisted via `ChangeRepository.mutate(input.name, fn)`
- **AND** `invalidated` is `true`

#### Scenario: Removing a spec triggers invalidation

- **GIVEN** a change with `specIds: ['auth/login', 'billing/invoices']`
- **WHEN** `execute` is called with `removeSpecIds: ['billing/invoices']`
- **THEN** `change.updateSpecIds` is called with `['auth/login']` and the resolved actor
- **AND** the change is persisted through the repository mutation callback
- **AND** `invalidated` is `true`

#### Scenario: Effective change is applied on the freshest persisted spec list

- **GIVEN** another operation updates the same change before the edit persistence step starts
- **WHEN** `EditChange.execute` performs its effective update
- **THEN** the mutation callback receives the freshest persisted `specIds`
- **AND** the edit is applied on top of that state instead of overwriting it with an older snapshot

### Requirement: Directory cleanup on removal

#### Scenario: Removing a spec cleans up its scaffolded directories

- **GIVEN** a change with `specIds: ['core:core/edit-change']` and scaffolded directories at `specs/core/core/edit-change/` and `deltas/core/core/edit-change/`
- **WHEN** `execute` is called with `removeSpecIds: ['core:core/edit-change']`
- **THEN** `ChangeRepository.unscaffold` is called with the removed spec IDs
- **AND** the directories `specs/core/core/edit-change/` and `deltas/core/core/edit-change/` are removed from the change directory

#### Scenario: Removing multiple specs cleans up all their directories

- **GIVEN** a change with `specIds: ['core:core/edit-change', 'core:core/change-repository-port']`
- **AND** scaffolded directories for both specs exist
- **WHEN** `execute` is called with `removeSpecIds: ['core:core/edit-change', 'core:core/change-repository-port']`
- **THEN** `ChangeRepository.unscaffold` is called with both removed spec IDs
- **AND** all corresponding directories are removed

#### Scenario: Adding a spec does not trigger unscaffold

- **GIVEN** a change with `specIds: ['core:core/edit-change']`
- **WHEN** `execute` is called with `addSpecIds: ['core:core/change-repository-port']`
- **THEN** `ChangeRepository.unscaffold` is NOT called
