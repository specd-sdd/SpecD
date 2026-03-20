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

### Requirement: Returns lifecycle context

#### Scenario: Valid transitions from designing state

- **GIVEN** a change in `designing` state
- **WHEN** `execute()` is called
- **THEN** `lifecycle.validTransitions` contains exactly the states defined in `VALID_TRANSITIONS['designing']`

#### Scenario: Available transitions when all requires are satisfied

- **GIVEN** a change in `designing` state
- **AND** all artifacts required by the `ready` workflow step have effective status `complete`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.availableTransitions` includes `ready`

#### Scenario: Blocked transition with unsatisfied requires

- **GIVEN** a change in `designing` state
- **AND** artifact `specs` has effective status `missing`
- **AND** the `ready` workflow step requires `specs`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.availableTransitions` does not include `ready`
- **AND** `lifecycle.blockers` contains an entry with `transition: 'ready'`, `reason: 'requires'`, and `blocking` including `'specs'`

#### Scenario: Approvals reflect injected config

- **GIVEN** `GetStatus` was constructed with `approvals: { spec: true, signoff: false }`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.approvals` is `{ spec: true, signoff: false }`

#### Scenario: Next artifact resolves first unsatisfied artifact with met requires

- **GIVEN** a change with artifacts `proposal` (complete), `specs` (missing), `verify` (missing)
- **AND** `specs` requires `proposal`
- **AND** `verify` requires `specs`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.nextArtifact` is `'specs'`

#### Scenario: Next artifact is null when all artifacts are complete

- **GIVEN** all artifacts have effective status `complete`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.nextArtifact` is `null`

#### Scenario: Next artifact skips artifacts whose requires are not met

- **GIVEN** artifacts `proposal` (missing), `specs` (missing), `design` (missing)
- **AND** `specs` requires `proposal`, `design` requires `proposal` and `specs`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.nextArtifact` is `'proposal'` (the only artifact with all requires satisfied)

#### Scenario: Change path is included

- **WHEN** `execute()` is called for an existing change
- **THEN** `lifecycle.changePath` equals the value returned by `ChangeRepository.changePath(change)`

#### Scenario: Schema info is included when resolution succeeds

- **GIVEN** schema resolution succeeds with name `schema-std` and version `1`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.schemaInfo` is `{ name: 'schema-std', version: 1 }`

#### Scenario: Skipped artifacts count as satisfied requires for available transitions

- **GIVEN** a change in `designing` state
- **AND** all artifacts required by `ready` have effective status `complete` or `skipped`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.availableTransitions` includes `ready`

### Requirement: Graceful degradation when schema resolution fails

#### Scenario: Schema resolution failure degrades lifecycle fields

- **GIVEN** `SchemaRegistry.resolve()` throws an error
- **WHEN** `execute()` is called
- **THEN** the result does not throw
- **AND** `lifecycle.validTransitions` is populated normally
- **AND** `lifecycle.availableTransitions` is an empty array
- **AND** `lifecycle.blockers` is an empty array
- **AND** `lifecycle.approvals` is populated normally
- **AND** `lifecycle.nextArtifact` is `null`
- **AND** `lifecycle.changePath` is populated normally
- **AND** `lifecycle.schemaInfo` is `null`
