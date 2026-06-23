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

### Requirement: flattenBatchValidateResult for shell output

#### Scenario: flattenBatchValidateResult for shell output — primary path

- **WHEN** MUST merge batch step failures, warnings, and files
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: flattenBatchValidateResult for shell output — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
