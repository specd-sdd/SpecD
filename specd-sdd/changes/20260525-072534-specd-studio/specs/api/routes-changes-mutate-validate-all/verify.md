# Verification: validate-all route

## Requirements

### Requirement: POST validate-all delegates to ValidateChangeBatch

#### Scenario: Active change returns batch envelope

- **GIVEN** API server with an active change
- **WHEN** `POST /v1/changes/{name}/validate-all` with `{}`
- **THEN** HTTP 200 with `passed`, `total`, and `results[]`
- **AND** each result has `spec`, `artifact`, `passed`, `failures`, `warnings`, `files`

#### Scenario: artifactId query filters steps

- **GIVEN** active change
- **WHEN** `POST .../validate-all` with `{ "artifactId": "proposal" }`
- **THEN** every `results[].artifact` equals `proposal`

### Requirement: single-step validate unchanged

#### Scenario: validate endpoint still returns flat DTO

- **WHEN** `POST /v1/changes/{name}/validate` with `{ "specId": "core:foo", "artifactId": "specs" }`
- **THEN** body has top-level `passed`, `failures`, `warnings`, `files` without `results` array
