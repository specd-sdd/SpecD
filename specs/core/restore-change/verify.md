# Verification: RestoreChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `RestoreChange.execute` is called with a name that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Actor resolution

#### Scenario: Actor identity is recorded in the restored event

- **WHEN** `RestoreChange.execute` is called
- **THEN** the `restored` event's `by` field matches the identity returned by `ActorResolver.identity()`

### Requirement: Restored event appended to history

#### Scenario: Change is no longer drafted after restore

- **GIVEN** a change that has been drafted (`isDrafted === true`)
- **WHEN** `RestoreChange.execute` is called with its name
- **THEN** the returned change has `isDrafted === false`

#### Scenario: Restored event is appended to history

- **WHEN** `RestoreChange.execute` returns a change
- **THEN** the last event in the change's history is a `restored` event

### Requirement: Persistence

#### Scenario: Change is saved to repository

- **WHEN** `RestoreChange.execute` completes successfully
- **THEN** `ChangeRepository.save` was called with the updated `Change` instance
