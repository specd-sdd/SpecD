# Verification: Http Server Bootstrap

## Requirements

### Requirement: API routes are mounted under /v1

#### Scenario: Change routes live under /v1/changes

- **WHEN** integration client calls documented change route
- **THEN** path starts with `/v1`
- **AND** router does not expose unprefixed duplicates

#### Scenario: Project routes are prefixed

- **WHEN** `GET /v1/project` is requested
- **THEN** HTTP 200 JSON
- **AND** unprefixed `/project` is not registered

#### Scenario: Graph routes share /v1 namespace

- **WHEN** `GET /v1/graph/status` is requested
- **THEN** handler is reachable
- **AND** legacy non-/v1 graph paths are absent

### Requirement: health endpoint reports readiness and auth type

#### Scenario: Health returns 200 when server ready

- **GIVEN** kernel and routes mounted
- **WHEN** `GET /v1/health` is called
- **THEN** HTTP 200
- **AND** body includes readiness indicator

#### Scenario: Health exposes effective auth type

- **GIVEN** `api.auth.type` is `disabled`
- **WHEN** health endpoint responds
- **THEN** `auth.type` is `disabled`
- **AND** no secrets in payload

#### Scenario: Health fails before bootstrap completes

- **GIVEN** server still starting
- **WHEN** health is probed early
- **THEN** non-ready status or connection refused
- **AND** load balancer can retry

### Requirement: SIGINT triggers graceful shutdown

#### Scenario: SIGINT closes HTTP server

- **GIVEN** server listening
- **WHEN** process receives SIGINT
- **THEN** server stops accepting new connections
- **AND** in-flight requests drain or timeout

#### Scenario: Second SIGINT forces exit

- **GIVEN** graceful shutdown started
- **WHEN** SIGINT is sent again
- **THEN** process exits with non-zero code
- **AND** no hung listeners

#### Scenario: Shutdown releases kernel resources

- **WHEN** graceful shutdown completes
- **THEN** graph provider handles closed
- **AND** process exits cleanly

### Requirement: bootstrap uses createApiServer SDK wiring

#### Scenario: HTTP listen path uses SDK host context

- **WHEN** Studio starts the HTTP server for a project
- **THEN** `createApiServer` is used
- **AND** the process-scoped kernel is created only through `createSdkContext`
