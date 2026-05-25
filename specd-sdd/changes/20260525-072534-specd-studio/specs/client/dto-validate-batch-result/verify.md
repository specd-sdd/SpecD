# Verification: client DTO validate batch result

## Requirements

### Requirement: ValidateBatchResultDto

#### Scenario: Client parses batch response

- **WHEN** client parses `POST .../validate-all` JSON
- **THEN** `ValidateBatchResultDto` matches API wire shape field-for-field
