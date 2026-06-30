# Middleware Auth

## Purpose

Auth policy must apply uniformly before any `/v1` handler runs. Middleware holds the verifier resolved at startup so v1 local mode is pass-through while future types can reject unauthenticated calls with RFC 7807 problems.

## Requirements

### Requirement: middleware uses startup-resolved verifier only

The middleware MUST use the `ApiTokenVerifier` instance produced by `auth-adapter-registry.resolve` at server startup and MUST NOT construct verifier implementations inline.

### Requirement: disabled auth never returns 401 for missing credentials

When effective `api.auth.type` is `disabled`, missing or empty `Authorization` MUST NOT produce HTTP 401.

### Requirement: middleware attaches identity to request context

After verification (or pass-through), middleware MUST attach the resolved identity to the object returned by `createApiContext` so mutating handlers pass the correct actor into kernel use cases.

### Requirement: enforcing auth types return 401 problem+json on failure

When a future registered auth type requires credentials and `verify` fails, middleware MUST respond with HTTP 401 and `application/problem+json` without invoking route handlers.

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
- [`api:port-api-token-verifier`](../port-api-token-verifier/spec.md) — port
- [`api:auth-adapter-registry`](../auth-adapter-registry/spec.md) — resolution
