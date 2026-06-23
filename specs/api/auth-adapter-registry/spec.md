# Auth Adapter Registry

## Purpose

Remote Studio may later require real credentials, but v1 ships with auth disabled on loopback. The registry keeps route handlers ignorant of verifier implementations: built-ins and plugins register by `type`, and composition resolves the active adapter from `specd.yaml` before the server accepts traffic.

## Requirements

### Requirement: registry supports register and resolve by auth type

The module MUST export `register(type: string, factory: AuthAdapterFactory)` and `resolve(type: string, config?: unknown): ApiTokenVerifier`. Each factory receives server bootstrap context including `ActorResolver`.

### Requirement: default registry registers only disabled in v1

`defaultAuthAdapterRegistry()` MUST register exactly one built-in type: `disabled` mapped to `adapter-auth-disabled`. Resolving any other type MUST throw before the HTTP server listens.

### Requirement: createApiServer resolves verifier once at startup

`createApiServer` MUST accept an optional injected registry (tests) or use the default, call `resolve(effectiveAuth.type, effectiveAuth.config)` once, and pass the verifier to `middleware-auth`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
