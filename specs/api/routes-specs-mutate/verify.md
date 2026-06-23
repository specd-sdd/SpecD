# Verification: Routes Specs Mutate

## Requirements

### Requirement: POST validate runs structural ValidateSpecs

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: POST validate runs ValidateSpecs

- **WHEN** `POST /v1/workspaces/{ws}/specs/validate` is called with `specPath`
- **THEN** `ValidateSpecs` executes
- **AND** response lists structural validation findings

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: spec validation inputs are schema-validated

#### Scenario: Validate rejects empty workspace id or malformed params

- **WHEN** route params do not satisfy the declared schema
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`

#### Scenario: Validate rejects blank specPath query

- **WHEN** `POST /v1/workspaces/{ws}/specs/validate?specPath=`
- **THEN** HTTP 400 is returned
- **AND** code is `INVALID_REQUEST`
