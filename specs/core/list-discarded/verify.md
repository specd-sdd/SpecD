# Verification: ListDiscarded

## Requirements

### Requirement: Returns all discarded changes

#### Scenario: Multiple discarded changes exist

- **GIVEN** the repository contains three discarded changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Active and drafted changes are excluded

- **GIVEN** the repository contains discarded change `alpha`, active change `beta`, and drafted change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns Change entities without content

#### Scenario: Changes have artifact state but no content

- **WHEN** `execute()` returns a list of changes
- **THEN** each `Change` has its artifact map populated with status and validated hashes
- **AND** no artifact file content is loaded

### Requirement: Returns an empty array when no discarded changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are active or drafted

- **GIVEN** the repository contains only active and drafted changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array
