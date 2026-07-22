# Verification: ListArchived

## Requirements

### Requirement: Ports and constructor

#### Scenario: Constructor accepts ArchiveRepository

- **WHEN** `ListArchived` is instantiated
- **THEN** it requires an `ArchiveRepository` in its constructor

### Requirement: No input

#### Scenario: Execute forwards list options to repository

- **WHEN** `listArchived.execute({ limit: 10, page: 2, includeArchivedBy: true })` is called
- **THEN** it delegates to `archiveRepository.list({ limit: 10, page: 2, includeArchivedBy: true })`

#### Scenario: Default limit is 100 when options omitted

- **WHEN** `listArchived.execute()` is called with no arguments
- **THEN** it delegates to `archiveRepository.list()` with default `limit: 100`

#### Scenario: page and after are mutually exclusive

- **WHEN** options include both `page` and `after`
- **THEN** validation rejects the request before repository delegation

### Requirement: Output

#### Scenario: Archive contains multiple changes ordered newest first

- **GIVEN** the archive repository contains three archived changes with distinct `archivedAt` timestamps
- **WHEN** `listArchived.execute()` is called
- **THEN** the result is `ListResult<ArchiveListEntry>` with three items ordered by `archivedAt` descending (newest first)
- **AND** `meta.total` equals the full archive count

#### Scenario: Archive is empty

- **WHEN** `listArchived.execute()` is called and the archive repository contains no entries
- **THEN** the result is `{ items: [], meta: { total: 0, count: 0, limit: 100 } }`

#### Scenario: Keyset after cursor replaces legacy startAt

- **GIVEN** archived changes `alpha` and `beta` where `alpha` is newer
- **WHEN** `listArchived.execute({ limit: 1, after: { key: alpha.archivedAt, id: 'alpha' } })` is called
- **THEN** `items` contains only `beta`
- **AND** no `startAt` option is accepted

#### Scenario: archivedBy appears only when includeArchivedBy is set

- **GIVEN** cached archive rows include stored `archivedBy`
- **WHEN** `listArchived.execute({ includeArchivedBy: true })` is called
- **THEN** returned items may include `archivedBy`
- **WHEN** `listArchived.execute()` is called without the flag
- **THEN** returned items omit `archivedBy`

### Requirement: Delegation to ArchiveRepository

#### Scenario: Result matches repository output exactly

- **GIVEN** `ArchiveRepository.list(options)` returns a specific `ListResult<ArchiveListEntry>`
- **WHEN** `listArchived.execute(options)` is called
- **THEN** the result is identical to the object returned by the repository
- **AND** the use case does not re-sort, filter, or paginate after delegation

#### Scenario: No additional transformation after delegation

- **GIVEN** the archive repository returns items in `archivedAt` descending order
- **WHEN** `listArchived.execute(options)` is called
- **THEN** the returned item order and `meta` fields match the repository output exactly

### Requirement: No side effects

#### Scenario: Repeated calls produce same result

- **GIVEN** the archive repository state does not change between calls
- **WHEN** `listArchived.execute()` is called multiple times
- **THEN** each call returns the same result
- **AND** no repository write methods are invoked

### Requirement: Config-based factory delegates through resolveListArchivedDeps

#### Scenario: createListArchived config form derives ListArchivedDeps through resolveListArchivedDeps

- **WHEN** `createListArchived(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListArchivedDeps` through `resolveListArchivedDeps(resolver)`
- **AND** `resolveListArchivedDeps(resolver)` resolves:
- `archive: ArchiveRepository`
- **AND** the factory delegates to canonical `createListArchived(deps)`
