# Verification: UpdateSpecDeps

## Requirements

### Requirement: Change lookup

#### Scenario: Change does not exist

- **WHEN** `execute` is called with a `name` that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Spec must belong to the change

#### Scenario: Spec ID not in change

- **GIVEN** a change with `specIds: ['auth/login']`
- **WHEN** `execute` is called with `specId: 'billing/invoices'`
- **THEN** it throws an `Error` indicating the spec is not in the change

### Requirement: Mutual exclusivity of set vs add/remove

#### Scenario: Set used together with add

- **WHEN** `execute` is called with both `set` and `add` provided
- **THEN** it throws an `Error` stating `set` is mutually exclusive with `add` and `remove`

#### Scenario: Set used together with remove

- **WHEN** `execute` is called with both `set` and `remove` provided
- **THEN** it throws an `Error` stating `set` is mutually exclusive with `add` and `remove`

### Requirement: At least one operation required

#### Scenario: No operation specified

- **WHEN** `execute` is called with none of `add`, `remove`, or `set`
- **THEN** it throws an `Error` indicating at least one operation must be provided

### Requirement: Set replaces all dependencies

#### Scenario: Set overwrites existing dependencies

- **GIVEN** a change where spec `'auth/login'` has dependencies `['core/session']`
- **WHEN** `execute` is called with `set: ['billing/invoices', 'core/config']`
- **THEN** the resulting `dependsOn` is `['billing/invoices', 'core/config']`

#### Scenario: Set with empty array clears dependencies

- **GIVEN** a change where spec `'auth/login'` has dependencies `['core/session']`
- **WHEN** `execute` is called with `set: []`
- **THEN** the resulting `dependsOn` is `[]`

### Requirement: Remove validates existence

#### Scenario: Removing a dependency not in current deps

- **GIVEN** a change where spec `'auth/login'` has dependencies `['core/session']`
- **WHEN** `execute` is called with `remove: ['billing/invoices']`
- **THEN** it throws an `Error` indicating the dependency was not found

### Requirement: Add is idempotent

#### Scenario: Adding a dependency already present

- **GIVEN** a change where spec `'auth/login'` has dependencies `['core/session']`
- **WHEN** `execute` is called with `add: ['core/session']`
- **THEN** the resulting `dependsOn` is `['core/session']` (no duplicate)

### Requirement: Remove is applied before add

#### Scenario: Remove and add in same call

- **GIVEN** a change where spec `'auth/login'` has dependencies `['core/session', 'core/config']`
- **WHEN** `execute` is called with `remove: ['core/session']` and `add: ['billing/invoices']`
- **THEN** the resulting `dependsOn` is `['core/config', 'billing/invoices']`

### Requirement: Persistence and output

#### Scenario: Change is persisted and result returned through serialized mutation

- **GIVEN** a successful update operation
- **WHEN** `execute` completes
- **THEN** `change.setSpecDependsOn` is called with the spec ID and computed dependency list
- **AND** `ChangeRepository.mutate(input.name, fn)` is called
- **AND** the returned `UpdateSpecDepsResult` contains both `specId` and `dependsOn`

#### Scenario: Dependencies with no prior state

- **GIVEN** a change where spec `'auth/login'` has no existing `specDependsOn` entry
- **WHEN** `execute` is called with `add: ['core/session']`
- **THEN** the resulting `dependsOn` is `['core/session']`
