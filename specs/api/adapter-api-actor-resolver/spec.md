# Adapter Api Actor Resolver

## Purpose

HTTP handlers record `by` on history events through `ActorResolver`, but authenticated deployments will attach an `ApiActor` per request. This adapter is the bridge: with `disabled` it forwards to the kernel resolver; with a future auth type it maps `ApiActor` into `ActorIdentity` deterministically.

## Requirements

### Requirement: disabled auth delegates to the kernel ActorResolver

When effective `api.auth.type` is `disabled`, the adapter MUST implement `ActorResolver` by forwarding `resolve()` to the `ActorResolver` instance supplied at server bootstrap. It MUST NOT read `Authorization` headers and MUST NOT fabricate identity from HTTP metadata.

### Requirement: authenticated requests map ApiActor to ActorIdentity

When request context carries an `ApiActor` from a registered verifier (future auth types), the adapter MUST map `id`, `name`, `email`, and optional `roles` into the `ActorIdentity` fields used by change history. The mapping MUST be deterministic for a given `ApiActor` payload.

### Requirement: one resolved actor per HTTP request

The adapter MUST resolve actor at most once per request and return the same identity for every mutating kernel call in that request.

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
