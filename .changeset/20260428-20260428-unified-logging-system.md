---
    "@specd/core": patch
    "@specd/cli": patch
---

20260428 - 20260428-unified-logging-system: Introduce a structured logging system using Pino and a global proxy to minimize injection boilerplate.

Specs affected:

- `core:core/logger-port`
- `cli:cli/logging-integration`
- `core:core/pino-logger`
- `core:core/kernel-logging`
- `core:core/config`
- `default:_global/logging`
- `cli:entrypoint`
