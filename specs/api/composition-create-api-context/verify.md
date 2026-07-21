# Verification: Composition Create Api Context

## Requirements

### Requirement: context exposes kernel and actor

#### Scenario: ApiContext extends SdkHostContext

- **WHEN** `createApiContext` builds a request context
- **THEN** the context exposes `kernel` and `createGraphProvider` from the process-scoped SDK host context
- **AND** the context exposes `getGraphProvider` for the process-scoped long-lived opened provider (peek)
- **AND** the context exposes `withGraphProvider` as the healthy long-lived accessor (reopen once on stale)

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

#### Scenario: Graph handlers reuse the long-lived opened provider

- **WHEN** a graph route needs an opened provider
- **THEN** it calls `withGraphProvider()` (or equivalent healthy process accessor)
- **AND** it does not open/close a new provider for that single request
