# Verification: Routes Changes Collection

## Requirements

### Requirement: collection routes list changes drafts discarded and archived

#### Scenario: GET /changes returns sidebar summaries

- **WHEN** `GET /v1/changes` is called
- **THEN** each row includes name, state, and `updatedAt`
- **AND** blocker count is present when known

### Requirement: drafts and discarded are read-only collections

#### Scenario: GET /drafts returns sidebar summaries (read-only)

- **WHEN** `GET /v1/drafts` is called
- **THEN** each row includes name, state, and `updatedAt`
- **AND** response is navigation-only (no per-row action fields)

#### Scenario: GET /discarded returns sidebar summaries (read-only)

- **WHEN** `GET /v1/discarded` is called
- **THEN** each row includes name, state, and `updatedAt`

#### Scenario: GET archived-changes returns archive index payload

- **WHEN** client calls `GET /v1/archived-changes`
- **THEN** HTTP status is 2xx
- **AND** body contains `items` and `meta`
- **AND** each item includes `name` and `archivedName`

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

### Requirement: POST changes separates request validation from schema preconditions

#### Scenario: Invalid request shape fails before schema lookup

- **WHEN** `POST /v1/changes` omits required request fields
- **THEN** HTTP 400 `application/problem+json` is returned
- **AND** the handler does not create a change

#### Scenario: Raw active schema blocks creation as business precondition

- **GIVEN** the active schema resolves only to a raw reference
- **WHEN** client sends an otherwise valid `POST /v1/changes`
- **THEN** change creation is rejected after request validation
- **AND** the failure is reported as a schema precondition, not as an input-shape validation error

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

### Requirement: archived-changes list returns paginated archive index rows

#### Scenario: GET archived-changes returns both identifiers and pagination metadata

- **WHEN** client calls `GET /v1/archived-changes`
- **THEN** each `items` element includes `name` and `archivedName`
- **AND** the response includes `meta.total`, `meta.count`, and `meta.limit`
- **AND** Studio can render archive rows without an additional lookup

#### Scenario: Empty archive returns an empty list

- **WHEN** there are no archived changes
- **THEN** HTTP 200 is returned with `items: []`
- **AND** no synthetic placeholder rows are added
