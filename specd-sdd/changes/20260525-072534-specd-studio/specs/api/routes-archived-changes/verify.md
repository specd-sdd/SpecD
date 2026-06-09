# Verification: Routes Archived Changes

## Requirements

### Requirement: GET archived change returns read-only archived detail

#### Scenario: Unknown resource returns 404 problem+json

- **WHEN** client requests missing change name
- **THEN** HTTP 404
- **AND** Content-Type is application/problem+json

#### Scenario: GET /v1/archived-changes/{name} returns expected payload

- **WHEN** client calls `GET /v1/archived-changes/{name}`
- **THEN** HTTP status is 2xx
- **AND** JSON body includes `name`, `state`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, `history`, `workspaces`, and `artifacts`
- **AND** archived `artifacts[]` does not contain rows with state `missing`
- **AND** task-capable archived artifact rows preserve `hasTasks`
- **AND** task counters may be exposed from archived content when available

#### Scenario: Archived change snapshot is not served from active change route

- **GIVEN** change exists only in archive
- **WHEN** client calls `GET /v1/changes/{name}`
- **THEN** HTTP 404 problem+json
- **AND** archived snapshot is available at `/v1/archived-changes/{name}`

### Requirement: GET archived artifact body returns tracked read-only content

#### Scenario: GET /v1/archived-changes/{name}/artifacts/{filename} returns content

- **WHEN** client calls the archived artifact GET route for a tracked file
- **THEN** HTTP status is 2xx
- **AND** JSON body includes `content`

#### Scenario: Archived artifact route does not use active artifact path

- **GIVEN** change exists only in archive
- **WHEN** client requests an artifact body
- **THEN** the archived route succeeds
- **AND** active `/v1/changes/{name}/artifacts/{filename}` does not become the fallback

#### Scenario: Kernel errors serialize as problem+json

- **WHEN** kernel throws a domain error for this route
- **THEN** `Content-Type` is `application/problem+json`
- **AND** body includes `status` and `title`
