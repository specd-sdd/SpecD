# Domain Api Actor

## Purpose

Value object representing an authenticated API principal when server auth is enabled (future types). v1 uses `disabled` and relies on core `ActorResolver` instead.

## Requirements

### Requirement: ApiActor carries stable identity fields

`ApiActor` MUST include non-empty `id` and `name` strings and a string `email` (MAY be empty when the provider has no email). It MAY include `roles: string[]` for authorization hints in future types.

### Requirement: ApiActor is immutable on the request

Once attached to request context, `ApiActor` MUST NOT be mutated by handlers or middleware.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
