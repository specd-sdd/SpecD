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

### Requirement: GET and POST /v1/studio/output

#### Scenario: POST appends warn line to output list

- **WHEN** client POSTs `{ level: "warn", message: "⚠ example" }` to `/v1/studio/output`
- **THEN** `GET /v1/studio/output` lists the message

### Requirement: limits are server-enforced

#### Scenario: Excessive limit is capped

- **WHEN** client requests `limit=99999`
- **THEN** at most 500 entries are returned
