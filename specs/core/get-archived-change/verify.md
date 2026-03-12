# Verification: GetArchivedChange

## Requirements

### Requirement: Input

#### Scenario: Valid change name provided

- **WHEN** `getArchivedChange.execute({ name: 'add-oauth-login' })` is called
- **THEN** the use case delegates to `ArchiveRepository.get('add-oauth-login')`

### Requirement: Output on success

#### Scenario: Archived change exists

- **GIVEN** the archive repository contains an archived change named `'add-oauth-login'`
- **WHEN** `getArchivedChange.execute({ name: 'add-oauth-login' })` is called
- **THEN** the result is the `ArchivedChange` entity returned by `ArchiveRepository.get()`

### Requirement: Delegation to ArchiveRepository

#### Scenario: Result matches repository output exactly

- **GIVEN** `ArchiveRepository.get('add-oauth-login')` returns a specific `ArchivedChange` instance
- **WHEN** `getArchivedChange.execute({ name: 'add-oauth-login' })` is called
- **THEN** the result is the exact instance returned by the repository -- no transformation is applied

### Requirement: ChangeNotFoundError on missing change

#### Scenario: Change does not exist in archive

- **GIVEN** the archive repository contains no change named `'nonexistent'`
- **WHEN** `getArchivedChange.execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown
- **AND** the error code is `'CHANGE_NOT_FOUND'`
- **AND** the error message contains `'nonexistent'`

#### Scenario: Empty archive

- **GIVEN** the archive repository contains no entries
- **WHEN** `getArchivedChange.execute({ name: 'any-name' })` is called
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: No side effects

#### Scenario: Successful lookup does not mutate state

- **GIVEN** the archive contains a change named `'add-oauth-login'`
- **WHEN** `getArchivedChange.execute({ name: 'add-oauth-login' })` is called
- **THEN** no repository write methods are invoked by the use case itself

#### Scenario: Failed lookup does not mutate state

- **GIVEN** the archive contains no change named `'nonexistent'`
- **WHEN** `getArchivedChange.execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown
- **AND** no repository write methods are invoked by the use case itself
