# core:core/pino-logger

## Purpose

To provide a high-performance implementation of the `LoggerPort` using the Pino logging library. This spec defines how the Pino adapter is constructed, how it maps to our log levels, and how it handles multiple `LogDestination` outputs with intelligent filtering and formatting, including the conversion to `LogEntry` objects for callbacks.

## Requirements

### Requirement: Pino Adapter Construction

The `core` package SHALL provide a `PinoLogger` class in its infrastructure layer that implements the `LoggerPort`. This adapter MUST wrap a native Pino instance.

### Requirement: Default Factory Function

The infrastructure layer SHALL expose a factory function (e.g., `createDefaultLogger(options)`) that returns a pre-configured `PinoLogger` instance. This factory SHALL accept an array of `LogDestination` objects and configure the internal Pino multistream accordingly.

### Requirement: Implementation of Destinations

The `PinoLogger` MUST implement the behavior for each `LogDestination` type:

- **`console`**: Writes to `process.stdout` (or `stderr` for errors). MUST support `pretty` formatting.
- **`file`**: Writes to the specified file path. MUST ensure the file is opened for writing in JSON format.
- **`callback`**: For each log event, the adapter MUST construct a `LogEntry` object following the core contract and invoke the provided `onLog` callback.

### Requirement: Level Filtering

The `PinoLogger` MUST respect the `level` threshold of each `LogDestination` independently. Messages below the threshold SHALL be discarded with minimal performance overhead.

### Requirement: Child Logger Mapping

The `child()` method of the `PinoLogger` MUST map directly to Pino's native `.child()` functionality. Any child logger created MUST inherit the destinations and filtering rules of its parent.

## Spec Dependencies

- [`core:core/logger-port`](../logger-port/spec.md) — Implements this interface and its data structures (`LogEntry`, `LogDestination`).
- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — Placed in the infrastructure layer of `@specd/core`.
