# Verification: Openapi Docs Route

## Requirements

### Requirement: openapi.json is served at a documented path

#### Scenario: OpenAPI document available at documented endpoint

- **WHEN** client fetches the documented OpenAPI endpoint
- **THEN** HTTP 200
- **AND** Content-Type is `application/json`

#### Scenario: Document describes the v1 contract surface

- **WHEN** openapi.json is parsed
- **THEN** the document describes the Studio API contract (routes, DTO schemas, auth schemes)

#### Scenario: Document endpoint survives server restart

- **GIVEN** server restarted with same build
- **WHEN** openapi.json is fetched again
- **THEN** same URL works
- **AND** schema version field is present

### Requirement: OpenAPI docs UI is optional

#### Scenario: No interactive docs UI is required

- **WHEN** Studio API is served
- **THEN** the OpenAPI JSON endpoint remains available regardless of whether any interactive docs UI is mounted
