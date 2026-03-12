# Verification: GetStatus

## Requirements

### Requirement: Returns the change and its artifact statuses

#### Scenario: Change with multiple artifacts

- **GIVEN** a change `add-login` exists with artifacts `proposal` (complete) and `spec` (in-progress)
- **WHEN** `execute({ name: 'add-login' })` is called
- **THEN** the result contains the `Change` entity for `add-login`
- **AND** `artifactStatuses` has two entries: one for `proposal` and one for `spec`
- **AND** each entry's `effectiveStatus` reflects the value returned by `Change.effectiveStatus(type)`

#### Scenario: Change with no artifacts

- **GIVEN** a change `empty-change` exists with an empty artifact map
- **WHEN** `execute({ name: 'empty-change' })` is called
- **THEN** the result contains the `Change` entity
- **AND** `artifactStatuses` is an empty array

### Requirement: Throws ChangeNotFoundError for unknown changes

#### Scenario: Change does not exist

- **WHEN** `execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown with code `CHANGE_NOT_FOUND`
- **AND** the error message contains `'nonexistent'`

### Requirement: Reports effective status for every artifact

#### Scenario: Effective status cascades through dependencies

- **GIVEN** a change has artifact `spec` that depends on `proposal`
- **AND** `spec` hashes match (would be `complete` in isolation)
- **AND** `proposal` is `in-progress`
- **WHEN** `execute()` is called for this change
- **THEN** the `effectiveStatus` for `spec` is `in-progress` (cascaded from its dependency)
- **AND** the `effectiveStatus` for `proposal` is `in-progress`

#### Scenario: Skipped artifacts satisfy dependencies

- **GIVEN** a change has artifact `spec` that depends on `proposal`
- **AND** `proposal` is `skipped`
- **AND** `spec` hashes match
- **WHEN** `execute()` is called for this change
- **THEN** the `effectiveStatus` for `spec` is `complete`
- **AND** the `effectiveStatus` for `proposal` is `skipped`
