# Adapter Auth Disabled

## Purpose

Local Studio (`specd serve`, `specd ui serve`, desktop IPC) must not demand API tokens while still recording the same git/OS actor the CLI uses in change history. The disabled verifier satisfies `ApiTokenVerifier` and pairs with `api:adapter-api-actor-resolver` so mutating routes receive a real `ActorResolver` identity.

## Requirements

### Requirement: disabled verifier accepts requests without Authorization

When `api.auth.type` is `disabled`, `verify()` MUST succeed with no `Authorization` header and MUST NOT inspect Bearer tokens.

### Requirement: disabled verifier does not synthesize ApiActor

The adapter MUST NOT construct an `ApiActor` from HTTP metadata; actor for history comes from `api:adapter-api-actor-resolver` delegating to core `ActorResolver`.

### Requirement: middleware treats disabled auth as pass-through

With `disabled`, `middleware-auth` MUST call `next()` without returning 401 for missing credentials.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
