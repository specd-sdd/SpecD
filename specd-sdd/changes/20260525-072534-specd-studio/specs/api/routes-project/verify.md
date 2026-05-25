# Verification: Routes Project

## Requirements

### Requirement: project routes expose config status context and schema

#### Scenario: GET /project returns project envelope

- **WHEN** `GET /v1/project`
- **THEN** workspaces and schema metadata returned
- **AND** `auth.type` included without secrets

#### Scenario: GET /project returns expected payload

- **WHEN** client calls `GET /project`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: POST /project/schema/validate returns expected payload

- **WHEN** client calls `POST /project/schema/validate`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: project status aggregates lists and graph freshness

#### Scenario: GET /project/status includes graph freshness

- **WHEN** `GET /v1/project/status`
- **THEN** list counts match CLI project status
- **AND** graph stale flag is exposed

#### Scenario: GET /project/status returns expected payload

- **WHEN** client calls `GET /project/status`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: GET project echoes auth type for clients

#### Scenario: GET /project exposes auth type

- **WHEN** `GET /v1/project` on running server
- **THEN** `auth.type` matches effective config
- **AND** no token material in JSON

#### Scenario: GET /project returns expected payload

- **WHEN** client calls `GET /project`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`
