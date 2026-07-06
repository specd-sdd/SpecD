# Verification: DraftChange

## Requirements

### Requirement: Change must exist

#### Scenario: Non-existent change is rejected

- **WHEN** `DraftChange.execute` is called with a name that does not exist in active storage
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Drafted-only name is rejected

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `DraftChange.execute` is called with its name
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Discarded-only name is rejected

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `DraftChange.execute` is called with its name
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

- **WHEN** `DraftChange.execute` returns
- **THEN** the result satisfies `DraftedChangeView`
- **AND** `result.isDrafted === true`

### Requirement: Persistence

#### Scenario: Change is persisted through serialized mutation

- **WHEN** `DraftChange.execute` completes successfully
- **THEN** `ChangeRepository.mutate(input.name, fn)` is called
- **AND** the callback records the drafted event on the fresh persisted `Change`
- **AND** the resulting change is relocated to the drafts area by the repository

#### Scenario: Result is not a mutable Change

- **GIVEN** an active change is drafted successfully
- **WHEN** `DraftChange.execute` returns
- **THEN** the return value is not an instance of domain `Change`

#### Scenario: Result is loadable via getDraft after execute

- **GIVEN** `DraftChange.execute` returns a view for name `parked-feature`
- **WHEN** `ChangeRepository.getDraft('parked-feature')` is called
- **THEN** a `DraftedChangeView` is returned with `isDrafted === true`

#### Scenario: mutate relocates before view mapping

- **GIVEN** an active change named `parked-feature`
- **WHEN** `DraftChange.execute` completes
- **THEN** `ChangeRepository.mutate` was called for that name
- **AND** the change directory exists under `drafts/` after completion

### Requirement: Input contract

#### Scenario: execute accepts DraftChangeInput

- **WHEN** `DraftChange.execute` is called
- **THEN** it accepts `DraftChangeInput` with `name` (required), `reason` (optional), `force` (optional)

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `DraftChange` is instantiated
- **THEN** it requires a `ChangeRepository` port in its constructor

#### Scenario: Uses ActorResolver port

- **WHEN** `DraftChange` is instantiated
- **THEN** it requires an `ActorResolver` port in its constructor

### Requirement: Config-based factory delegates through resolveDraftChangeDeps

#### Scenario: createDraftChange config form derives DraftChangeDeps through resolveDraftChangeDeps

- **WHEN** `createDraftChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `DraftChangeDeps` through `resolveDraftChangeDeps(resolver)`
- **AND** `resolveDraftChangeDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `actor: ActorResolver`
- **AND** the factory delegates to canonical `createDraftChange(deps)`
