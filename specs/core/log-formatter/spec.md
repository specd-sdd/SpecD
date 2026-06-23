# LogFormatter

## Purpose

Human-readable log lines MUST use one shared formatter so CLI console output, `ReadLog` pretty mode, and future delivery layers stay visually consistent. v1 default implementation is **pino-pretty** via `PinoPrettyLogFormatter`.

## Requirements

### Requirement: LogFormatter port

The application layer MUST define a `LogFormatter` port with `format(entry: LogEntry): string` where `LogEntry` is the contract from `core:logger-port`.

### Requirement: createLogFormatter factory

`@specd/core` composition MUST export `createLogFormatter(options?)` returning the default `LogFormatter` implementation (`PinoPrettyLogFormatter` in v1).

Options MAY include `colorize` (boolean, default `true` when stdout is a TTY is decided by callers; factory default `true`).

### Requirement: PinoPrettyLogFormatter

Infrastructure MUST provide `PinoPrettyLogFormatter` implementing `LogFormatter` using `pino-pretty` (`prettyFactory`) so each `LogEntry` maps to a pino-shaped record (`time`, numeric `level`, `msg`, spread context) before prettifying.

### Requirement: consumers use the factory

- `createKernel` MUST call `createLogFormatter()` once per kernel and pass the instance to `createDefaultLogger` and to `ReadLog` when `logRing` is wired.
- `createCliKernel` / CLI context MUST pass the same factory-produced formatter into `createKernel` (via `KernelOptions.logFormatter`) so console and Studio readback match.
- `ReadLog` MUST NOT embed ad hoc `formatPrettyLine` string building; pretty output MUST delegate to the injected `LogFormatter`.

### Requirement: pretty console destination

When a `LogDestination` has `format: 'pretty'`, `createDefaultLogger` MUST render lines through the supplied `LogFormatter` instead of wiring a raw `pino-pretty` stream that bypasses the port.

## Spec Dependencies

- [`core:logger-port`](../../core/logger-port/spec.md) — `LogEntry` contract
- [`core:pino-logger`](../pino-logger/spec.md) — uses formatter for pretty targets
- [`core:read-log`](../read-log/spec.md) — pretty readback
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — port in application, adapter in infrastructure
