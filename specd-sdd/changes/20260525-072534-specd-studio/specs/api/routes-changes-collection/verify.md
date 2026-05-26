# Verification: Routes Changes Collection

## Requirements

### Requirement: collection routes list changes drafts discarded and archived

#### Scenario: GET /changes returns sidebar summaries

- **WHEN** `GET /v1/changes` is called
- **THEN** each row includes name, state, and `updatedAt`
- **AND** blocker count is present when known

#### Scenario: GET /changes returns expected payload

- **WHEN** client calls `GET /changes`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: GET archived-changes returns name and archivedName

- **WHEN** client calls `GET /v1/archived-changes`
- **THEN** HTTP status is 2xx
- **AND** each array element includes `name` and `archivedName`

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: POST changes creates a new change

#### Scenario: POST /changes validates input

- **WHEN** `POST /v1/changes` with invalid body
- **THEN** HTTP 400 problem+json
- **AND** no change directory created

#### Scenario: POST /changes returns expected payload

- **WHEN** client calls `POST /changes`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: list responses include summary fields for sidebars

#### Scenario: Each change row includes name and state

- **WHEN** `GET /v1/changes` returns list
- **THEN** items have `name` and lifecycle `state`
- **AND** UI can render sidebar without detail fetch

#### Scenario: updatedAt is present for polling

- **WHEN** list endpoint serializes changes
- **THEN** `updatedAt` ISO string on each row
- **AND** hooks can compare for refresh

#### Scenario: Blocker count included when known

- **GIVEN** change has validation blockers
- **WHEN** list response is built
- **THEN** summary includes blocker count or flag
- **AND** full findings are not inlined

### Requirement: archived-changes list returns name and archivedName pairs

#### Scenario: archived-changes list returns name and archiv… — primary path

- **WHEN** GET /v1/archived-changes MUST return a JSON array of
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: archived-changes list returns name and archiv… — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
