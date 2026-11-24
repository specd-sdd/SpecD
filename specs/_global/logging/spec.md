# default:\_global/logging

## Purpose

To ensure consistent observability across the entire specd monorepo by defining a unified logging standard. This spec establishes a minimum interface compatible with the standard `console` API and provides clear semantics for different log levels, allowing all packages to follow the same conventions regardless of their specific implementation.

## Requirements

### Requirement: Console Compatibility

The logging interface SHALL be compatible with the standard `console` API methods to ensure a low barrier to adoption and allow for gradual migration. At a minimum, it MUST support `log()`, `info()`, `debug()`, `warn()`, and `error()`.

### Requirement: Method Aliasing

The `log()` method SHALL be treated as an alias for `info()`, ensuring that developers can use familiar terminology while maintaining a structured log level hierarchy.

### Requirement: Level Mapping for Minimal Implementations

Implementations that rely on the standard `console` object MUST support extended levels by mapping them to the closest available console method and prepending a clear prefix to the message:

- **`fatal`** SHALL map to `console.error()` with the prefix `[FATAL]`.
- **`trace`** SHALL map to `console.debug()` (or `console.log()`) with the prefix `[TRACE]`.

### Requirement: Log Level Semantics

Every log entry MUST be assigned a level that reflects its purpose and severity:

- **`trace`**: Fine-grained technical details (e.g., AST dumps).
- **`debug`**: Internal diagnostic information (e.g., plugin loading).
- **`info` / `log`**: Significant application-level events.
- **`warn`**: Non-critical issues that require attention.
- **`error`**: Failures in specific operations.
- **`fatal`**: Critical failures that require immediate process termination.

### Requirement: Policy on Console Usage

Direct usage of the global `console` object for logging in production code SHALL be avoided in favor of the project's logging abstraction.

### Requirement: Ambient Logger

Packages MAY expose an ambient `Logger` (static facade over the logging interface defined by this spec).

- The composition root assigns the active implementation during startup.
- Before wiring, `Logger` MUST behave as a no-op so imports are safe during module load.
- Any layer MAY import `Logger` for observability (`debug`, `trace`, diagnostic `info`). It MUST NOT be used for control flow, persistence, or side effects beyond logging.
- Each package chooses how and where to use it; this spec does not prescribe constructor injection vs ambient access beyond forbidding direct `console.*` in production code (see Requirement: Policy on Console Usage).

This is the intentional exception documented in [`default:_global/architecture`](../architecture/spec.md).

## Spec Dependencies

- [`default:_global/architecture`](../architecture/spec.md) — documents the ambient Logger import exception.
