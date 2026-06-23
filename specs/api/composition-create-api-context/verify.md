# Verification: Composition Create Api Context

## Requirements

### Requirement: context exposes kernel and actor

#### Scenario: createApiContext returns shared kernel and resolved actor

- **GIVEN** a process-scoped `Kernel` exists for the HTTP server
- **WHEN** `createApiContext(request)` runs after auth middleware resolved the actor
- **THEN** return value includes the process-scoped `kernel`
- **AND** return value includes `actor` from `api:adapter-api-actor-resolver`
- **AND** return value exposes `createGraphProvider` as a function

#### Scenario: Per-request contexts do not leak actor state

- **GIVEN** two concurrent requests in the same server process
- **WHEN** each request calls `createApiContext` independently
- **THEN** each context carries its own `actor`
- **AND** both contexts reference the same `kernel` instance

#### Scenario: Handlers use the context bundle instead of constructing kernel

- **WHEN** an HTTP handler handles a mutating `/v1` request
- **THEN** handler reads `kernel` and `actor` from `createApiContext`
- **AND** handler does not instantiate a new `Kernel` per request

### Requirement: graph provider factory is per project config

#### Scenario: createGraphProvider uses served project SpecdConfig

- **GIVEN** `createApiServer` was started with a project root and loaded `SpecdConfig`
- **WHEN** handler calls `createGraphProvider()` from the request context
- **THEN** `createCodeGraphProvider` receives that project configuration
- **AND** provider is scoped to the served root

#### Scenario: Different served roots yield different graph providers

- **GIVEN** two API servers are started with different project roots
- **WHEN** each server builds a context and calls `createGraphProvider()`
- **THEN** each factory closes over its own `SpecdConfig`
- **AND** graph queries do not read the other project index

#### Scenario: Graph provider is created lazily per factory call

- **WHEN** `createGraphProvider()` is invoked for a request that needs graph data
- **THEN** a code-graph provider is returned without mutating unrelated projects
- **AND** failures surface as kernel or transport errors, not silent null providers
