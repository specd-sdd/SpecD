# ReadLog

## Purpose

Studio and API need readback of recent specd log lines from an **in-memory ring** populated at kernel bootstrap. v1 MUST NOT expose file-path or arbitrary filesystem log reads (security).

## Requirements

### Requirement: ReadLog reads only the injected ring buffer

`ReadLog` MUST accept a `LogRingBuffer` at construction and `execute({ limit?, prettier? })` MUST return the newest entries (newest first) up to `limit` (default 500).

### Requirement: no filesystem log reads

`ReadLog` MUST NOT read `specd.log` or any user-supplied path. File logging remains a separate `Logger` destination only.

### Requirement: structured or pretty output

When `prettier` is false, the result MUST expose `entries[]` with `timestamp`, `level`, `message`, and `context`. When `prettier` is true, the result MUST expose `lines[]` where each line is `LogFormatter.format(entry)` for the corresponding ring entry (formatter supplied at construction, default from `createLogFormatter()`).

### Requirement: LogFormatter injection

`ReadLog` MUST accept `LogReadBuffer` and `LogFormatter` at construction. The kernel MUST pass the same `LogFormatter` instance used for `createDefaultLogger` when wiring `kernel.logs.read`.

### Requirement: kernel exposes logs.read when ring is wired

`createKernel` MUST register a callback destination that pushes to the ring when `KernelOptions.logRing` is set, and MUST attach `kernel.logs.read` as `ReadLog` for that ring.

## Spec Dependencies

- [`core:log-formatter`](../log-formatter/spec.md) — pretty lines
- [`core:kernel`](../../core/kernel/spec.md) — composition wiring
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — use-case layer
