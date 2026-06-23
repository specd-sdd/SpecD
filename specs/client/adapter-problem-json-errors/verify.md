# Verification: Adapter Problem Json Errors

## Requirements

### Requirement: problem+json is parsed into SpecdClientError

#### Scenario: Problem body becomes SpecdClientError

- **GIVEN** response Content-Type is problem+json
- **WHEN** transport parses failure
- **THEN** error includes status and title
- **AND** specd code extension is preserved

#### Scenario: Non-problem HTML is not mislabeled

- **GIVEN** reverse proxy returns HTML error page
- **WHEN** transport parses response
- **THEN** generic HTTP error is thrown
- **AND** parser does not throw parse exception

#### Scenario: Success responses bypass parser

- **WHEN** HTTP 200 returns JSON DTO
- **THEN** body deserializes normally
- **AND** no error is thrown

### Requirement: 409 conflict preserves conflict metadata

#### Scenario: 409 retains conflict metadata

- **GIVEN** server returns 409 problem body
- **WHEN** adapter throws
- **THEN** error type is recognizable by save hook
- **AND** detail includes hash conflict context

#### Scenario: Inspector can show conflict UI

- **WHEN** save hook receives adapter error
- **THEN** UI offers keep local or reload server
- **AND** buffer not silently overwritten

#### Scenario: Non-409 errors use generic mapping

- **WHEN** server returns 400 problem
- **THEN** error surfaces validation message
- **AND** no conflict-specific UI
