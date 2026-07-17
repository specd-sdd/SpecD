# Verification: CLI Host Context

## Requirements

### Requirement: resolveCliContext delegates to openSpecdHost

#### Scenario: Host bootstrap uses SDK

- **WHEN** any CLI command calls `resolveCliContext`
- **THEN** it invokes `openSpecdHost` from `@specd/sdk`
- **AND** it returns `config`, `configFilePath`, and `kernel` from the host result

#### Scenario: Kernel options forwarded for verbosity

- **GIVEN** the process argv includes `-vv` or `--verbose`
- **WHEN** `resolveCliContext` runs
- **THEN** `openSpecdHost` receives `kernelOptions` with elevated console log level

#### Scenario: CLI reads bootstrap warnings from config

- **GIVEN** `openSpecdHost` returns a config with warning strings
- **WHEN** `resolveCliContext` completes successfully
- **THEN** CLI consumes the warnings from `config.warnings`
- **AND** it does not require a top-level `warnings` field on `OpenSpecdHostResult`

#### Scenario: CLI emits each warning once per bootstrap

- **GIVEN** `config.warnings` contains multiple advisory messages
- **WHEN** `resolveCliContext` completes successfully
- **THEN** CLI emits each warning once for that bootstrap attempt
- **AND** it does not duplicate the same warning through a second host-result warning surface

### Requirement: CLI kernel options preservation

#### Scenario: Optional onLog callback wired

- **GIVEN** `resolveCliContext` is called with an `onLog` callback
- **WHEN** the kernel emits log entries
- **THEN** the callback destination receives entries at the resolved log level

### Requirement: Host bootstrap entry point

#### Scenario: Commands use resolveCliContext

- **WHEN** a configured-mode CLI command needs a kernel
- **THEN** it obtains one through `resolveCliContext` or `openSpecdHost`

### Requirement: CLI package runtime dependencies

#### Scenario: package.json declares SDK as specd platform dependency

- **WHEN** `packages/cli/package.json` dependencies are inspected
- **THEN** `@specd/sdk` is the sole direct workspace dependency on specd platform packages
