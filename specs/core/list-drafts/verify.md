# Verification: ListDrafts

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListDrafts` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

### Requirement: Returns all drafted changes

#### Scenario: Multiple drafted changes exist

- **GIVEN** the repository contains three drafted changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Active and discarded changes are excluded

- **GIVEN** the repository contains drafted change `alpha`, active change `beta`, and discarded change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns DraftedChangeView without content

#### Scenario: Views have artifact state but no content

- **WHEN** `execute()` returns a list
- **THEN** each entry satisfies `DraftedChangeView` with `isDrafted === true`
- **AND** artifact statuses are populated
- **AND** no artifact file content is loaded

#### Scenario: Views are not Change instances

- **WHEN** `execute()` returns a non-empty list
- **THEN** entries do not expose `transition` or other `Change` mutators

#### Scenario: Empty drafts directory returns empty list

- **GIVEN** no directories exist under `drafts/`
- **WHEN** `ListDrafts.execute()` is called
- **THEN** it returns an empty array

#### Scenario: Active changes are excluded

- **GIVEN** `parked-feature` exists only under `changes/`
- **AND** `old-work` exists only under `drafts/`
- **WHEN** `ListDrafts.execute()` is called
- **THEN** the result contains `old-work` only
- **AND** no entry has `name === 'parked-feature'`

### Requirement: Returns an empty array when no drafted changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are active or discarded

- **GIVEN** the repository contains only active and discarded changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired draft listing preserves artifact-type repository semantics

- **GIVEN** `createListDrafts(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListDrafts.execute()` reads drafted changes through that repository
- **THEN** draft artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant
