# Verification: Routes Changes Read

## Requirements

### Requirement: read routes use /v1 prefix and JSON responses

#### Scenario: GET detail uses /v1/changes/:name

- **WHEN** `GET /v1/changes/foo`
- **THEN** JSON response
- **AND** Content-Type application/json

#### Scenario: GET status uses /v1 prefix

- **WHEN** `GET /v1/changes/foo/status`
- **THEN** JSON status DTO returned
- **AND** unprefixed route not registered

#### Scenario: GET artifact uses /v1 path

- **WHEN** `GET /v1/changes/foo/artifacts/proposal.md`
- **THEN** JSON or structured body per contract
- **AND** 404 problem+json when missing

### Requirement: /changes read routes resolve active changes only

#### Scenario: Drafted name under /changes returns 404

- **GIVEN** a change named `foo` exists only under drafts
- **WHEN** `GET /v1/changes/foo`
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: GET change detail omits artifact bodies

#### Scenario: Artifact body served via GetChangeArtifact

- **GIVEN** tracked artifact `proposal.md` exists on change `foo`
- **WHEN** `GET /v1/changes/foo/artifacts/proposal.md`
- **THEN** `GetChangeArtifact` is invoked
- **AND** response includes `content` and `originalHash`

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Change detail JSON excludes artifact bodies

- **WHEN** `GET /v1/changes/{name}` returns change detail
- **THEN** artifact entries list filenames and hashes only
- **AND** response does not inline artifact `content`

### Requirement: GET status supports ifModifiedSince short-circuit

#### Scenario: Matching revision returns unchanged

- **GIVEN** change `foo` has `updatedAt` `2026-05-25T10:00:00.000Z`
- **WHEN** `GET /v1/changes/foo/status?ifModifiedSince=2026-05-25T10:00:00.000Z`
- **THEN** response includes `unchanged: true`
- **AND** response includes the same `updatedAt`
- **AND** full artifact DAG is omitted

#### Scenario: GET /changes/{name}/status returns expected payload

- **WHEN** client calls `GET /changes/{name}/status`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: Unchanged status skips redundant work

- **GIVEN** client cached manifest `updatedAt`
- **WHEN** status is requested with matching `ifModifiedSince`
- **THEN** response may include `unchanged: true`
- **AND** client avoids refetching unchanged artifacts

### Requirement: refreshImplementation query runs before GetStatus

#### Scenario: refreshImplementation=true triggers refresh use case

- **WHEN** `GET /v1/changes/foo/status?refreshImplementation=true`
- **THEN** implementation refresh runs before GetStatus
- **AND** status reflects refreshed tracking

#### Scenario: Omitted flag skips refresh

- **WHEN** `GET /v1/changes/foo/status` without query
- **THEN** GetStatus only
- **AND** no filesystem scan for implementation

#### Scenario: Refresh failure surfaces in status

- **GIVEN** implementation scan errors
- **WHEN** refresh query is true
- **THEN** status includes error or stale flag
- **AND** HTTP still 200 with diagnostic fields

### Requirement: artifact list and body routes use dedicated core use cases

#### Scenario: Active artifact body via GetChangeArtifact

- **GIVEN** tracked artifact `proposal.md` exists on active change `foo`
- **WHEN** `GET /v1/changes/foo/artifacts/proposal.md`
- **THEN** `GetChangeArtifact` is invoked
- **AND** response includes `content` and `originalHash`

#### Scenario: Draft artifact body via GetReadOnlyChangeArtifact

- **GIVEN** tracked artifact `proposal.md` on drafted change `foo`
- **WHEN** `GET /v1/drafts/foo/artifacts/proposal.md`
- **THEN** `GetReadOnlyChangeArtifact` runs with `readOnlyOrigin` `draft`
- **AND** response includes `content` and `originalHash`
- **AND** `GetChangeArtifact` is not invoked

#### Scenario: Discarded artifact body via GetReadOnlyChangeArtifact

- **GIVEN** tracked artifact `proposal.md` on discarded change `foo`
- **WHEN** `GET /v1/discarded/foo/artifacts/proposal.md`
- **THEN** `GetReadOnlyChangeArtifact` runs with `readOnlyOrigin` `discarded`
- **AND** `GetChangeArtifact` is not invoked

#### Scenario: GET .../artifacts returns expected payload

- **WHEN** client calls `GET .../artifacts`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: GET .../artifacts/{filename} returns expected payload

- **WHEN** client calls `GET .../artifacts/{filename}`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: context preview and instruction routes delegate to kernel

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: drafted change read routes are separate and read-only

#### Scenario: GET /drafts/:name returns change detail

- **GIVEN** drafted change `foo` exists
- **WHEN** `GET /v1/drafts/foo`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches `ChangeDetailDto`

#### Scenario: Draft routes do not allow artifact writes

- **WHEN** client calls `PUT /v1/drafts/foo/artifacts/proposal.md`
- **THEN** HTTP 404 is returned (route not registered) or 405

### Requirement: discarded change read routes are separate and read-only

#### Scenario: GET /discarded/:name returns change detail

- **GIVEN** discarded change `foo` exists
- **WHEN** `GET /v1/discarded/foo`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches `ChangeDetailDto`

#### Scenario: GET .../context returns expected payload

- **WHEN** client calls `GET .../context`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: unknown change returns 404 problem+json

#### Scenario: Unknown resource returns 404 problem+json

- **WHEN** client requests missing change name
- **THEN** HTTP 404
- **AND** Content-Type is application/problem+json

#### Scenario: Kernel errors serialize as problem+json

- **WHEN** kernel throws a domain error for this route
- **THEN** `Content-Type` is `application/problem+json`
- **AND** body includes `status` and `title`

#### Scenario: Unknown change name returns 404

- **WHEN** `GET /v1/changes/missing` is requested
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: POST preview accepts draft artifact overrides

#### Scenario: POST preview with overrides returns merged draft

- **GIVEN** active change and valid specId
- **WHEN** `POST /v1/changes/{name}/preview` with body `{ specId, artifactOverrides: { "deltas/.../spec.md.delta.yaml": "<draft>" } }`
- **THEN** HTTP 200
- **AND** `files[].merged` reflects draft not on-disk delta

#### Scenario: GET preview unchanged without body

- **WHEN** `GET /v1/changes/{name}/preview?specId=...`
- **THEN** preview uses saved change artifacts only

### Requirement: POST change artifact outline accepts draft content

#### Scenario: POST outline with content for change artifact

- **GIVEN** change artifact path under change directory
- **WHEN** `POST /v1/changes/{name}/artifacts/{filename}/outline` with `{ content: "# Title\n" }`
- **THEN** HTTP 200
- **AND** JSON includes `outline` array

### Requirement: read-route inputs are schema-validated

#### Scenario: GET preview rejects missing specId

- **WHEN** client calls `GET /v1/changes/{name}/preview` without `specId`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`
- **AND** code is `INVALID_REQUEST`

#### Scenario: hook instructions reject invalid phase

- **WHEN** client calls `GET /v1/changes/{name}/hook-instructions?phase=before`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`

#### Scenario: POST outline without content uses saved file

- **GIVEN** artifact exists on change
- **WHEN** POST outline with empty body
- **THEN** outline matches saved bytes
