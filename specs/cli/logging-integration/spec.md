# cli:cli/logging-integration

## Purpose

To define the relationship between the specd CLI and the core's logging system. This spec ensures that the CLI correctly leverages the Kernel's logging capabilities while providing user-facing controls for console log verbosity and interaction.

## Requirements

### Requirement: Console Destination Definition

The CLI SHALL be responsible for defining its own `LogDestination` for console output.

- **Target**: `console`.
- **Format**: `pretty` for TTY sessions, `json` otherwise.
- **Level**: Governed by CLI flags.

### Requirement: Verbosity Overrides

The CLI SHALL support global flags to allow the user to increase console log verbosity. The mapping SHALL be:

- **`-v`** or **`--debug`**: Sets the console `LogDestination.level` to `debug`.
- **`-vv`** or **`--trace`**: Sets the console `LogDestination.level` to `trace`.
- **`--quiet`**: Sets the console `LogDestination.level` to `silent`.

If no flags are provided, the console destination SHALL default to `info`.

### Requirement: Kernel Registration

The CLI SHALL pass its defined console destination to the `Kernel` via the `additionalDestinations` array in `createKernel()`.

### Requirement: Callback Interception (Optional)

The CLI MAY register a `callback` destination if it needs to intercept logs for specialized UI components (e.g., progress bars, dashboard updates). If used, it MUST provide an `onLog` handler that consumes `LogEntry` objects.

### Requirement: Separation of Concerns

The CLI MUST NOT attempt to configure or modify the project-wide file logging, which is managed internally by the Kernel based on `specd.yaml`.

## Spec Dependencies

- [`core:core/kernel-logging`](../../core/core/kernel-logging/spec.md) — The CLI registers its destinations in the Kernel.
- [`core:core/logger-port`](../../core/core/logger-port/spec.md) — The CLI uses the `LogDestination` and `LogEntry` interfaces.
- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — Adheres to the infrastructure-to-core delegation pattern.
