# Verification: cli:cli/logging-integration

## Requirements

### Requirement: Console Destination Definition

#### Scenario: Pretty format in TTY

- **GIVEN** the CLI is running in an interactive terminal
- **WHEN** initializing the console destination
- **THEN** it MUST be configured with `format: 'pretty'`

#### Scenario: JSON format when not a TTY

- **GIVEN** the CLI output is piped to another process (not a TTY)
- **WHEN** initializing the console destination
- **THEN** it MUST be configured with `format: 'json'`

### Requirement: Verbosity Overrides

#### Scenario: -v activates debug

- **WHEN** running `specd -v status`
- **THEN** the console destination level passed to the Kernel MUST be `debug`

#### Scenario: -vv activates trace

- **WHEN** running `specd -vv status`
- **THEN** the console destination level passed to the Kernel MUST be `trace`

#### Scenario: --quiet suppresses console

- **WHEN** running `specd --quiet status`
- **THEN** the console destination level passed to the Kernel MUST be `silent`

### Requirement: Kernel Registration

#### Scenario: Passing destination to KernelOptions

- **WHEN** the CLI calls `createKernel`
- **THEN** it MUST include the prepared console destination in the `additionalDestinations` array

### Requirement: Callback Interception (Optional)

#### Scenario: UI component updates

- **GIVEN** a CLI command that uses a progress bar
- **WHEN** the command registers a `callback` destination
- **THEN** it MUST receive `LogEntry` objects and update the UI accordingly

### Requirement: Separation of Concerns

#### Scenario: Flags do not affect file log

- **GIVEN** `specd.yaml` has `logging: { level: 'info' }`
- **WHEN** running `specd -vv status`
- **THEN** the console MUST show `trace` logs
- **AND** the file `specd.log` MUST only contain `info` logs or higher
