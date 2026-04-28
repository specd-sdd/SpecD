---
'@specd/specd': patch
---

20260428 - 20260428-unified-logging-system: Introduce a structured logging system using Pino and a global proxy to minimize injection boilerplate.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:core/logger-port`
- `cli:cli/logging-integration`
- `core:core/pino-logger`
- `core:core/kernel-logging`
- `core:core/config`
- `default:_global/logging`
- `cli:entrypoint`
