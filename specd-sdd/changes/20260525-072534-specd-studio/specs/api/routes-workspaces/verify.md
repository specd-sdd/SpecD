# Verification: Routes Workspaces

## Requirements

### Requirement: GET workspaces lists configured workspaces

#### Scenario: Workspaces endpoint returns yaml workspaces

- **GIVEN** `specd.yaml` lists `core` and `cli`
- **WHEN** `GET /v1/workspaces`
- **THEN** JSON array includes both ids
- **AND** paths are relative to project root

#### Scenario: Empty workspace config yields empty list

- **GIVEN** no workspaces configured
- **WHEN** workspaces endpoint is called
- **THEN** HTTP 200 with `[]`
- **AND** UI shows empty state

#### Scenario: Workspace ids are stable keys for tree route

- **WHEN** UI selects workspace from list
- **THEN** same id works in `/v1/specs/tree?workspace=`
- **AND** no duplicate ids

### Requirement: GET spec tree and metadata without inline bodies

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

#### Scenario: GET /v1/workspaces/{ws}/specs returns expected payload

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: canonical spec artifacts are read-only in Studio v1

#### Scenario: Artifact body served via GetChangeArtifact

- **GIVEN** tracked artifact `proposal.md` exists on change `foo`
- **WHEN** `GET /v1/changes/foo/artifacts/proposal.md`
- **THEN** `GetChangeArtifact` is invoked
- **AND** response includes `content` and `originalHash`

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Canonical workspace artifact cannot be mutated

- **WHEN** client attempts a mutating verb on a workspace canonical artifact route
- **THEN** Studio v1 does not expose a write route
- **AND** on-disk canonical spec is unchanged

### Requirement: outline and context routes follow kernel contracts

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

#### Scenario: GET .../outline returns expected payload

- **WHEN** client calls `GET .../outline`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: GET specs search accepts q and workspace filter

#### Scenario: Search with q returns ranked specs

- **WHEN** `GET /v1/specs/search?q=archive`
- **THEN** results include matching spec ids
- **AND** scores or ordering documented

#### Scenario: Workspace filter limits results

- **WHEN** `GET /v1/specs/search?q=change&workspace=core`
- **THEN** only `core` specs returned
- **AND** other workspaces excluded

#### Scenario: Empty q returns validation error or empty set

- **WHEN** search called without `q`
- **THEN** HTTP 400 or empty list per contract
- **AND** UI prompts for query
