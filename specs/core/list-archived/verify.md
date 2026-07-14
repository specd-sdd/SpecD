# Verification: ListArchived

## Requirements

### Requirement: Ports and constructor

#### Scenario: Constructor accepts ArchiveRepository

- **WHEN** `ListArchived` is instantiated
- **THEN** it requires an `ArchiveRepository` in its constructor

### Requirement: No input

#### Scenario: Execute called with no arguments

- **WHEN** `listArchived.execute({ limit: 10, page: 2 })` is called
- **THEN** it delegates to `archiveRepository.list({ limit: 10, page: 2 })`

### Requirement: Output

#### Scenario: Archive contains multiple changes

- **GIVEN** the archive repository contains three archived changes with distinct `archivedAt` timestamps as index entries
- **WHEN** `listArchived.execute()` is called
- **THEN** the result is an array of three `ArchivedChangeIndexEntry` records ordered oldest first

#### Scenario: Archive is empty

- **WHEN** `listArchived.execute()` is called and the archive repository contains no entries
- **THEN** the result is an empty array

### Requirement: Delegation to ArchiveRepository

#### Scenario: Result matches repository output exactly

- **GIVEN** `ArchiveRepository.list(options)` returns a specific `ArchiveListResult`
- **WHEN** `listArchived.execute(options)` is called
- **THEN** the result is identical to the object returned by the repository

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
