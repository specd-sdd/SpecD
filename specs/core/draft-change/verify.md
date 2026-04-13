# Verification: DraftChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `DraftChange.execute` is called with a name that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Actor resolution

#### Scenario: Actor identity is recorded in the drafted event

- **WHEN** `DraftChange.execute` is called
- **THEN** the `drafted` event's `by` field matches the identity returned by `ActorResolver.identity()`

### Requirement: Historical implementation guard

#### Scenario: Historically implemented change is rejected by default

- **GIVEN** the loaded change has previously reached `implementing`
- **WHEN** `DraftChange.execute` is called without `force`
- **THEN** it fails without appending a `drafted` event
- **AND** the error explains that implementation may already exist and specs and code could be left out of sync

#### Scenario: Force bypasses the historical implementation guard

- **GIVEN** the loaded change has previously reached `implementing`
- **WHEN** `DraftChange.execute` is called with `force: true`
- **THEN** the use case succeeds
- **AND** it appends a `drafted` event

### Requirement: Drafted event appended to history

#### Scenario: Reason is included when provided

- **WHEN** `DraftChange.execute` is called with `reason: 'blocked on dependency'`
- **THEN** the last event in the change's history is a `drafted` event with `reason === 'blocked on dependency'`

#### Scenario: Reason is omitted when not provided

- **WHEN** `DraftChange.execute` is called without a `reason` field
- **THEN** the last event in the change's history is a `drafted` event without a `reason` property

#### Scenario: Change becomes drafted after execution

- **WHEN** `DraftChange.execute` returns a change
- **THEN** `change.isDrafted === true`

### Requirement: Persistence

#### Scenario: Change is persisted through serialized mutation

- **WHEN** `DraftChange.execute` completes successfully
- **THEN** `ChangeRepository.mutate(input.name, fn)` is called
- **AND** the callback records the drafted event on the fresh persisted `Change`
- **AND** the resulting change is relocated to the drafts area by the repository
