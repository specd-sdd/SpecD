# Verification: DTO Validate Batch Result

## Requirements

### Requirement: ValidateBatchResultDto

#### Scenario: Client parses batch response

- **WHEN** client parses `POST .../validate-all` JSON
- **THEN** `ValidateBatchResultDto` matches API wire shape field-for-field

### Requirement: ValidateBatchStepResultDto

#### Scenario: ValidateBatchStepResultDto — primary path

- **WHEN** Each step MUST include: - spec: string |
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: ValidateBatchStepResultDto — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
