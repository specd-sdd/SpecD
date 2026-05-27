# Verification: Routes Archived Changes

## Requirements

### Requirement: GET archived change returns manifest snapshot

#### Scenario: Unknown resource returns 404 problem+json

- **WHEN** client requests missing change name
- **THEN** HTTP 404
- **AND** Content-Type is application/problem+json

#### Scenario: GET /v1/archived-changes/{name} returns expected payload

- **WHEN** client calls `GET /v1/archived-changes/{name}`
- **THEN** HTTP status is 2xx
- **AND** JSON body includes `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, and `artifacts`

#### Scenario: Archived change snapshot is not served from active change route

- **GIVEN** change exists only in archive
- **WHEN** client calls `GET /v1/changes/{name}`
- **THEN** HTTP 404 problem+json
- **AND** archived snapshot is available at `/v1/archived-changes/{name}`

#### Scenario: Kernel errors serialize as problem+json

- **WHEN** kernel throws a domain error for this route
- **THEN** `Content-Type` is `application/problem+json`
- **AND** body includes `status` and `title`
