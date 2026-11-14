# Verification: UpdateSpecDeps

## Requirements

### Requirement: Input contract

#### Scenario: execute accepts UpdateSpecDepsInput

- **WHEN** `UpdateSpecDeps.execute` is called
- **THEN** it accepts `UpdateSpecDepsInput` with `name` (required), `specId` (required), `add` (optional), `remove` (optional), `set` (optional)

#### Scenario: Input accepts clear

- **WHEN** `UpdateSpecDeps.execute` is called with `clear: true`
- **THEN** the input is accepted as a valid operation

#### Scenario: One-shot workspace iterable supports repeated execution

- **GIVEN** `UpdateSpecDeps` is constructed with `Map.keys()` as its configured workspaces
- **WHEN** `execute` is called twice with valid dependency updates
- **THEN** both calls validate the workspace names and succeed

### Requirement: Change lookup

#### Scenario: Change does not exist

- **WHEN** `execute` is called with a `name` that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Spec must belong to the change

#### Scenario: Spec ID not in change

- **GIVEN** a change with `specIds: ['default:auth/login']`
- **WHEN** `execute` is called with `specId: 'default:billing/invoices'`
- **THEN** it throws an `InvalidInputError` indicating the spec is not in the change

### Requirement: Mutual exclusivity of set vs add/remove

#### Scenario: Set used together with add

- **WHEN** `execute` is called with both `set` and `add` provided
- **THEN** it throws an `Error` stating `set` is mutually exclusive with `add` and `remove`

#### Scenario: Set used together with remove

- **WHEN** `execute` is called with both `set` and `remove` provided
- **THEN** it throws an `Error` stating `set` is mutually exclusive with `add` and `remove`

#### Scenario: clear with set rejected

- **WHEN** `clear: true` and `set: ['core:storage']` are both provided
- **THEN** the use case throws a typed error and stores nothing

#### Scenario: clear with add or remove rejected

- **WHEN** `clear: true` is combined with `add` or with `remove`
- **THEN** the use case throws a typed error

#### Scenario: add and remove together still allowed

- **WHEN** `add` and `remove` are provided together without `set` or `clear`
- **THEN** the call succeeds and removals are applied before additions

#### Scenario: Same ID in remove and add ends up present

- **GIVEN** the spec has dependencies `['default:core/a', 'default:core/b']`
- **WHEN** `remove: ['default:core/a']` and `add: ['default:core/a']` are provided
- **THEN** removals are applied before additions and the resulting `dependsOn` is `['default:core/b', 'default:core/a']`

### Requirement: At least one operation required

#### Scenario: No operation specified

- **WHEN** `execute` is called with none of `add`, `remove`, or `set`
- **THEN** it throws an `Error` indicating at least one operation must be provided

#### Scenario: clear alone satisfies the minimum operation

- **WHEN** only `clear: true` is provided
- **THEN** no missing-operation error is thrown

### Requirement: Set replaces all dependencies

#### Scenario: Set overwrites existing dependencies

- **GIVEN** a change where spec `'default:auth/login'` has dependencies `['default:core/session']`
- **WHEN** `execute` is called with `set: ['default:billing/invoices', 'default:core/config']`
- **THEN** the resulting `dependsOn` is `['default:billing/invoices', 'default:core/config']`

#### Scenario: Set with empty array clears dependencies

- **GIVEN** a change where spec `'default:auth/login'` has dependencies `['default:core/session']`
- **WHEN** `execute` is called with `set: []`
- **THEN** the resulting `dependsOn` is `[]`

#### Scenario: set with an empty string stores nothing

- **GIVEN** the spec has dependencies `core:storage`
- **WHEN** `set: ['']` is provided
- **THEN** the use case throws `InvalidSpecIdError`
- **AND** the stored dependencies are still `core:storage`

### Requirement: Remove validates existence

#### Scenario: Removing a dependency not in current deps

- **GIVEN** a change where spec `'default:auth/login'` has dependencies `['default:core/session']`
- **WHEN** `execute` is called with `remove: ['default:billing/invoices']`
- **THEN** it throws an `InvalidInputError` indicating the dependency was not found

### Requirement: Add is idempotent

#### Scenario: Adding a dependency already present

- **GIVEN** a change where spec `'default:auth/login'` has dependencies `['default:core/session']`
- **WHEN** `execute` is called with `add: ['default:core/session']`
- **THEN** the resulting `dependsOn` is `['default:core/session']` (no duplicate)

### Requirement: Remove is applied before add

#### Scenario: Remove and add in same call

- **GIVEN** a change where spec `'default:auth/login'` has dependencies `['default:core/session', 'default:core/config']`
- **WHEN** `execute` is called with `remove: ['default:core/session']` and `add: ['default:billing/invoices']`
- **THEN** the resulting `dependsOn` is `['default:core/config', 'default:billing/invoices']`

### Requirement: Persistence and output

#### Scenario: Change is persisted and result returned through serialized mutation

- **GIVEN** a successful update operation
- **WHEN** `execute` completes
- **THEN** `change.setSpecDependsOn` is called with the spec ID and computed dependency list
- **AND** `ChangeRepository.mutate(input.name, fn)` is called
- **AND** the returned `UpdateSpecDepsResult` contains both `specId` and `dependsOn`

#### Scenario: Dependencies with no prior state

- **GIVEN** a change where spec `'default:auth/login'` has no existing `specDependsOn` entry
- **WHEN** `execute` is called with `add: ['default:core/session']`
- **THEN** the resulting `dependsOn` is `['default:core/session']`

### Requirement: Typed errors for dependency update failures

#### Scenario: Mutually exclusive operations throw host-neutral validation error

- **WHEN** `UpdateSpecDeps` is called with both `set` and `add`
- **THEN** `InvalidInputError` is thrown with code `INVALID_INPUT`
- **AND** `error.message` references `set`/`add` without `--` CLI flag prefixes

#### Scenario: Missing operation throws host-neutral validation error

- **WHEN** `UpdateSpecDeps` is called with none of `add`, `remove`, `set`, or `clear`
- **THEN** `InvalidInputError` is thrown with a host-neutral message without `--` CLI flag prefixes

#### Scenario: Dependency not found throws error

- **GIVEN** a spec has `dependsOn: ['core:existing']`
- **WHEN** `UpdateSpecDeps` is called to remove `'core:non-existent'`
- **THEN** a typed error is thrown
- **AND** the message indicates which dependency was not found

### Requirement: Config-based factory delegates through resolveUpdateSpecDepsDeps

#### Scenario: createUpdateSpecDeps config form derives UpdateSpecDepsDeps through resolveUpdateSpecDepsDeps

- **WHEN** `createUpdateSpecDeps(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdateSpecDepsDeps` through `resolveUpdateSpecDepsDeps(resolver)`
- **AND** `resolveUpdateSpecDepsDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createUpdateSpecDeps(deps)`

#### Scenario: resolveUpdateSpecDepsDeps resolves the workspace set

- **WHEN** `resolveUpdateSpecDepsDeps(resolver)` is called
- **THEN** the result includes `changes` and the configured workspaces used to validate spec IDs

### Requirement: Clear removes all dependencies

#### Scenario: clear empties the list

- **GIVEN** the spec has dependencies `core:storage` and `core:config`
- **WHEN** `clear: true` is provided
- **THEN** the result `dependsOn` is `[]`
- **AND** the change is persisted

#### Scenario: clear on an already empty list

- **GIVEN** the spec has no dependencies
- **WHEN** `clear: true` is provided
- **THEN** the call succeeds with `dependsOn: []`

#### Scenario: Use case asks for no confirmation

- **WHEN** `clear: true` is provided through the SDK
- **THEN** the use case clears without prompting

#### Scenario: Clear with no prior dependency state

- **GIVEN** the change has no `specDependsOn` entry for the spec
- **WHEN** `clear: true` is provided
- **THEN** the call succeeds with `dependsOn: []`

#### Scenario: Invalid-input errors carry the INVALID_INPUT code

- **WHEN** `set` and `add` are provided together
- **THEN** the thrown error is an `InvalidInputError` whose `code` is `INVALID_INPUT`

### Requirement: Spec ID validation

#### Scenario: Blank dependency rejected on add

- **WHEN** `add: [' ']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting the value
- **AND** nothing is stored

#### Scenario: Malformed dependency rejected on set

- **WHEN** `set: [':', 'ws:']` is provided
- **THEN** the use case throws `InvalidSpecIdError` and stores nothing

#### Scenario: Unknown workspace rejected

- **WHEN** `add: ['nope:auth/login']` is provided
- **THEN** the use case throws `WorkspaceNotFoundError`

#### Scenario: Dependency on a spec that does not exist yet is accepted

- **GIVEN** `core:brand-new-spec` does not exist and is not yet in the repository
- **WHEN** `add: ['core:brand-new-spec']` is provided
- **THEN** the dependency is stored without error

#### Scenario: Bare dependency is stored qualified

- **WHEN** `add: ['auth/login']` is provided
- **THEN** the stored dependency is `default:auth/login`

#### Scenario: One invalid entry among valid ones stores nothing

- **WHEN** `add: ['core:storage', 'Bad Id']` is provided
- **THEN** the use case throws `InvalidSpecIdError`
- **AND** `core:storage` is not stored

#### Scenario: Remove can delete an invalid stored value

- **GIVEN** the stored dependencies contain an invalid value `Bad Id`
- **WHEN** `remove: ['Bad Id']` is provided
- **THEN** the value is removed without a syntax error

#### Scenario: Same behavior through the SDK

- **WHEN** an SDK caller passes the same invalid values
- **THEN** the same typed errors are thrown, since validation lives in the use case

#### Scenario: Remove normalizes a bare valid ID

- **GIVEN** the spec's stored dependencies contain `default:auth/session`
- **WHEN** `remove: ['auth/session']` is provided
- **THEN** `default:auth/session` is removed

#### Scenario: Remove entry that is not a valid ID is matched literally

- **GIVEN** the stored dependencies contain the literal value `Bad Id`
- **WHEN** `remove: ['Bad Id']` is provided
- **THEN** the value is removed and no `InvalidSpecIdError` is thrown

#### Scenario: Comma-containing dependency is one invalid ID

- **WHEN** `add: ['core:a,b']` is provided
- **THEN** the use case throws `InvalidSpecIdError` quoting the whole value `core:a,b` and does not split it
- **AND** nothing is stored
