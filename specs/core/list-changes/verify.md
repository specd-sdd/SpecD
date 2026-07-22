# Verification: ListChanges

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListChanges` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

#### Scenario: Execute forwards options and returns repository result unchanged

- **GIVEN** `ChangeRepository.list(options)` returns a specific `ListResult<ActiveChangeListEntry>`
- **WHEN** `execute(options)` is called
- **THEN** the result is identical to the repository output
- **AND** the use case does not re-sort, filter, or paginate after delegation

### Requirement: Returns all active changes

#### Scenario: Multiple active changes returned in canonical order

- **GIVEN** the repository contains three active changes where `alpha` has the oldest `createdAt`
- **WHEN** `execute()` is called without options
- **THEN** the result is `ListResult<ActiveChangeListEntry>` with default `limit: 100`
- **AND** items appear in `createdAt` ascending order: `alpha`, then the others

#### Scenario: Drafted and discarded changes are excluded

- **GIVEN** the repository contains active change `alpha`, drafted change `beta`, and discarded change `gamma`
- **WHEN** `execute()` is called
- **THEN** `items` contains only `alpha`
- **AND** `meta.total` counts active changes only

#### Scenario: Pagination limit truncates items but preserves total

- **GIVEN** five active changes exist
- **WHEN** `execute({ limit: 2 })` is called
- **THEN** `items.length` is `2`
- **AND** `meta.total` is `5`
- **AND** `meta.count` is `2`

### Requirement: Returns Change entities without content

#### Scenario: Entries omit artifact content and history

- **WHEN** `execute()` returns a non-empty result
- **THEN** each item is an `ActiveChangeListEntry`
- **AND** items do not include artifact file content, history, validated hashes, or artifact state maps

#### Scenario: Description appears only when includeDescription is set

- **GIVEN** cached list entries include a stored description
- **WHEN** `execute({ includeDescription: true })` is called
- **THEN** returned items may include `description`
- **WHEN** `execute()` is called without `includeDescription`
- **THEN** returned items omit `description`

### Requirement: Returns an empty array when no active changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

#### Scenario: All changes are drafted or discarded

- **GIVEN** the repository contains only drafted and discarded changes
- **WHEN** `execute()` is called
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired active listing preserves artifact-type repository semantics

- **GIVEN** `createListChanges(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListChanges.execute()` reads active changes through that repository
- **THEN** artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant

### Requirement: Config-based factory delegates through resolveListChangesDeps

#### Scenario: createListChanges config form derives ListChangesDeps through resolveListChangesDeps

- **WHEN** `createListChanges(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListChangesDeps` through `resolveListChangesDeps(resolver)`
- **AND** `resolveListChangesDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createListChanges(deps)`
