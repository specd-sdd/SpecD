# Verification: Openapi Docs Route

## Requirements

### Requirement: openapi.json is served at a stable path

#### Scenario: OpenAPI document available at /v1/openapi.json

- **WHEN** client fetches documented path
- **THEN** HTTP 200
- **AND** Content-Type is `application/json`

#### Scenario: Document includes /v1 paths only

- **WHEN** openapi.json is parsed
- **THEN** paths keys start with `/v1`
- **AND** no duplicate unprefixed routes

#### Scenario: Stable path survives server restart

- **GIVEN** server restarted with same build
- **WHEN** openapi.json is fetched again
- **THEN** same URL works
- **AND** schema version field is present

### Requirement: interactive docs are environment-gated

#### Scenario: Swagger UI disabled in production profile

- **GIVEN** `NODE_ENV=production`
- **WHEN** browser requests `/docs`
- **THEN** HTTP 404 or redirect away
- **AND** openapi.json still available if enabled

#### Scenario: Dev profile serves interactive docs

- **GIVEN** development configuration
- **WHEN** browser opens `/docs`
- **THEN** Swagger UI loads
- **AND** points at `/v1/openapi.json`

#### Scenario: Docs do not expose secrets

- **WHEN** interactive docs render
- **THEN** no sample bearer tokens prefilled
- **AND** auth schemes document optional bearer only
