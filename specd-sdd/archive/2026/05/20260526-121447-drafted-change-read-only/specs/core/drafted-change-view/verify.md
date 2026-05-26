# Verification: DraftedChangeView

## Requirements

### Requirement: Extends ReadOnlyChangeView

#### Scenario: View exposes shared read accessors

- **GIVEN** a drafted change `parked-feature` with two specIds
- **WHEN** `getDraft('parked-feature')` returns a view
- **THEN** `view.name` is `parked-feature`
- **AND** `view.specIds` has length 2
- **AND** `view.schemaName` and `view.schemaVersion` match the manifest

#### Scenario: View exposes artifact aggregate state

- **GIVEN** a drafted change whose `proposal` artifact is `pending-review`
- **WHEN** `getDraft(name)` returns a view
- **THEN** `view.artifacts` includes the `proposal` entry with that persisted state
- **AND** no artifact file body is present on the view

#### Scenario: Mutating Change methods are not on the view type

- **WHEN** TypeScript types for `DraftedChangeView` are inspected
- **THEN** `transition`, `updateSpecIds`, and `discard` are not members of the interface

### Requirement: Drafted-specific surface

#### Scenario: View exposes isDrafted true

- **GIVEN** a change drafted with a `drafted` event as the latest lifecycle marker
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** `view.isDrafted === true`

#### Scenario: Active change cannot become a DraftedChangeView

- **GIVEN** an active change under `changes/` with `isDrafted === false`
- **WHEN** `toDraftedChangeView(change)` is called
- **THEN** it throws before returning a view

#### Scenario: View has no transition method at runtime

- **GIVEN** a `DraftedChangeView` returned from `ListDrafts.execute()`
- **WHEN** a test attempts to call `transition` on the object
- **THEN** the call is a type error or the method is undefined at runtime

### Requirement: No escape hatch to mutable Change

#### Scenario: No unwrap accessor on getDraft result

- **WHEN** `GetDraft.execute` returns `{ view }`
- **THEN** `view` has no `change`, `unwrap`, or `toChange` accessor

#### Scenario: listDrafts entries are views only

- **WHEN** `listDrafts()` returns a non-empty array
- **THEN** every element satisfies `DraftedChangeView`
- **AND** no element is a domain `Change` instance

#### Scenario: Production callers use repository factories

- **WHEN** `FsChangeRepository.getDraft` loads a drafted manifest
- **THEN** it returns `toDraftedChangeView(loadedChange)` rather than the raw `Change`

### Requirement: Construction

#### Scenario: GetDraft returns a view

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `GetDraft.execute({ name })` is called
- **THEN** `result.view` satisfies `DraftedChangeView`

#### Scenario: getDraft returns null for active-only name

- **GIVEN** a change exists only under `changes/`
- **WHEN** `ChangeRepository.getDraft(name)` is called
- **THEN** it returns `null`

#### Scenario: GetDraft does not call get on active storage first for resolution

- **GIVEN** a spy on `ChangeRepository.get` and `getDraft`
- **WHEN** `GetDraft.execute({ name })` runs for a drafted-only name
- **THEN** `getDraft` is invoked
- **AND** `get` is not used as a fallback that returns a `Change` to callers

### Requirement: Artifact content

#### Scenario: View does not embed file bodies from getDraft

- **GIVEN** drafted `proposal.md` exists on disk with non-empty content
- **WHEN** `getDraft(name)` returns a view
- **THEN** the view does not include `proposal.md` text

#### Scenario: View does not embed file bodies from listDrafts

- **WHEN** `listDrafts()` returns views for changes with artifacts
- **THEN** no view object contains artifact file content strings

#### Scenario: Artifact load remains explicit via repository

- **GIVEN** a `DraftedChangeView` for `parked-feature`
- **WHEN** `ChangeRepository.artifact` is invoked for that drafted change
- **THEN** file content is returned separately from the view load path
