# Verification: ListDrafts

## Requirements

### Requirement: Returns all drafted changes

#### Scenario: Multiple drafted changes exist

- **GIVEN** the repository contains three drafted changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Active and discarded changes are excluded

- **GIVEN** the repository contains drafted change `alpha`, active change `beta`, and discarded change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns Change entities without content

#### Scenario: Changes have artifact state but no content

- **WHEN** `execute()` returns a list of changes
- **THEN** each `Change` has its artifact map populated with status and validated hashes
- **AND** no artifact file content is loaded

### Requirement: Returns an empty array when no drafted changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are active or discarded

- **GIVEN** the repository contains only active and discarded changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array
