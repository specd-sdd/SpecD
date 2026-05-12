# Verification: default:\_global/logging

## Requirements

### Requirement: Console Compatibility

#### Scenario: Basic methods available

- **WHEN** inspecting the logging interface
- **THEN** it MUST expose `log()`, `info()`, `debug()`, `warn()`, and `error()` methods
- **AND** their signatures MUST be compatible with the standard `console` API (accepting a message and optional metadata)

### Requirement: Method Aliasing

#### Scenario: log() calls info()

- **WHEN** calling the `log()` method with a message
- **THEN** the underlying implementation MUST treat it identically to an `info()` call

### Requirement: Level Mapping for Minimal Implementations

#### Scenario: Fatal mapping with prefix

- **GIVEN** a minimal implementation using standard `console`
- **WHEN** `fatal("System failure")` is called
- **THEN** `console.error` MUST be invoked
- **AND** the output message MUST be prefixed with `[FATAL]`

#### Scenario: Trace mapping with prefix

- **GIVEN** a minimal implementation using standard `console`
- **WHEN** `trace("Fine details")` is called
- **THEN** `console.debug` (or `console.log`) MUST be invoked
- **AND** the output message MUST be prefixed with `[TRACE]`

### Requirement: Log Level Semantics

#### Scenario: Semantic severity ordering

- **WHEN** comparing log levels
- **THEN** the severity order MUST be: `trace` < `debug` < `info` < `warn` < `error` < `fatal`

### Requirement: Policy on Console Usage

#### Scenario: linting or code review check

- **WHEN** analyzing production code
- **THEN** any direct call to `console.log/warn/error` (excluding bootstrapping or infrastructure adapters) SHOULD be flagged as a violation
