# Verification: Hooks Change Validate

## Requirements

### Requirement: runChangeValidation uses server batch for Validate All

#### Scenario: Validate All single port call

- **WHEN** `runChangeValidation` runs without `filename`
- **THEN** `validateChangeAll` is invoked once
- **AND** `validateChange` is not invoked

#### Scenario: Inspector validate single step

- **WHEN** `runChangeValidation` runs with a change-relative `filename`
- **THEN** `validateChange` is invoked once with derived ids
- **AND** `validateChangeAll` is not invoked
