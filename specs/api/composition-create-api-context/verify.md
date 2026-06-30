# Verification: Composition Create Api Context

## Requirements

### Requirement: context exposes kernel and actor

#### Scenario: ApiContext extends SdkHostContext

- **WHEN** middleware attaches `request.apiContext`
- **THEN** the context exposes `kernel` and `createGraphProvider` from the process-scoped SDK host context
- **AND** `ApiContext` includes request-scoped `actor`, `config`, and auth fields

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
