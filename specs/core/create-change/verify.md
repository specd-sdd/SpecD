# Verification: CreateChange

## Requirements

### Requirement: Name uniqueness enforcement

#### Scenario: Change with duplicate name is rejected

- **GIVEN** a change named `'add-login'` already exists in the repository
- **WHEN** `CreateChange.execute` is called with `name: 'add-login'`
- **THEN** it throws `ChangeAlreadyExistsError`
- **AND** no change is persisted to the repository

#### Scenario: Change with unique name succeeds

- **GIVEN** no change named `'add-login'` exists in the repository
- **WHEN** `CreateChange.execute` is called with `name: 'add-login'`
- **THEN** it returns a `Change` with `name === 'add-login'`

### Requirement: Actor resolution

#### Scenario: Actor identity is recorded in the created event

- **WHEN** `CreateChange.execute` is called
- **THEN** the `created` event's `by` field matches the identity returned by `ActorResolver.identity()`

### Requirement: Initial history contains a single created event

#### Scenario: History contains exactly one created event

- **WHEN** `CreateChange.execute` returns a change
- **THEN** `change.history` has length 1
- **AND** `change.history[0].type === 'created'`
- **AND** the event contains `specIds`, `schemaName`, and `schemaVersion` matching the input

### Requirement: Change construction

#### Scenario: Description is included when provided

- **WHEN** `CreateChange.execute` is called with `description: 'OAuth support'`
- **THEN** the returned change has `description === 'OAuth support'`

#### Scenario: Description is omitted when not provided

- **WHEN** `CreateChange.execute` is called without a `description` field
- **THEN** the returned change has `description === undefined`

#### Scenario: Initial state is drafting

- **WHEN** `CreateChange.execute` returns a change
- **THEN** `change.state === 'drafting'`

### Requirement: Persistence

#### Scenario: Change is saved to repository

- **WHEN** `CreateChange.execute` completes successfully
- **THEN** `ChangeRepository.save` was called with the returned `Change` instance
