# Verification: RestoreChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent drafted change is rejected

- **WHEN** `RestoreChange.execute` is called with a name that does not exist under `drafts/`
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Active-only name is rejected

- **GIVEN** a change exists only under `changes/` (not drafted)
- **WHEN** `RestoreChange.execute` is called with its name
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Discarded-only name is rejected

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `RestoreChange.execute` is called with its name
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

#### Scenario: Change is persisted through serialized mutation

- **WHEN** `RestoreChange.execute` completes successfully
- **THEN** `ChangeRepository.mutateDraft(input.name, fn)` is called
- **AND** the callback records the restored event on the fresh persisted drafted `Change`
- **AND** the resulting change is relocated back to `changes/` with `isDrafted === false`

### Requirement: Input contract

#### Scenario: execute accepts RestoreChangeInput

- **WHEN** `RestoreChange.execute` is called
- **THEN** it accepts `RestoreChangeInput` with `name` (required string)

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `RestoreChange` is instantiated
- **THEN** it requires a `ChangeRepository` port in its constructor

#### Scenario: Uses ActorResolver port

- **WHEN** `RestoreChange` is instantiated
- **THEN** it requires an `ActorResolver` port in its constructor
