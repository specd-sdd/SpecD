# Middleware Cors

## Purpose

Allow browser-based Studio (`specd-studio-web`, desktop remote) to call an API on a different origin than the static UI host.

## Requirements

### Requirement: allowed origins are configurable

The server MUST accept a configuration list of allowed origins. Preflight `OPTIONS` and actual responses MUST include appropriate `Access-Control-Allow-*` headers for listed origins.

### Requirement: credentials mode is explicit

When the Studio client sends credentialed requests (cookies or `Authorization`), CORS configuration MUST set `Access-Control-Allow-Credentials` consistently with the allowed origins list.

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
