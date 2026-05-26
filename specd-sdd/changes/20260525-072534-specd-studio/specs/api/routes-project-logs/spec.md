# Routes Project Logs

## Purpose

HTTP contract for Studio **Logs** and **Output** channels under `/v1`. Logs use the specd `Logger` and in-memory readback; Output uses a separate studio buffer.

## Requirements

### Requirement: GET and POST /v1/logs

- `GET /v1/logs?limit=&prettier=` MUST call `kernel.logs.read` and return `{ entries? }` or `{ lines? }`.
- When `prettier=true`, `lines[]` MUST be plain text suitable for the Studio web UI (no ANSI color escape sequences).
- `POST /v1/logs` MUST accept `{ level, message, context? }` with `level` in `debug|info|warn|error`, MUST write via `Logger.child({ source: 'studio' })`, and MUST NOT accept file paths.

### Requirement: GET and POST /v1/studio/output

- `GET /v1/studio/output?limit=` MUST list recent studio output entries (newest first).
- `POST /v1/studio/output` MUST accept `{ level, message, action?, context? }` with `level` in `debug|info|warn|error` and append to the process-scoped `StudioOutputBuffer`.

### Requirement: limits are server-enforced

`limit` query parameters MUST be parsed as positive integers capped at 500 for logs and 500 for studio output.

## Constraints

- MUST NOT expose endpoints that read log files from disk or arbitrary paths.

## Spec Dependencies

- [`core:read-log`](../../core/read-log/spec.md) — read path
- [`api:composition-create-api-server`](../composition-create-api-server/spec.md) — ring and buffer bootstrap
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — delivery layout
