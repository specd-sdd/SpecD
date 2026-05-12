# Verification: core:core/kernel-logging

## Requirements

### Requirement: Project-Wide Logging (File)

#### Scenario: File destination initialized from config

- **GIVEN** a `SpecdConfig` with `logging.level: 'warn'`
- **AND** `configPath` is `/repo/.specd`
- **WHEN** `createKernel(config)` is called
- **THEN** the logger MUST be configured with a JSON file destination at `/repo/.specd/log/specd.log`
- **AND** its minimum level MUST be `warn`

#### Scenario: Default level when config missing

- **GIVEN** a `SpecdConfig` with no `logging` section
- **WHEN** `createKernel(config)` is called
- **THEN** the file destination MUST default to level `info`

### Requirement: Support for Additional Destinations

#### Scenario: Registering extra destinations

- **GIVEN** `KernelOptions` with one `console` destination
- **WHEN** `createKernel(config, options)` is called
- **THEN** the initialized logger MUST have two active destinations: the project-wide `file` and the additional `console`

### Requirement: Proxy Initialization

#### Scenario: Ready before use cases

- **WHEN** `createKernel(config)` is executing
- **THEN** the static `Logger.setImplementation` MUST be called before any use case factory is invoked

### Requirement: Default Logger Instantiation

#### Scenario: Default factory usage

- **GIVEN** no custom logger is provided in `KernelOptions`
- **WHEN** `createKernel(config)` is called
- **THEN** the `createDefaultLogger` infrastructure factory MUST be used to build the adapter

### Requirement: Log Directory Guarantee

#### Scenario: Directory creation

- **GIVEN** the directory `{configPath}/log/` does not exist
- **WHEN** the Kernel initializes the file logger
- **THEN** it MUST ensure the directory is created automatically
