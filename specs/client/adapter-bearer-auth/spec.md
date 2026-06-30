# Adapter Bearer Auth

## Purpose

Standalone `specd-studio-web` and desktop remote profiles may point at an API that eventually requires tokens. This adapter only adds `Authorization: Bearer` on outbound HTTP for remote profiles; it does not implement server auth and is unused for embedded same-origin or desktop local IPC.

## Requirements

### Requirement: bearer header is added only for remote connection profiles

When the active Studio connection profile includes a non-empty API token, outgoing HTTP requests MUST include `Authorization: Bearer <token>`.

### Requirement: embedded and desktop local profiles omit Authorization

Same-origin `specd ui serve` and desktop local IPC profiles MUST NOT add an `Authorization` header.

### Requirement: bearer adapter does not validate tokens

The adapter MUST NOT validate tokens locally; HTTP 401 responses MUST be handled by `client:adapter-problem-json-errors`.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
