# Verification: DiscardedChangeView

## Requirements

### Requirement: Extends ReadOnlyChangeView

#### Scenario: Shared fields available from getDiscarded

- **GIVEN** a discarded change `old-experiment` with specIds `['auth/legacy']`
- **WHEN** `getDiscarded('old-experiment')` returns a view
- **THEN** `view.name` is `old-experiment`
- **AND** `view.specIds` equals `['auth/legacy']`
- **AND** `view.schemaName` and `view.schemaVersion` are readable

#### Scenario: Shared fields available from listDiscarded

- **WHEN** `listDiscarded()` returns one or more entries
- **THEN** each entry satisfies `ReadOnlyChangeView`
- **AND** each entry exposes `name`, `specIds`, and schema fields

#### Scenario: Mutating Change methods are not on the view type

- **WHEN** TypeScript types for `DiscardedChangeView` are inspected
- **THEN** `transition` and `discard` are not members of the interface

### Requirement: Discarded-specific surface

#### Scenario: View exposes discard metadata with supersededBy

- **GIVEN** a change discarded with reason `superseded` and `supersededBy: ['new-auth']` at `2026-05-01T12:00:00Z` by actor `{ name: 'Ada' }`
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** `discardReason` is `superseded`
- **AND** `supersededBy` equals `['new-auth']`
- **AND** `discardedAt` matches the event timestamp
- **AND** `discardedBy.name` is `Ada`

#### Scenario: View exposes discard metadata without supersededBy

- **GIVEN** a change discarded with reason `abandoned` and no `supersededBy`
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** `discardReason` is `abandoned`
- **AND** `supersededBy` is undefined

#### Scenario: Non-discarded change is rejected by factory

- **GIVEN** an active change whose latest event is not `discarded`
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** it throws a domain error

### Requirement: Construction

#### Scenario: GetDiscarded returns a view

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `GetDiscarded.execute({ name })` is called
- **THEN** `result.view` satisfies `DiscardedChangeView`

#### Scenario: getDiscarded returns null for active-only name

- **GIVEN** a change exists only under `changes/`
- **WHEN** `ChangeRepository.getDiscarded(name)` is called
- **THEN** it returns `null`

#### Scenario: getDiscarded returns null for drafted-only name

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `ChangeRepository.getDiscarded(name)` is called
- **THEN** it returns `null`

### Requirement: No mutation path

#### Scenario: No mutateDiscarded on repository port

- **WHEN** the `ChangeRepository` abstract class is inspected
- **THEN** there is no `mutateDiscarded` method

#### Scenario: Discarded view cannot be saved via save

- **GIVEN** a `DiscardedChangeView` obtained from `getDiscarded`
- **WHEN** a test calls `ChangeRepository.save` with a domain `Change` rebuilt from view data outside repository internals
- **THEN** either the operation is impossible without internal `Change` access or persistence does not treat the view as an active mutation target

#### Scenario: GetDiscarded does not invoke mutating repository methods

- **GIVEN** spies on `mutate`, `mutateDraft`, `save`, and `saveArtifact`
- **WHEN** `GetDiscarded.execute` completes successfully
- **THEN** none of the mutating methods were called
