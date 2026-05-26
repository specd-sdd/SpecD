# Verification: ReadOnlyChangeView

## Requirements

### Requirement: Shared read-only surface

#### Scenario: Drafted view exposes shared fields

- **GIVEN** a drafted change named `parked-feature` with specIds `['core:change']` and schema `schema-std@1`
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** the result satisfies `ReadOnlyChangeView`
- **AND** `name` is `parked-feature`
- **AND** `specIds` equals `['core:change']`
- **AND** `schemaName` and `schemaVersion` match the persisted manifest

#### Scenario: Discarded view exposes shared fields

- **GIVEN** a discarded change with terminal `discarded` event
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** the result satisfies `ReadOnlyChangeView`
- **AND** `artifacts` is a read-only map with derived statuses but no file bodies

#### Scenario: View types omit mutating methods

- **WHEN** inspecting `DraftedChangeView` and `DiscardedChangeView` public APIs
- **THEN** neither type declares `transition`, `draft`, `restore`, `discard`, or `invalidate`

### Requirement: No escape hatch to mutable Change

#### Scenario: Repository view has no unwrap accessor

- **WHEN** a `DraftedChangeView` is returned from `getDraft(name)`
- **THEN** the object has no public `change`, `unwrap`, or `toChange` property

#### Scenario: Discarded view has no unwrap accessor

- **WHEN** a `DiscardedChangeView` is returned from `getDiscarded(name)`
- **THEN** the object has no public `change`, `unwrap`, or `toChange` property

#### Scenario: Factories return facade instances only

- **WHEN** `toDraftedChangeView` or `toDiscardedChangeView` succeeds
- **THEN** the returned object is not an instance of domain `Change`

### Requirement: Shared implementation

#### Scenario: Single facade backs drafted views

- **GIVEN** a drafted `Change` loaded from `drafts/`
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** the result satisfies `DraftedChangeView` and `ReadOnlyChangeView`
- **AND** `isDrafted === true`

#### Scenario: Single facade backs discarded views

- **GIVEN** a `Change` whose latest history event is `discarded` with reason `obsolete`
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** the result satisfies `DiscardedChangeView` and `ReadOnlyChangeView`
- **AND** `discardReason` is `obsolete`

#### Scenario: Discarded factory rejects non-terminal change

- **GIVEN** a `Change` whose latest history event is `transitioned` to `designing`
- **WHEN** `toDiscardedChangeView(change)` is called
- **THEN** it throws a domain error

#### Scenario: Drafted factory rejects active change

- **GIVEN** a `Change` with `isDrafted === false` under `changes/`
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** it throws a domain error

#### Scenario: Drafted factory rejects discarded change

- **GIVEN** a `Change` whose latest history event is `discarded`
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** it throws a domain error

### Requirement: Artifact content

#### Scenario: getDraft does not load artifact bodies into the view

- **GIVEN** a drafted change with on-disk `proposal.md` content
- **WHEN** `getDraft(name)` returns a `DraftedChangeView`
- **THEN** the view's artifact entries include status metadata only
- **AND** `proposal.md` text is not a property on the view

#### Scenario: getDiscarded does not load artifact bodies into the view

- **GIVEN** a discarded change with on-disk delta files
- **WHEN** `getDiscarded(name)` returns a `DiscardedChangeView`
- **THEN** the view does not include merged spec or delta file content

#### Scenario: Artifact content still loadable via repository.artifact

- **GIVEN** a `DraftedChangeView` from `getDraft(name)`
- **WHEN** `ChangeRepository.artifact` is called with the internal drafted context for that name
- **THEN** artifact file content may be loaded separately from the view
