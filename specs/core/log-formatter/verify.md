# Verification: LogFormatter

## Requirements

### Requirement: LogFormatter port

#### Scenario: format returns a single line

- **GIVEN** a `LogEntry` with `message` `hello`
- **WHEN** `createLogFormatter().format(entry)` runs
- **THEN** the result is a non-empty string containing `hello`

### Requirement: createLogFormatter factory

#### Scenario: factory is exported from core composition

- **WHEN** `@specd/core` composition is imported
- **THEN** `createLogFormatter` is defined

### Requirement: PinoPrettyLogFormatter

#### Scenario: level label appears in pretty output

- **GIVEN** an entry with level `warn` and message `check`
- **WHEN** formatted with default factory
- **THEN** the line includes `check`
- **AND** reflects warn severity (label or color path via pino-pretty)

### Requirement: consumers use the factory

#### Scenario: ReadLog pretty mode uses injected formatter

- **GIVEN** a test double formatter that returns `FORMATTED`
- **WHEN** `ReadLog.execute({ prettier: true })` runs
- **THEN** `lines` is `['FORMATTED']`

### Requirement: pretty console destination

#### Scenario: pretty console destination — primary path

- **WHEN** When a LogDestination has format: 'pretty', createDefaultLogger MUST
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: pretty console destination — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
