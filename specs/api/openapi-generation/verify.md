# Verification: Openapi Generation

## Requirements

### Requirement: OpenAPI is generated from Fastify route schemas

#### Scenario: Each routes spec path appears in OpenAPI

- **WHEN** OpenAPI is generated from the mounted Fastify routes
- **THEN** documented HTTP methods exist
- **AND** request/response schemas reference DTO specs

#### Scenario: DTO changes update component schemas

- **GIVEN** `api:dto-change-status` adds field
- **WHEN** OpenAPI is regenerated
- **THEN** component schema includes new property
- **AND** CI diff catches drift

#### Scenario: Undocumented handler routes are absent

- **WHEN** generated OpenAPI is compared to the mounted router
- **THEN** no orphan paths in doc
- **AND** no orphan paths only in code

### Requirement: document version tracks API prefix

#### Scenario: Info version matches /v1 contract

- **WHEN** openapi.json `info.version` is read
- **THEN** version bumps when breaking /v1 change ships
- **AND** patch releases documented in changelog

#### Scenario: Servers entry uses configured base URL

- **GIVEN** serve binds to `http://127.0.0.1:4400`
- **WHEN** OpenAPI servers section is generated
- **THEN** server URL matches runtime
- **AND** paths remain relative to /v1

#### Scenario: Breaking rename requires version bump

- **WHEN** required JSON field renamed
- **THEN** OpenAPI version increments or CI fails
- **AND** clients know to regenerate types
