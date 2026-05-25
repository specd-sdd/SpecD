# Adapter Remote Specd Data

## Purpose

The React IDE consumes `SpecdDataPort`, not raw `fetch`. The remote adapter implements every port method group over `/v1`, composing transport, optional bearer headers, and problem+json error mapping so UI hooks stay identical between web, desktop remote, and integration tests.

## Requirements

### Requirement: remote adapter composes transport bearer and problem-json layers

The adapter MUST wrap `port-http-transport` with `adapter-bearer-auth` (when applicable) and `adapter-problem-json-errors`.

### Requirement: remote adapter normalizes API base URL to /v1

Configured API bases MUST be normalized so port methods target the versioned `/v1` root.

### Requirement: remote adapter implements the full SpecdDataPort surface

Every method on `client:specd-data-port` MUST be implemented against the HTTP routes defined in this change.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`client:port-http-transport`](../port-http-transport/spec.md) — transport
- [`client:adapter-bearer-auth`](../adapter-bearer-auth/spec.md) — optional Bearer header
- [`client:adapter-problem-json-errors`](../adapter-problem-json-errors/spec.md) — errors
- [`client:specd-data-port`](../specd-data-port/spec.md) — aggregated port
