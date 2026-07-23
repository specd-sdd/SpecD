# Verification: Get Specs Health

## Requirements

### Requirement: Filter successful validations

#### Scenario: Exclude clean specs from issues list

- **GIVEN** a workspace containing both clean specs and specs with validation errors or warnings
- **WHEN** `GetSpecsHealth.execute()` is called
- **THEN** the returning `issues` array SHALL NOT contain any entries for specs that passed cleanly
- **AND** the `issues` array SHALL contain entries for specs with errors or warnings

### Requirement: Health statistics aggregation

#### Scenario: Aggregate overall counts

- **GIVEN** a workspace with 5 specs: 2 clean, 2 with errors, and 1 with only warnings
- **WHEN** `GetSpecsHealth.execute()` is called
- **THEN** `totalSpecs` SHALL be 5
- **AND** `passed` SHALL be 2
- **AND** `failed` SHALL be 2
- **AND** `warned` SHALL be 1

### Requirement: Consolidated diagnostics

#### Scenario: Single issue entry per spec containing both failures and warnings

- **GIVEN** a spec that has 1 local validation failure and 1 validation warning
- **WHEN** `GetSpecsHealth.execute()` is called
- **THEN** the spec SHALL appear exactly once in the `issues` array
- **AND** its `passed` property SHALL be false
- **AND** its `failures` array SHALL contain the failure detail object
- **AND** its `warnings` array SHALL contain the warning detail object

### Requirement: Workspace filtering

#### Scenario: Filter validation by workspace

- **GIVEN** a multi-workspace setup
- **WHEN** `GetSpecsHealth.execute()` is called with `workspace: 'core'`
- **THEN** only specs belonging to the `core` workspace are validated and counted
- **AND** statistics represent the `core` workspace only
