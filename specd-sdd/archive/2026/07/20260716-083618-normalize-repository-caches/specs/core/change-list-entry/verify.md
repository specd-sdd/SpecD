# Verification: Change List Entry

## Requirements

### Requirement: Shared change list entry base

#### Scenario: Entry includes required base fields

- **GIVEN** an active change projected into a list entry
- **WHEN** the entry is returned from `ChangeRepository.list()`
- **THEN** it includes `name`, `createdAt`, `state`, `specIds`, `schemaName`, and `schemaVersion`

#### Scenario: State is derived from history

- **GIVEN** a change whose lifecycle state is determined by the latest history event rather than a plain manifest snapshot field
- **WHEN** the change is projected into a list entry
- **THEN** `state` reflects the history-derived lifecycle state

### Requirement: ActiveChangeListEntry

#### Scenario: Description omitted without includeDescription

- **GIVEN** an active change with a description in its cached list payload
- **WHEN** `list()` is called without `includeDescription`
- **THEN** returned `ActiveChangeListEntry` items do not include a `description` property

#### Scenario: Description projected when includeDescription is set

- **GIVEN** an active change with a description in its cached list payload
- **WHEN** `list({ includeDescription: true })` is called
- **THEN** the matching entry includes `description`

### Requirement: DraftedChangeListEntry

#### Scenario: Entry includes required draft fields

- **GIVEN** a drafted change with `drafted` history metadata
- **WHEN** it is projected into a `DraftedChangeListEntry`
- **THEN** the entry includes `draftedAt` and `draftedBy` derived from history

#### Scenario: Optional draft fields respect include flags

- **GIVEN** a drafted change whose cached entry payload includes `description` and `reason`
- **WHEN** `listDrafts({ includeDescription: true, includeReason: false })` is called
- **THEN** returned items include `description`
- **AND** returned items do not include `reason`

### Requirement: DiscardedChangeListEntry

#### Scenario: Entry includes required discard fields

- **GIVEN** a discarded change with `discarded` history metadata
- **WHEN** it is projected into a `DiscardedChangeListEntry`
- **THEN** the entry includes `discardedAt` and `discardedBy` derived from history

#### Scenario: SupersededBy projected only when requested

- **GIVEN** a discarded change whose cached entry payload includes `supersededBy`
- **WHEN** `listDiscarded({ includeSupersededBy: true })` is called
- **THEN** the matching entry includes `supersededBy`
- **WHEN** `listDiscarded()` is called without `includeSupersededBy`
- **THEN** the matching entry does not include `supersededBy`

### Requirement: Three distinct entry types

#### Scenario: Port exposes three separate list entry types

- **WHEN** the change repository port list methods are typed
- **THEN** `list()` returns `ActiveChangeListEntry`
- **AND** `listDrafts()` returns `DraftedChangeListEntry`
- **AND** `listDiscarded()` returns `DiscardedChangeListEntry`
- **AND** they are not modeled as a single discriminated union type

### Requirement: List entries exclude detail fields

#### Scenario: List entry omits detail-only fields

- **GIVEN** a change with history events, artifact file maps, validated hashes, and approval records
- **WHEN** it is projected into any change list entry type
- **THEN** the entry does not include history, artifact file maps, validated hashes, approval records, or artifact content
