# Verification: Routes Project Logs

## Requirements

### Requirement: GET and POST /v1/logs

#### Scenario: POST then GET returns studio log line

- **WHEN** client POSTs `{ level: "debug", message: "studio action" }` to `/v1/logs`
- **THEN** response is 200
- **AND** `GET /v1/logs` includes that message in entries

#### Scenario: POST rejects invalid level

- **WHEN** client POSTs an unsupported level
- **THEN** response is a problem+json error

### Requirement: no studio-specific output resource is exposed

#### Scenario: studio-specific output paths are rejected

- **WHEN** client calls a studio-specific output path under `/v1`
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`
- **AND** code is `NOT_FOUND`
- **AND** Studio session output must be maintained locally by the UI host

### Requirement: limits are server-enforced

#### Scenario: Excessive limit is capped

- **WHEN** client requests `limit=99999`
- **THEN** at most 500 entries are returned

### Requirement: log-route inputs are schema-validated

#### Scenario: POST logs rejects invalid level

- **WHEN** client POSTs `{ "level": "trace", "message": "bad" }` to `/v1/logs`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`
- **AND** code is `INVALID_REQUEST`
