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

### Requirement: GET workspace spec tree lists canonical specs without artifact bodies

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

#### Scenario: GET /v1/workspaces/{ws}/specs returns tree payload only

- **WHEN** client calls `GET /v1/workspaces/{ws}/specs`
- **THEN** HTTP status is 2xx
- **AND** JSON body contains tree metadata without canonical artifact file bodies

#### Scenario: Per-spec detail is not served from the tree route

- **WHEN** client needs a canonical spec detail document
- **THEN** it must follow the per-spec wildcard route
- **AND** the tree response remains a discovery payload rather than a detail payload
