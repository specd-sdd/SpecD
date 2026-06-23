# Verification: Problem Json

## Requirements

### Requirement: error responses use application/problem+json

#### Scenario: Kernel error maps to problem+json

- **WHEN** handler catches `SpecdError`
- **THEN** Content-Type is application/problem+json
- **AND** status matches error

#### Scenario: Validation failure uses problem shape

- **WHEN** input validation fails on route
- **THEN** HTTP 400 with problem body
- **AND** includes title field

#### Scenario: Unexpected errors still use JSON envelope

- **WHEN** unhandled throw escapes handler
- **THEN** response is not HTML
- **AND** client adapter can parse or fallback

### Requirement: SpecdError codes are preserved in the problem body

#### Scenario: Specd code extension is included

- **GIVEN** `ArtifactConflictError` thrown
- **WHEN** mapped to HTTP response
- **THEN** problem body includes specd code
- **AND** client can branch on 409

#### Scenario: Safe details only in payload

- **WHEN** error mapped to problem
- **THEN** no stack traces in production body
- **AND** title is human-readable

#### Scenario: Client adapter reads extensions

- **WHEN** remote adapter parses problem body
- **THEN** `SpecdClientError` preserves code
- **AND** UI shows message
