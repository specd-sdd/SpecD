# Verification: DTO Validate Batch Result

## Requirements

### Requirement: ValidateBatchResultDto

#### Scenario: Batch response parses in API and client

- **WHEN** OpenAPI or client types describe `validate-all` response
- **THEN** `passed`, `total`, and `results` are required
- **AND** each result includes `spec`, `artifact`, `passed`, `failures`, `warnings`, `files`
