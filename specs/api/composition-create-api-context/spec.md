# Composition Create Api Context

## Purpose

HTTP route handlers need a consistent way to reach the kernel, the request actor, and graph tooling without each handler wiring dependencies by hand. This composition builds a per-request API context that shares the process-scoped `Kernel` and resolved actor while exposing a factory for code-graph providers.

## Requirements

### Requirement: context exposes kernel and actor

`createApiContext(request)` MUST return `{ kernel, actor, createGraphProvider, config, authType, apiActor }` where:

- `kernel` and `createGraphProvider` come from the process-scoped `SdkHostContext` created by `createSdkContext`
- `actor` is the identity from `api:adapter-api-actor-resolver` wrapped for the request
- `config` is the resolved `SpecdConfig` for the served project

`ApiContext` and `ApiServerState` MUST extend `SdkHostContext` from `@specd/sdk`.

### Requirement: graph provider factory is per project config

`createGraphProvider()` on the API context MUST delegate to the `createGraphProvider` factory from the process-scoped `SdkHostContext`. It MUST NOT construct `@specd/code-graph` providers independently of that factory.

## Constraints

- `@specd/api` composition code MUST import `SdkHostContext` and related bootstrap types from `@specd/sdk`.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:host-context`](../../sdk/host-context/spec.md) — `SdkHostContext` shape and bootstrap
