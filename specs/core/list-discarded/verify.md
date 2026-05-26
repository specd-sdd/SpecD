# Verification: ListDiscarded

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListDiscarded` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

### Requirement: Returns all discarded changes

#### Scenario: Multiple discarded changes exist

- **GIVEN** the repository contains three discarded changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Active and drafted changes are excluded

- **GIVEN** the repository contains discarded change `alpha`, active change `beta`, and drafted change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns DiscardedChangeView without content

#### Scenario: Views have artifact state but no content

- **WHEN** `execute()` returns a list
- **THEN** each entry satisfies `DiscardedChangeView` with `discardReason` from the terminal `discarded` event
- **AND** artifact statuses are populated
- **AND** no artifact file content is loaded

#### Scenario: Views are not Change instances

- **WHEN** `execute()` returns a non-empty list
- **THEN** entries do not expose `transition` or other `Change` mutators

#### Scenario: Empty discarded directory returns empty list

- **GIVEN** no directories exist under `discarded/`
- **WHEN** `ListDiscarded.execute()` is called
- **THEN** it returns an empty array

#### Scenario: Drafted and active changes are excluded

- **GIVEN** `old-experiment` exists only under `discarded/`
- **AND** `parked-feature` exists only under `drafts/`
- **WHEN** `ListDiscarded.execute()` is called
- **THEN** the result contains `old-experiment` only

### Requirement: Returns an empty array when no discarded changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are active or drafted

- **GIVEN** the repository contains only active and drafted changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array
