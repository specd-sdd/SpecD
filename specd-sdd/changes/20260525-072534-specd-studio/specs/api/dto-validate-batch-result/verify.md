# Verification: DTO Validate Batch Result

## Requirements

### Requirement: ValidateBatchResultDto

#### Scenario: Batch response parses in API and client

- **WHEN** OpenAPI or client types describe `validate-all` response
- **THEN** `passed`, `total`, and `results` are required
- **AND** each result includes `spec`, `artifact`, `passed`, `failures`, `warnings`, `files`

### Requirement: ValidateBatchStepResultDto

#### Scenario: ValidateBatchStepResultDto — primary path

- **WHEN** Each step MUST include spec: string | null,
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: ValidateBatchStepResultDto — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: parity with client DTO

#### Scenario: parity with client DTO — primary path

- **WHEN** [client:dto-validate-batch-result](../client/dto-validate-batch-result/spec.md) MUST stay structurally identical to this wire
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: parity with client DTO — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
