# Verification: Composition Create Api Server

## Requirements

### Requirement: createApiServer accepts project host port and auth configuration

#### Scenario: Factory returns listening server

- **WHEN** `createApiServer({ projectRoot, host, port, auth })` runs
- **THEN** HTTP server listens on host/port
- **AND** return value is stoppable

#### Scenario: Invalid project root fails fast

- **WHEN** projectRoot lacks `specd.yaml`
- **THEN** startup error before listen
- **AND** no partial route registration

#### Scenario: Optional uiDistPath serves static files

- **GIVEN** `uiDistPath` provided
- **WHEN** server starts
- **THEN** `/` serves UI assets
- **AND** `/v1` still serves API

### Requirement: auth configuration is read from specd.yaml api.auth only

#### Scenario: CLI rejects non-disabled auth in v1

- **WHEN** `specd serve --auth bearer` runs
- **THEN** non-zero exit
- **AND** stderr explains only `disabled` supported

#### Scenario: Effective auth from yaml not studio keys

- **GIVEN** `specd.yaml` sets `api.auth.type: disabled`
- **WHEN** server boots
- **THEN** middleware uses disabled verifier
- **AND** no `studio.*` auth keys consulted

#### Scenario: CLI override merges with yaml

- **GIVEN** yaml and `--auth disabled`
- **WHEN** `createApiServer` resolves auth
- **THEN** effective type is `disabled`

### Requirement: one kernel per process with per-request context

#### Scenario: createApiServer uses createSdkContext

- **WHEN** `createApiServer` is called for a project root
- **THEN** it awaits `createSdkContext` from `@specd/sdk` exactly once per process
- **AND** `createApiContext` builds per-request context from the resulting `ApiServerState`

#### Scenario: Log formatter disables ANSI for API readback

- **WHEN** the API kernel boots
- **THEN** `createSdkContext` receives `logFormatter: createLogFormatter({ colorize: false })`

### Requirement: all API routes mount under /v1

#### Scenario: Project route is under /v1

- **WHEN** `GET /v1/project` requested
- **THEN** handler responds
- **AND** `GET /project` is not registered

#### Scenario: Changes routes are under /v1

- **WHEN** `GET /v1/changes` requested
- **THEN** collection handler runs

#### Scenario: Graph routes are under /v1

- **WHEN** `GET /v1/graph/status` requested
- **THEN** graph handler runs

### Requirement: health or project payload exposes auth type without secrets

#### Scenario: GET project echoes auth type

- **WHEN** `GET /v1/project` succeeds
- **THEN** JSON includes `auth: { type }`
- **AND** no tokens or key paths in body

#### Scenario: Health endpoint is safe to expose

- **WHEN** `GET /v1/health` called
- **THEN** HTTP 200
- **AND** body has no secret material

#### Scenario: Auth type matches effective configuration

- **GIVEN** yaml sets disabled
- **WHEN** project endpoint queried
- **THEN** `auth.type` is `disabled`
