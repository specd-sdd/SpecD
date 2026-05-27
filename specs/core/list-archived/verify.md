# Verification: ListArchived

## Requirements

### Requirement: Ports and constructor

#### Scenario: Constructor accepts ArchiveRepository

- **WHEN** `ListArchived` is instantiated
- **THEN** it requires an `ArchiveRepository` in its constructor

### Requirement: No input

#### Scenario: Execute called with no arguments

- **WHEN** `listArchived.execute()` is called
- **THEN** it does not require any input parameters

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

- **GIVEN** `ArchiveRepository.list()` returns a specific array of `ArchivedChangeIndexEntry` records
- **WHEN** `listArchived.execute()` is called
- **THEN** the result is identical to the array returned by `ArchiveRepository.list()` -- no filtering, sorting, or transformation is applied

### Requirement: No side effects

#### Scenario: Repeated calls produce same result

- **GIVEN** the archive repository state does not change between calls
- **WHEN** `listArchived.execute()` is called multiple times
- **THEN** each call returns the same result
- **AND** no repository write methods are invoked
