# Verification: Serve Api

## Requirements

### Requirement: serve command exposes port host config and auth flags

#### Scenario: specd serve accepts port and host flags

- **WHEN** `specd serve --port 4500 --host 0.0.0.0` runs
- **THEN** server binds to requested host/port
- **AND** project is discovered from cwd

#### Scenario: Default port is 4400 on loopback

- **WHEN** `specd serve` runs without port flag
- **THEN** listens on 127.0.0.1:4400
- **AND** health responds on `/v1`

#### Scenario: Config path flag is honored

- **WHEN** `specd serve -c ./other.yaml` runs
- **THEN** loaded config comes from given path
- **AND** auth uses that file `api.auth`

### Requirement: serve auth flag accepts only disabled in v1

#### Scenario: serve --auth disabled starts

- **WHEN** `specd serve --auth disabled` runs
- **THEN** exit code 0
- **AND** effective auth is disabled

#### Scenario: Invalid auth flag exits

- **WHEN** `specd serve --auth jwt` runs
- **THEN** non-zero exit
- **AND** stderr mentions only `disabled` is supported

#### Scenario: Omitted auth uses yaml default

- **GIVEN** `specd.yaml` sets `api.auth.type: disabled`
- **WHEN** `specd serve` runs
- **THEN** server starts
- **AND** project payload shows `auth.type: disabled`

### Requirement: serve discovers project and starts default auth registry

#### Scenario: serve loads specd.yaml from cwd

- **GIVEN** valid project in current directory
- **WHEN** `specd serve` starts
- **THEN** kernel bootstraps
- **AND** `GET /v1/project` succeeds

#### Scenario: Default auth registry registers disabled verifier

- **WHEN** serve starts without `--auth` override
- **THEN** `AuthAdapterRegistry` has disabled factory
- **AND** middleware uses disabled verifier

#### Scenario: Missing project fails fast

- **WHEN** `specd serve` runs outside a project
- **THEN** non-zero exit
- **AND** stderr mentions missing `specd.yaml`
