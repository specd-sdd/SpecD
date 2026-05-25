# Verification: Routes Specs Read

## Requirements

### Requirement: read routes mirror workspace spec discovery without reverse change links

#### Scenario: Versioned API path

- **WHEN** client calls the documented route with `/v1` prefix
- **THEN** route handler is reached
- **AND** unprefixed legacy path is not registered

#### Scenario: Undocumented path returns 404

- **WHEN** client requests a URL outside this routes contract
- **THEN** HTTP 404 is returned
- **AND** body is `application/problem+json`

#### Scenario: There is no linked-changes reverse-lookup endpoint

- **WHEN** client searches for `GET .../linked-changes` under workspace specs
- **THEN** route is not registered
- **AND** HTTP 404

### Requirement: POST spec outline accepts draft content

#### Scenario: POST outline with draft body

- **GIVEN** workspace `ws` and spec path `foo/bar`
- **WHEN** `POST /v1/workspaces/ws/specs/foo/bar/outline` with `{ filename: "spec.md", content: "# H\n" }`
- **THEN** HTTP 200
- **AND** response is JSON array of outline entries
