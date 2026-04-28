# Verification: core:core/logger-port

## Requirements

### Requirement: Extended Logger Interface

#### Scenario: Extended methods presence

- **WHEN** using the `LoggerPort`
- **THEN** it MUST provide `fatal()`, `trace()`, `isLevelEnabled()`, and `child()` methods in addition to the global standard basic methods

#### Scenario: Level check behavior

- **WHEN** calling `isLevelEnabled('debug')` on a logger
- **THEN** it MUST return a boolean that reflects whether that level is enabled by the logger implementation

#### Scenario: Child logger creation

- **WHEN** `child({ requestId: '123' })` is called on a logger
- **THEN** it MUST return a new `LoggerPort` instance
- **AND** all subsequent logs from this instance MUST include `{ requestId: '123' }` in their context

### Requirement: Structured Metadata

#### Scenario: Context field inclusion

- **WHEN** calling `info("Operation completed", { duration: 150 })`
- **THEN** the resulting log entry MUST contain both the message and the structured `{ duration: 150 }` metadata

### Requirement: Log Entry Contract

#### Scenario: Data structure validation

- **WHEN** a `LogEntry` is emitted (e.g., to a callback)
- **THEN** it MUST be an object containing `timestamp` (Date), `level`, `message`, and `context` (Object)
- **AND** it MUST optionally contain an `error` field if one was provided

### Requirement: Ambient Context Proxy

#### Scenario: Static access

- **WHEN** importing `Logger` from `@specd/core`
- **THEN** it MUST be possible to call logging methods directly without instantiation (e.g., `Logger.info("...")`)

### Requirement: Implementation Swapping

#### Scenario: Runtime swap

- **GIVEN** the static `Logger` is using its default implementation
- **WHEN** `setImplementation(customAdapter)` is called
- **THEN** all subsequent calls to the static `Logger` MUST be redirected to `customAdapter`

### Requirement: Multi-destination Configuration

#### Scenario: Destination validation

- **WHEN** configuring a `LogDestination`
- **THEN** the system MUST validate that `path` is present if `target` is `file`
- **AND** it MUST validate that `onLog` is a function if `target` is `callback`

### Requirement: Default Implementation

#### Scenario: Silent by default

- **GIVEN** a new environment where the Kernel has not been initialized
- **WHEN** `Logger.debug("test")` is called
- **THEN** it MUST NOT throw an error
- **AND** it SHOULD NOT produce output by default (Null Object pattern)
