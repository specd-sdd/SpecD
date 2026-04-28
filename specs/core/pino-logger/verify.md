# Verification: core:core/pino-logger

## Requirements

### Requirement: Pino Adapter Construction

#### Scenario: Pino instance wrapping

- **WHEN** a `PinoLogger` is instantiated
- **THEN** it MUST correctly initialize an internal Pino instance using the provided configuration

### Requirement: Default Factory Function

#### Scenario: Factory returns LoggerPort

- **WHEN** calling `createDefaultLogger({ destinations: [] })`
- **THEN** it MUST return an object that implements the `LoggerPort` interface

#### Scenario: Factory applies level and path

- **GIVEN** a destination with `{ target: 'file', level: 'debug', path: '/tmp/test.log' }`
- **WHEN** calling the factory
- **THEN** the returned logger MUST be configured to write debug-level JSON entries to that file

### Requirement: Implementation of Destinations

#### Scenario: Console output in TTY

- **GIVEN** a `console` destination with `pretty` format
- **AND** the process is running in a TTY
- **WHEN** logging a message
- **THEN** the output to `stdout` MUST be human-readable and colored

#### Scenario: JSON file persistence

- **GIVEN** a `file` destination
- **WHEN** logging a message
- **THEN** the entry in the specified file MUST be a valid, single-line JSON object

#### Scenario: Callback invocation

- **GIVEN** a `callback` destination with an `onLog` handler
- **WHEN** logging a message
- **THEN** the `onLog` handler MUST be called with a correctly populated `LogEntry` object

### Requirement: Level Filtering

#### Scenario: Efficient filtering

- **GIVEN** a destination with level `error`
- **WHEN** calling `logger.debug("silent")`
- **THEN** no output MUST be produced for that destination
- **AND** the execution overhead MUST be negligible

### Requirement: Child Logger Mapping

#### Scenario: Context inheritance

- **GIVEN** a logger created with a callback destination
- **AND** a child logger created with `{ component: 'test' }`
- **WHEN** the child logger logs a message
- **THEN** the `LogEntry` received by the callback MUST include `context.component === 'test'`
