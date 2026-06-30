# Verification: Handler Graph

## Requirements

### Requirement: handler implements the routes contract under /v1

#### Scenario: Only documented /v1 routes are registered

- **WHEN** HTTP server route table is inspected after bootstrap
- **THEN** every handler path matches `api:routes-graph` under `/v1`
- **AND** no undocumented shadow routes exist

#### Scenario: Declared GET route returns presenter-shaped JSON

- **WHEN** client calls a documented GET route with valid fixtures
- **THEN** HTTP status is 2xx
- **AND** body matches the paired `api:dto-*` spec

#### Scenario: Undeclared verb on a path returns 405

- **WHEN** client calls a route with a verb not declared in the routes spec
- **THEN** HTTP 405 is returned
- **AND** response uses `application/problem+json` when mapped

### Requirement: handler delegates to kernel without duplicating domain rules

#### Scenario: Handler invokes createCodeGraphProvider → stats, index, search, impact, hotspots

- **WHEN** a valid request for this handler is processed
- **THEN** `createCodeGraphProvider` → stats, index, search, impact, hotspots runs inside @specd/core
- **AND** handler does not reimplement lifecycle or validation rules

#### Scenario: Handler invokes change-scoped graph view composed from change specIds

- **WHEN** a valid request for this handler is processed
- **THEN** change-scoped graph view composed from change `specIds` runs inside @specd/core
- **AND** handler does not reimplement lifecycle or validation rules

### Requirement: graph indexing uses CLI-aligned project assembly

#### Scenario: Graph index builds provider input from ListWorkspaces and project graph config

- **WHEN** `POST /v1/graph/index` is handled
- **THEN** the handler loads workspaces from `kernel.project.listWorkspaces.execute()`
- **AND** it assembles effective graph config from project configuration before calling the provider

### Requirement: successful responses use presenters and DTO wire shapes

#### Scenario: Successful body passes through presenter

- **GIVEN** kernel returns a successful result object
- **WHEN** handler builds the HTTP 200 response
- **THEN** matching `api:presenter-*` mapped the result
- **AND** JSON conforms to paired `api:dto-*`

#### Scenario: Presenter output stays stable for fixed fixture

- **GIVEN** a fixed kernel fixture for this route
- **WHEN** the same request is handled twice
- **THEN** both JSON bodies are identical
- **AND** presenter did not mutate kernel state

#### Scenario: Unknown change name returns 404 before presenter

- **WHEN** route targets a change that does not exist
- **THEN** HTTP 404 problem+json is returned
- **AND** presenter is not invoked

### Requirement: failures map to RFC 7807 problem+json

#### Scenario: Kernel error maps to problem+json

- **WHEN** kernel throws a domain error for this route
- **THEN** `Content-Type` is `application/problem+json`
- **AND** body includes `status` and `title`

#### Scenario: Validation failure maps to 4xx problem+json

- **WHEN** `ValidateArtifacts` or input validation rejects the request
- **THEN** HTTP 4xx is returned
- **AND** problem payload describes the failing constraint

#### Scenario: Unexpected throw does not return plain text

- **WHEN** an unhandled exception escapes the handler stack
- **THEN** response is not `text/plain` HTML
- **AND** client receives problem+json or framework 500 mapping

#### Scenario: Read-only routes may omit actor on kernel calls

- **WHEN** handler serves a read-only GET that does not write history
- **THEN** kernel read use case still succeeds
- **AND** no history event is written for the call

### Requirement: SDK delivery imports

#### Scenario: Graph index uses runIndexProjectGraph

- **WHEN** `POST /v1/graph/index` is handled
- **THEN** the handler calls `runIndexProjectGraph` from `@specd/sdk`
- **AND** it does not import graph orchestration from `@specd/code-graph` directly
