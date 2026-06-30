# Ipc Message Envelope

## Purpose

Electron renderer code calls main-process kernel operations asynchronously; ad hoc IPC shapes make correlation and errors easy to lose. This spec defines a structured request/response envelope with correlation ids and typed failure propagation between preload, main, and UI hooks.

## Requirements

### Requirement: requests carry a correlation id

Every IPC request envelope MUST include a unique `id` echoed on the response so the renderer can match async replies.

### Requirement: errors propagate as structured failure envelopes

Failures MUST NOT be silent: the response envelope MUST include an error shape compatible with UI error handling (message + optional code).

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
