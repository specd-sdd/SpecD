# Verification: Handler Project

## Requirements

### Requirement: handler implements the routes contract under /v1

#### Scenario: Only documented /v1 routes are registered

- **WHEN** HTTP server route table is inspected after bootstrap
- **THEN** every handler path matches `api:routes-project` under `/v1`
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

#### Scenario: Handler invokes GetProjectContext

- **WHEN** a valid request for this handler is processed
- **THEN** `GetProjectContext` runs inside @specd/core
- **AND** handler does not reimplement lifecycle or validation rules

#### Scenario: Handler invokes project status aggregation (ListChanges, ListDrafts, ListDiscarded, list archived, graph stats via createCodeGraphProvider)

- **WHEN** a valid request for this handler is processed
- **THEN** project status aggregation (`ListChanges`, `ListDrafts`, `ListDiscarded`, list archived, graph stats via `createCodeGraphProvider`) runs inside @specd/core
- **AND** handler does not reimplement lifecycle or validation rules

#### Scenario: Handler invokes kernel.specs.getActiveSchema

- **WHEN** a valid request for this handler is processed
- **THEN** `kernel.specs.getActiveSchema` runs inside @specd/core
- **AND** handler does not reimplement lifecycle or validation rules

### Requirement: artifact GET and PUT use dedicated core use cases

#### Scenario: Stale originalHash on PUT returns 409

- **GIVEN** artifact content changed after the client read `originalHash`
- **WHEN** PUT sends an outdated hash
- **THEN** HTTP 409 problem+json is returned
- **AND** on-disk artifact is not overwritten

#### Scenario: GET artifact delegates to GetChangeArtifact

- **WHEN** `GET /v1/changes/{name}/artifacts/{file}` succeeds
- **THEN** `GetChangeArtifact` executes
- **AND** handler does not call `ChangeRepository` directly

#### Scenario: PUT artifact delegates to SaveChangeArtifact

- **WHEN** `PUT /v1/changes/{name}/artifacts/{file}` with a current `originalHash`
- **THEN** `SaveChangeArtifact` executes
- **AND** manifest `updatedAt` advances on success

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

### Requirement: mutations pass the request-scoped actor into kernel

#### Scenario: Mutating kernel call receives request actor

- **GIVEN** `createApiContext` attached an actor to the request
- **WHEN** handler triggers a mutating kernel use case
- **THEN** kernel input includes that `actor`
- **AND** history `by` matches the resolved identity

#### Scenario: Read-only routes may omit actor on kernel calls

- **WHEN** handler serves a read-only GET that does not write history
- **THEN** kernel read use case still succeeds
- **AND** no history event is written for the call

#### Scenario: Actor is stable for the lifetime of the request

- **GIVEN** one HTTP request triggers multiple kernel mutations
- **WHEN** each mutation runs through the same context
- **THEN** the same `actor` is passed to every mutating call
- **AND** history entries share the same `by`

### Requirement: SDK delivery imports

#### Scenario: Handler imports kernel surface from SDK

- **WHEN** inspecting `handler-project` module imports
- **THEN** kernel types and errors are imported from `@specd/sdk`
- **AND** `@specd/core` is not imported directly
