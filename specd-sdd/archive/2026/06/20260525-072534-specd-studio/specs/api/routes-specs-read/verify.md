# Verification: Routes Specs Read

## Requirements

### Requirement: wildcard spec detail route serves canonical spec detail

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

#### Scenario: Detail payload includes linked active change summaries

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs/{path}`
- **THEN** response includes canonical spec detail fields
- **AND** linked active changes are embedded in the response with `name`, `state`, and optional `description`

#### Scenario: There is no linked-changes reverse-lookup endpoint

- **WHEN** client searches for `GET .../linked-changes` under workspace specs
- **THEN** route is not registered
- **AND** HTTP 404

### Requirement: canonical artifact reads stay in specs-read

#### Scenario: Canonical artifact body is served from workspace spec route

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs/{path}/artifacts/{filename}`
- **THEN** response includes `content` and `originalHash`
- **AND** the artifact is read from the canonical workspace spec

#### Scenario: Canonical workspace artifact cannot be mutated

- **WHEN** client attempts a mutating verb on a workspace canonical artifact route
- **THEN** Studio v1 does not expose a write route
- **AND** on-disk canonical spec content is unchanged

### Requirement: POST spec outline accepts draft content

#### Scenario: POST outline with draft body

- **GIVEN** workspace `ws` and spec path `foo/bar`
- **WHEN** `POST /v1/workspaces/ws/specs/foo/bar/outline` with `{ filename: "spec.md", content: "# H\n" }`
- **THEN** HTTP 200
- **AND** response is JSON array of outline entries

### Requirement: metadata actions are exposed on the wildcard spec route

#### Scenario: POST metadata saves provided metadata content

- **WHEN** client POSTs `{ metadata: "title: X\n" }` to `/v1/workspaces/{ws}/specs/{path}/metadata`
- **THEN** metadata is persisted for the canonical spec
- **AND** response confirms success

#### Scenario: POST metadata generate rebuilds metadata

- **WHEN** client POSTs `{ generate: true }` to `/v1/workspaces/{ws}/specs/{path}/metadata`
- **THEN** metadata generation is triggered for that canonical spec
- **AND** response confirms generation

### Requirement: context and search follow canonical spec contracts

#### Scenario: GET context forwards canonical spec context query

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs/{path}/context?followDeps=true&depth=1`
- **THEN** HTTP 200 is returned
- **AND** response contains context entries and warnings from the canonical spec context use case

#### Scenario: GET context returns structured spec context payload

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs/{path}/context`
- **THEN** each entry includes `spec`, `source`, `mode`, and `stale`
- **AND** grouped fields like `rules`, `constraints`, `scenarios`, or `optimizedContent` are preserved when present
- **AND** response is not flattened into `CompiledContextDto.content`

#### Scenario: GET context defaults to full structured mode

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs/{path}/context` without extra shape flags
- **THEN** the root entry uses `mode = full`
- **AND** the route requests `rules`, `constraints`, and `scenarios` sections from the use case

#### Scenario: Search with q returns canonical spec summaries

- **WHEN** `GET /v1/specs/search?q=archive`
- **THEN** results include matching canonical spec summaries
- **AND** optional workspace filtering narrows the result set

### Requirement: spec-read route inputs are schema-validated

#### Scenario: Search rejects missing q

- **WHEN** client calls `GET /v1/specs/search` without `q`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`
- **AND** code is `INVALID_REQUEST`

#### Scenario: Metadata rejects empty body

- **WHEN** client POSTs `{}` to `/v1/workspaces/{ws}/specs/{path}/metadata`
- **THEN** HTTP 400 is returned
- **AND** body is `application/problem+json`

#### Scenario: Context rejects malformed numeric depth

- **WHEN** client calls `/v1/workspaces/{ws}/specs/{path}/context?depth=zero`
- **THEN** HTTP 400 is returned
- **AND** code is `INVALID_REQUEST`
