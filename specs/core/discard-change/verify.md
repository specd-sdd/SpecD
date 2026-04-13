# Verification: DiscardChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `DiscardChange.execute` is called with a name that does not exist in the repository
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Actor resolution

#### Scenario: Actor identity is recorded in the discarded event

- **WHEN** `DiscardChange.execute` is called
- **THEN** the `discarded` event's `by` field matches the identity returned by `ActorResolver.identity()`

### Requirement: Historical implementation guard

#### Scenario: Historically implemented change is rejected by default

- **GIVEN** the loaded change has previously reached `implementing`
- **WHEN** `DiscardChange.execute` is called without `force`
- **THEN** it fails without appending a `discarded` event
- **AND** the error explains that implementation may already exist and specs and code could be left out of sync

#### Scenario: Force bypasses the historical implementation guard

- **GIVEN** the loaded change has previously reached `implementing`
- **WHEN** `DiscardChange.execute` is called with `force: true`
- **THEN** the use case succeeds
- **AND** it appends a `discarded` event

### Requirement: Discarded event appended to history

#### Scenario: Reason is recorded in the discarded event

- **WHEN** `DiscardChange.execute` is called with `reason: 'no longer needed'`
- **THEN** the last event in the change's history is a `discarded` event with `reason === 'no longer needed'`

#### Scenario: SupersededBy is included when provided

- **WHEN** `DiscardChange.execute` is called with `supersededBy: ['new-auth-flow']`
- **THEN** the `discarded` event has `supersededBy` containing `'new-auth-flow'`

#### Scenario: SupersededBy is omitted when not provided

- **WHEN** `DiscardChange.execute` is called without a `supersededBy` field
- **THEN** the `discarded` event does not have a `supersededBy` property

### Requirement: Persistence

#### Scenario: Change is persisted through serialized mutation

- **WHEN** `DiscardChange.execute` completes successfully
- **THEN** `ChangeRepository.mutate(input.name, fn)` is called
- **AND** the callback records the discarded event on the fresh persisted `Change`
- **AND** the resulting change is relocated to the discarded area by the repository
