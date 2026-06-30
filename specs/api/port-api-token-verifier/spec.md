# Port Api Token Verifier

## Purpose

Port abstraction for verifying HTTP credentials before handlers run. Implementations are selected through `api:auth-adapter-registry`.

## Requirements

### Requirement: verify accepts optional bearer token

`verify(token: string | undefined)` MUST return a resolved `ApiActor` on success or reject/throw a typed authentication failure when the active auth type requires credentials and verification fails.

### Requirement: port is swappable via registry

Handlers and middleware MUST depend on this port interface only. Concrete verifiers MUST be registered in `api:auth-adapter-registry`; handlers MUST NOT instantiate verifier classes directly.

### Requirement: disabled verifier never requires a token

The `adapter-auth-disabled` implementation MUST satisfy the port contract without requiring an `Authorization` header (see `api:adapter-auth-disabled`).

## Constraints

- `@specd/api` delivery and composition code MUST import host bootstrap and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
