# Http Server Bootstrap

## Purpose

Studio serves HTTP for the remote profile and embedded `ui serve` mode; listeners must start reliably, expose API routes under `/v1`, and shut down cleanly. This spec defines process-level server lifecycle: bind, mount handlers, health probe with auth metadata, and graceful SIGINT handling.

## Requirements

### Requirement: API routes are mounted under /v1

All Studio API route plugins MUST be registered under the `/v1` prefix. Non-API paths MAY serve static UI when configured.

### Requirement: health endpoint reports readiness and auth type

`GET /v1/health` (or equivalent) MUST return HTTP 200 with a JSON body that includes effective `auth.type` and does not leak secrets.

### Requirement: SIGINT triggers graceful shutdown

On `SIGINT` (and `SIGTERM` where supported), the server MUST stop accepting new connections and close within a bounded timeout.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
