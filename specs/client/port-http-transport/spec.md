# Port Http Transport

## Purpose

TypeScript surface for **Port Http Transport** on `SpecdDataPort`, mirroring the HTTP routes in the paired `api:routes-*` group. UI hooks call these methods; adapters implement them over HTTP or IPC.

## Requirements

### Requirement: transport normalizes API base URL and /v1 prefix

The transport MUST trim trailing slashes on the configured base URL and MUST prefix relative paths with `/v1` when the deployment uses the versioned API root.

### Requirement: transport sets JSON accept and allows auth injection

Requests MUST send `Accept: application/json`. Adapters MAY inject additional headers (for example `Authorization`) via a hook or wrapper.

### Requirement: transport supports AbortSignal cancellation

Every request MUST accept an optional `AbortSignal` so React hooks can cancel in-flight fetches on unmount or tab close.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
