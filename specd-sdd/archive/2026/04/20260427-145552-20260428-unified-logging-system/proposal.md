# Proposal: 20260428-unified-logging-system

## Motivation

The current codebase lacks a unified logging strategy, making observability and debugging difficult across the monorepo. As the project grows, relying on scattered `console.log` calls prevents structured logging, efficient log level management, and clean separation of concerns in our hexagonal architecture.

## Current behaviour

- Logging is performed using global `console.log/warn/error` calls.
- There is no structured output (JSON), which hinders automated log processing.
- Debug levels cannot be toggled globally or per-workspace without code changes.
- Cross-cutting concerns like logging are not abstracted, leading to potential coupling if a specific library were to be introduced without a port.

## Proposed solution

Introduce a unified logging system based on **Pino** for high-performance structured logging. The system follows a hierarchical specification approach to ensure consistency across the monorepo while maintaining decoupling.

1.  **Global Standard**: A global spec defines the minimum interface compatible with the `console` API and the semantics for each log level.
2.  **Core Realization**: The `@specd/core` package implements a `LoggerPort` that extends the global standard with advanced features (child loggers, fatal/trace levels) and provides an **Ambient Context** proxy for easy access.
3.  **Kernel Integration**: The `createKernel` function manages the lifecycle and initialization of the global proxy using a built-in **Pino Adapter**.
4.  **CLI Delegation**: The `@specd/cli` reads configuration from `specd.yaml` and delegates all logging to the core's system.

## Configuration Changes

The `specd.yaml` schema will be updated to include a `logging` section at the root:

```yaml
# specd.yaml
logging:
  level: info # Default level.
```

## Log Levels Semantics (Global Standard)

The project follows a standard set of levels, compatible with `console.*`:

- **`trace`**: Fine-grained technical details (e.g., AST dumps).
- **`debug`**: Internal diagnostic information (e.g., path resolution).
- **`info` / `log`**: Significant application events (e.g., change creation). `log` is an alias for `info` for console compatibility.
- **`warn`**: Non-critical issues (e.g., stale metadata).
- **`error`**: Failures in specific operations (e.g., file read errors).
- **`fatal`**: Critical failures requiring immediate exit.

## Persistance

Logs will be persisted in the project's internal configuration directory:

- **Location**: `specd.log` inside the `log/` folder under the project's `configPath`.
- **Absolute Path**: Derived as `path.join(config.configPath, 'log', 'specd.log')`.
- **Format**: Structured JSON (standard Pino output).
- **Console Output**: Human-readable output via `pino-pretty` for TTY sessions.

## Specs affected

### New specs

- **`default:_global/logging`**: Defines the global logging standard: minimum `console`-compatible interface, level semantics, and general logging policies.
  - Depends on: `none — this is a global constraint spec`
- `core:core/logger-port`: Realizes the global standard in the core package, adding `child()` loggers, `fatal`/`trace` levels, and the static `Logger` proxy.
  - Depends on: `default:_global/logging`, `default:_global/architecture`
- `core:core/pino-logger`: Implementation of the `LoggerPort` using Pino, with support for console and file multistreaming.
  - Depends on: `core:core/logger-port`, `default:_global/architecture`
- `core:core/kernel-logging`: Defines how the `Kernel` manages the logger lifecycle and proxy initialization during `createKernel`.
  - Depends on: `core:core/logger-port`, `default:_global/architecture`
- `cli:cli/logging-integration`: Defines how the CLI configures logging via `specd.yaml` and delegates execution to the core's logging system.
  - Depends on: `core:core/kernel-logging`, `default:_global/architecture`

### Modified specs

- `core:core/config`: Add the `logging` section to the project configuration schema.
  - Depends on (added): none

## Impact

- **Consistency**: All packages follow the same global logging standard.
- **Flexibility**: Simple packages can follow the standard using `console`, while core packages use the advanced `LoggerPort`.
- **Architecture**: Maintains hexagonal integrity with clear layers of abstraction and implementation.

## Technical context

- **Library Choice**: Pino (performance, JSON).
- **Ambient Context Pattern**: Static proxy in `core` for easy access.
- **Console Compatibility**: The interface remains compatible with `console.*` to ease adoption.
- **Kernel-led Initialization**: The `Kernel` ensures the system is ready before use.

## Open Questions

- Should we allow per-workspace log level overrides in `specd.yaml` in the future? (Out of scope).
