# Verification: Routes Specs Mutate

## Requirements

### Requirement: POST validate runs structural ValidateSpecs

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: POST validate runs ValidateSpecs

- **WHEN** `POST /v1/workspaces/{ws}/specs/validate` is called with `specPath`
- **THEN** `ValidateSpecs` executes
- **AND** response lists structural validation findings

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

### Requirement: POST metadata saves or regenerates spec metadata files

#### Scenario: POST metadata save writes sidecar files

- **WHEN** `POST /v1/specs/.../metadata` with save payload
- **THEN** metadata files updated on disk
- **AND** response confirms paths

#### Scenario: POST metadata regenerate rebuilds from spec body

- **WHEN** regenerate action requested
- **THEN** metadata extractor runs
- **AND** verify scenarios counts updated

#### Scenario: Invalid spec path returns 400

- **WHEN** POST targets non-existent spec
- **THEN** HTTP 400 problem+json
- **AND** no partial writes
