# core:core/logger-port

## Purpose

To provide a robust logging abstraction for the specd core and its consumers. This spec extends the global logging standard with support for structured metadata, contextual child loggers, a static proxy for ambient access, and a formal contract for log entries and destinations.

## Requirements

### Requirement: Extended Logger Interface

The `LoggerPort` SHALL implement the `default:_global/logging` standard and extend it with the following methods:

- **`fatal(message: string, context?: object, error?: Error): void`**: For critical system failures.
- **`trace(message: string, context?: object): void`**: For high-volume technical tracing.
- **`isLevelEnabled(level: LogLevel): boolean`**: Returns whether the given level is enabled for this logger instance.
- **`child(context: object): LoggerPort`**: Creates a new logger instance that inherits the current context and prepends the new context to all subsequent entries.

### Requirement: Structured Metadata

All logging methods MUST support an optional `context` object as the second argument. When provided, the properties of this object SHALL be included as structured fields in the final log output.

### Requirement: Log Entry Contract

The system SHALL define a `LogEntry` structure to ensure a consistent data format for consumers (e.g., via callbacks):

- **`timestamp`**: Date object representing when the event occurred.
- **`level`**: The severity level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- **`message`**: The primary log message (string).
- **`context`**: A flattened object containing all metadata associated with the entry, including those from parent child loggers.
- **`error`**: Optional `Error` object for exceptions, including stack traces where applicable.

### Requirement: Ambient Context Proxy

The `@specd/core` package SHALL expose a static `Logger` object that acts as a global proxy. This object MUST implement the `LoggerPort` interface.

### Requirement: Implementation Swapping

The static `Logger` proxy MUST provide a mechanism (e.g., `setImplementation()`) to swap the underlying implementation at runtime. This mechanism SHALL be used by the composition root (the Kernel) to plug in a concrete logging adapter.

### Requirement: Multi-destination Configuration

The logging system SHALL support configuration for multiple output destinations via a `LogDestination` interface:

- **`target`**: The output sink. Supported values: `console`, `file`, `callback`.
- **`level`**: The minimum log level for this specific destination.
- **`format`**: The rendering format. Supported values: `json`, `pretty`.
- **`path`**: The absolute path for the log file (required if `target` is `file`).
- **`onLog`**: A callback function receiving a `LogEntry` (required if `target` is `callback`).

### Requirement: Default Implementation

Until a concrete implementation is provided via the Kernel, the static `Logger` proxy SHALL default to a safe, minimal implementation (e.g., a "Null Object" that does nothing or a basic `console` fallback) to ensure that code remains executable during unit testing without extra setup.

## Spec Dependencies

- [`default:_global/logging`](../../../default/_global/logging/spec.md) — Inherits the base interface and level semantics.
- [`default:_global/architecture`](../../../default/_global/architecture/spec.md) — Governs the separation between port (application) and proxy (core-ambient).
