# core:core/kernel-logging

## Purpose

To integrate the logging system into the core's composition layer. This spec defines how the `Kernel` manages the lifecycle of the logging adapter, ensuring that the project-wide logging is correctly initialized and that external consumers can register their own `LogDestination` outputs.

## Requirements

### Requirement: Project-Wide Logging (File)

The `createKernel()` function SHALL be responsible for initializing the project-wide `LogDestination` (file-based persistence) based on `SpecdConfig`:

- **Location**: Derived as `{configPath}/log/specd.log`.
- **Level**: Read from `logging.level` in `specd.yaml` (default: `info`).
- **Format**: Always `json`.
- **Target**: `file`.

### Requirement: Support for Additional Destinations

The `KernelOptions` interface SHALL support an `additionalDestinations` array of `LogDestination` objects. This allows delivery mechanisms (CLI, MCP, etc.) to register their own logging outputs (e.g., `console`, `callback`).

### Requirement: Proxy Initialization

The `createKernel()` function MUST initialize the global `Logger` proxy in `@specd/core` as one of its first steps. It SHALL combine the project-wide file destination with any `additionalDestinations` provided in `KernelOptions` and pass the complete set to the concrete logging adapter.

### Requirement: Default Logger Instantiation

By default, `createKernel()` SHALL use the `createDefaultLogger()` factory from the infrastructure layer to instantiate the Pino-backed logger.

### Requirement: Log Directory Guarantee

The `Kernel` (or the default logger factory) SHALL ensure that the `{configPath}/log/` directory exists before the logging implementation attempts to write to the log file.

## Spec Dependencies

- [`core:core/logger-port`](../logger-port/spec.md) — The interface and data structures managed by the Kernel.
- [`core:core/pino-logger`](../pino-logger/spec.md) — The default adapter used by the Kernel.
- [`core:core/config`](../config/spec.md) — The configuration source for logging settings.
- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — Follows the composition root pattern.
