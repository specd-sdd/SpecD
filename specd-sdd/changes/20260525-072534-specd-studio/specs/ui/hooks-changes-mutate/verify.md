# Verification: Hooks Changes Mutate

## Requirements

### Requirement: mutate hooks delegate to port-changes-mutate

#### Scenario: Transition calls port-changes-mutate

- **WHEN** user approves a lifecycle transition in UI
- **THEN** `transitionChange` runs via port
- **AND** status refetch follows success

#### Scenario: 409 from save is forwarded

- **GIVEN** save returns `ArtifactConflictError`
- **WHEN** mutate hook completes
- **THEN** error reaches inspector save hook
- **AND** error is not swallowed

#### Scenario: Validate uses mutate port with scope

- **WHEN** user clicks Validate on artifact tab
- **THEN** `validateChange` receives file/artifact scope
- **AND** problems update

### Requirement: mutate hooks surface save conflicts to the inspector

#### Scenario: 409 from save reaches inspector

- **GIVEN** save returns conflict
- **WHEN** mutate hook completes
- **THEN** error forwarded to save hook
- **AND** inspector shows conflict UI

#### Scenario: Non-conflict errors use toast

- **WHEN** save returns 400 validation error
- **THEN** generic error message shown
- **AND** no conflict dialog

#### Scenario: Successful mutate clears error state

- **WHEN** transition succeeds
- **THEN** mutate hook error cleared
- **AND** status refetch scheduled
