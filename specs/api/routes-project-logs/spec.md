# Routes Project Logs

## Purpose

HTTP contract for project-scoped log readback and generic log append routes under `/v1`. Studio session output is local UI state, while remote logging uses the generic project log channel only.

## Requirements

### Requirement: GET and POST /v1/logs

- `GET /v1/logs?limit=&prettier=` MUST call `kernel.logs.read` and return `{ entries? }` or `{ lines? }`.
- When `prettier=true`, `lines[]` MUST be plain text suitable for the Studio web UI (no ANSI color escape sequences).
- `POST /v1/logs` MUST accept `{ level, message, context? }` with `level` in `debug|info|warn|error`, MUST write via `Logger.child({ source: 'studio' })`, and MUST NOT accept file paths.

### Requirement: no studio-specific output resource is exposed

The API MUST expose no studio-specific output resource under `/v1`. Remote logging is limited to the generic `/v1/logs` channel.

Requests to unknown studio-specific output paths under `/v1` MUST return HTTP 404 with `application/problem+json` and code `NOT_FOUND`, consistent with other unknown API routes under `/v1`.

### Requirement: limits are server-enforced

`limit` query parameters for `/logs` MUST be parsed as positive integers capped at 500.

### Requirement: log-route inputs are schema-validated

Every `query` and `body` shape accepted by `/logs` MUST be declared in Fastify route schema and validated before handler logic runs.

`level` MUST reject values outside `debug|info|warn|error`. `message` MUST reject blank or missing input. Malformed input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

## Constraints

- `@specd/api` delivery and composition code MUST import host bootstrap and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`core:read-log`](../../core/read-log/spec.md) — read path
- [`api:composition-create-api-server`](../composition-create-api-server/spec.md) — log ring bootstrap
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — delivery layout
