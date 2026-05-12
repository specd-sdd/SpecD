# Verification: Spec Overlap

## Requirements

### Requirement: Domain service is a pure function

#### Scenario: Returns result without I/O

- **WHEN** `detectSpecOverlap` is called with a list of Change entities
- **THEN** it returns an `OverlapReport` synchronously
- **AND** it does not invoke any ports, repositories, or I/O operations

### Requirement: OverlapReport structure

#### Scenario: Report contains expected fields

- **GIVEN** two changes both targeting `core:core/config`
- **WHEN** `detectSpecOverlap` is called
- **THEN** the result has `hasOverlap` equal to `true`
- **AND** `entries` contains one `OverlapEntry` with `specId` equal to `core:core/config`
- **AND** the entry's `changes` array has two elements, each with `name` and `state`

### Requirement: Overlap detection logic

#### Scenario: Two changes share one spec

- **GIVEN** change `alpha` targets `['core:core/config', 'core:core/change']`
- **AND** change `beta` targets `['core:core/config']`
- **WHEN** `detectSpecOverlap` is called with both changes
- **THEN** the report has one entry for `core:core/config`
- **AND** the entry lists `alpha` and `beta` (sorted by name)
- **AND** `core:core/change` does not appear in the report

#### Scenario: Three changes share two specs

- **GIVEN** change `alpha` targets `['core:core/config', 'core:core/kernel']`
- **AND** change `beta` targets `['core:core/config']`
- **AND** change `gamma` targets `['core:core/kernel']`
- **WHEN** `detectSpecOverlap` is called with all three
- **THEN** the report has two entries sorted as `core:core/config`, `core:core/kernel`
- **AND** `core:core/config` lists `alpha`, `beta`
- **AND** `core:core/kernel` lists `alpha`, `gamma`

#### Scenario: No overlapping specs

- **GIVEN** change `alpha` targets `['core:core/config']`
- **AND** change `beta` targets `['core:core/kernel']`
- **WHEN** `detectSpecOverlap` is called with both
- **THEN** `hasOverlap` is `false`
- **AND** `entries` is empty

### Requirement: Single-change and zero-change inputs

#### Scenario: Empty input

- **WHEN** `detectSpecOverlap` is called with an empty array
- **THEN** `hasOverlap` is `false`
- **AND** `entries` is empty

#### Scenario: Single change

- **GIVEN** one change targeting `['core:core/config', 'core:core/kernel']`
- **WHEN** `detectSpecOverlap` is called with that single change
- **THEN** `hasOverlap` is `false`
- **AND** `entries` is empty

### Requirement: DetectOverlap use case

#### Scenario: Use case retrieves active changes and delegates to domain service

- **GIVEN** `ChangeRepository.list()` returns two changes both targeting `core:core/config`
- **WHEN** `DetectOverlap.execute()` is called without a name filter
- **THEN** the result is an `OverlapReport` with one entry for `core:core/config`

### Requirement: DetectOverlap accepts an optional change name filter

#### Scenario: Filter narrows output to named change

- **GIVEN** three active changes: `alpha` targets `['core:core/config']`, `beta` targets `['core:core/config', 'core:core/kernel']`, `gamma` targets `['core:core/kernel']`
- **WHEN** `execute({ name: 'alpha' })` is called
- **THEN** the report contains only the entry for `core:core/config` (where `alpha` participates)
- **AND** `core:core/kernel` is not in the report

#### Scenario: Named change has no overlap

- **GIVEN** change `alpha` targets `['core:core/config']` and no other change targets that spec
- **WHEN** `execute({ name: 'alpha' })` is called
- **THEN** `hasOverlap` is `false`
- **AND** `entries` is empty

#### Scenario: Named change not found

- **GIVEN** no active change named `nonexistent` exists
- **WHEN** `execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Use case is constructed with repository

- **WHEN** `new DetectOverlap(changeRepository)` is called
- **THEN** the instance is created successfully
- **AND** `execute()` delegates to `changeRepository.list()`
