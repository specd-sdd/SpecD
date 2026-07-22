# Verification: ListDrafts

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListDrafts` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

#### Scenario: Execute forwards options and returns repository result unchanged

- **GIVEN** `ChangeRepository.listDrafts(options)` returns a specific `ListResult<DraftedChangeListEntry>`
- **WHEN** `execute(options)` is called
- **THEN** the result is identical to the repository output
- **AND** the use case does not re-sort, filter, or paginate after delegation

### Requirement: Returns all drafted changes

#### Scenario: Multiple drafted changes returned in canonical order

- **GIVEN** the repository contains three drafted changes with distinct `draftedAt` timestamps
- **WHEN** `execute()` is called without options
- **THEN** the result is `ListResult<DraftedChangeListEntry>` with default `limit: 100`
- **AND** items appear in `draftedAt` descending order (newest first)

#### Scenario: Active and discarded changes are excluded

- **GIVEN** the repository contains drafted change `alpha`, active change `beta`, and discarded change `gamma`
- **WHEN** `execute()` is called
- **THEN** `items` contains only `alpha`

#### Scenario: Pagination limit truncates items but preserves total

- **GIVEN** four drafted changes exist
- **WHEN** `execute({ limit: 1, page: 2 })` is called
- **THEN** `items.length` is `1`
- **AND** `meta.total` is `4`

### Requirement: Returns DraftedChangeView without content

#### Scenario: Entries are DraftedChangeListEntry without detail fields

- **WHEN** `execute()` returns a non-empty result
- **THEN** each item is a `DraftedChangeListEntry` with `draftedAt` and `draftedBy`
- **AND** items do not include artifact file content, history, or artifact state maps
- **AND** entries are not mutable `Change` instances

#### Scenario: Optional description and reason require include flags

- **GIVEN** cached draft rows include stored description and reason
- **WHEN** `execute({ includeDescription: true, includeReason: true })` is called
- **THEN** returned items may include `description` and `reason`
- **WHEN** `execute()` is called without those flags
- **THEN** returned items omit `description` and `reason`

#### Scenario: Empty drafts directory returns empty ListResult

- **GIVEN** no directories exist under `drafts/`
- **WHEN** `ListDrafts.execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

### Requirement: Returns an empty array when no drafted changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

#### Scenario: All changes are active or discarded

- **GIVEN** the repository contains only active and discarded changes
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired draft listing preserves artifact-type repository semantics

- **GIVEN** `createListDrafts(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListDrafts.execute()` reads drafted changes through that repository
- **THEN** draft artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant

### Requirement: Config-based factory delegates through resolveListDraftsDeps

#### Scenario: createListDrafts config form derives ListDraftsDeps through resolveListDraftsDeps

- **WHEN** `createListDrafts(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListDraftsDeps` through `resolveListDraftsDeps(resolver)`
- **AND** `resolveListDraftsDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createListDrafts(deps)`
