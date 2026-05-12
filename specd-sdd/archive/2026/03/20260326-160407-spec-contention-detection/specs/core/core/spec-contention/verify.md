# Verification: Spec Contention

## Requirements

### Requirement: Domain service is a pure function

#### Scenario: Returns result without I/O

- **WHEN** `detectSpecContention` is called with a list of Change entities
- **THEN** it returns a `ContentionReport` synchronously
- **AND** it does not invoke any ports, repositories, or I/O operations

### Requirement: ContentionReport structure

#### Scenario: Report contains expected fields

- **GIVEN** two changes both targeting `core:core/config`
- **WHEN** `detectSpecContention` is called
- **THEN** the result has `hasContention` equal to `true`
- **AND** `entries` contains one `ContentionEntry` with `specId` equal to `core:core/config`
- **AND** the entry's `changes` array has two elements, each with `name` and `state`

### Requirement: Contention detection logic

#### Scenario: Two changes share one spec

- **GIVEN** change `alpha` targets `['core:core/config', 'core:core/change']`
- **AND** change `beta` targets `['core:core/config']`
- **WHEN** `detectSpecContention` is called with both changes
- **THEN** the report has one entry for `core:core/config`
- **AND** the entry lists `alpha` and `beta` (sorted by name)
- **AND** `core:core/change` does not appear in the report

#### Scenario: Three changes share two specs

- **GIVEN** change `alpha` targets `['core:core/config', 'core:core/kernel']`
- **AND** change `beta` targets `['core:core/config']`
- **AND** change `gamma` targets `['core:core/kernel']`
- **WHEN** `detectSpecContention` is called with all three
- **THEN** the report has two entries sorted as `core:core/config`, `core:core/kernel`
- **AND** `core:core/config` lists `alpha`, `beta`
- **AND** `core:core/kernel` lists `alpha`, `gamma`

#### Scenario: No overlapping specs

- **GIVEN** change `alpha` targets `['core:core/config']`
- **AND** change `beta` targets `['core:core/kernel']`
- **WHEN** `detectSpecContention` is called with both
- **THEN** `hasContention` is `false`
- **AND** `entries` is empty

### Requirement: Single-change and zero-change inputs

#### Scenario: Empty input

- **WHEN** `detectSpecContention` is called with an empty array
- **THEN** `hasContention` is `false`
- **AND** `entries` is empty

#### Scenario: Single change

- **GIVEN** one change targeting `['core:core/config', 'core:core/kernel']`
- **WHEN** `detectSpecContention` is called with that single change
- **THEN** `hasContention` is `false`
- **AND** `entries` is empty

### Requirement: DetectContention use case

#### Scenario: Use case retrieves active changes and delegates to domain service

- **GIVEN** `ChangeRepository.list()` returns two changes both targeting `core:core/config`
- **WHEN** `DetectContention.execute()` is called without a name filter
- **THEN** the result is a `ContentionReport` with one entry for `core:core/config`

### Requirement: DetectContention accepts an optional change name filter

#### Scenario: Filter narrows output to named change

- **GIVEN** three active changes: `alpha` targets `['core:core/config']`, `beta` targets `['core:core/config', 'core:core/kernel']`, `gamma` targets `['core:core/kernel']`
- **WHEN** `execute({ name: 'alpha' })` is called
- **THEN** the report contains only the entry for `core:core/config` (where `alpha` participates)
- **AND** `core:core/kernel` is not in the report (since `alpha` does not target it)

#### Scenario: Named change has no contention

- **GIVEN** change `alpha` targets `['core:core/config']` and no other change targets that spec
- **WHEN** `execute({ name: 'alpha' })` is called
- **THEN** `hasContention` is `false`
- **AND** `entries` is empty

#### Scenario: Named change not found

- **GIVEN** no active change named `nonexistent` exists
- **WHEN** `execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Use case is constructed with repository

- **WHEN** `new DetectContention(changeRepository)` is called
- **THEN** the instance is created successfully
- **AND** `execute()` delegates to `changeRepository.list()`
