# Verification: ListDiscarded

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListDiscarded` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

#### Scenario: Execute forwards options and returns repository result unchanged

- **GIVEN** `ChangeRepository.listDiscarded(options)` returns a specific `ListResult<DiscardedChangeListEntry>`
- **WHEN** `execute(options)` is called
- **THEN** the result is identical to the repository output
- **AND** the use case does not re-sort, filter, or paginate after delegation

### Requirement: Returns all discarded changes

#### Scenario: Multiple discarded changes returned in canonical order

- **GIVEN** the repository contains three discarded changes with distinct `discardedAt` timestamps
- **WHEN** `execute()` is called without options
- **THEN** the result is `ListResult<DiscardedChangeListEntry>` with default `limit: 100`
- **AND** items appear in `discardedAt` descending order (newest first)

#### Scenario: Active and drafted changes are excluded

- **GIVEN** the repository contains discarded change `alpha`, active change `beta`, and drafted change `gamma`
- **WHEN** `execute()` is called
- **THEN** `items` contains only `alpha`

#### Scenario: Keyset after cursor returns next page

- **GIVEN** discarded changes `alpha` and `beta` where `alpha` is newer
- **WHEN** `execute({ limit: 1, after: { key: alpha.discardedAt, id: 'alpha' } })` is called
- **THEN** `items` contains only `beta`

### Requirement: Returns DiscardedChangeView without content

#### Scenario: Entries are DiscardedChangeListEntry without detail fields

- **WHEN** `execute()` returns a non-empty result
- **THEN** each item is a `DiscardedChangeListEntry` with `discardedAt` and `discardedBy`
- **AND** items do not include artifact file content, history, or artifact state maps
- **AND** entries are not mutable `Change` instances

#### Scenario: Optional description, reason, and supersededBy require include flags

- **GIVEN** cached discarded rows include stored description, reason, and supersededBy
- **WHEN** `execute({ includeDescription: true, includeReason: true, includeSupersededBy: true })` is called
- **THEN** returned items may include `description`, `reason`, and `supersededBy`
- **WHEN** `execute()` is called without those flags
- **THEN** returned items omit those optional fields

#### Scenario: Empty discarded directory returns empty ListResult

- **GIVEN** no directories exist under `discarded/`
- **WHEN** `ListDiscarded.execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

### Requirement: Returns an empty array when no discarded changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

#### Scenario: All changes are active or drafted

- **GIVEN** the repository contains only active and drafted changes
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired discarded listing preserves artifact-type repository semantics

- **GIVEN** `createListDiscarded(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListDiscarded.execute()` reads discarded changes through that repository
- **THEN** discarded artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant

### Requirement: Config-based factory delegates through resolveListDiscardedDeps

#### Scenario: createListDiscarded config form derives ListDiscardedDeps through resolveListDiscardedDeps

- **WHEN** `createListDiscarded(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListDiscardedDeps` through `resolveListDiscardedDeps(resolver)`
- **AND** `resolveListDiscardedDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createListDiscarded(deps)`
