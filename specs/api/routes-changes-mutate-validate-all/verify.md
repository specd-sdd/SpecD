# Verification: Routes Changes Mutate — validate-all

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

### Requirement: response shape

#### Scenario: response shape — primary path

- **WHEN** The response MUST be ValidateBatchResultDto: json { passed:
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: response shape — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: single-step validate unchanged

#### Scenario: validate endpoint still returns flat DTO

- **WHEN** `POST /v1/changes/{name}/validate` with `{ "specId": "core:foo", "artifactId": "specs" }`
- **THEN** body has top-level `passed`, `failures`, `warnings`, `files` without `results` array
