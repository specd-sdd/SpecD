# Composition Create Api Server

## Purpose

SpecD Studio and `specd serve` need one factory that turns a discovered project into a listening HTTP server without reimplementing CLI workflow rules. `createApiServer` loads `api.auth` from `specd.yaml`, resolves the auth adapter once at startup, constructs a single process-scoped `Kernel`, registers all Studio routes under `/v1`, and can optionally mount the built `@specd/ui` bundle for embedded `specd ui serve`.

## Requirements

### Requirement: createApiServer accepts project host port and auth configuration

The factory MUST accept `{ projectRoot, host, port, auth, authRegistry?, uiDistPath? }` and return a listenable HTTP server.

### Requirement: auth configuration is read from specd.yaml api.auth only

Effective auth MUST come from `specd.yaml` `api.auth` merged with CLI overrides. v1 MUST reject any `--auth` value other than `disabled`.

### Requirement: one kernel per process with per-request context

The factory MUST call `createSdkContext` from `@specd/sdk` once per process and build
per-request context via `createApiContext`.

Process-scoped state (`ApiServerState`) MUST include the `SdkHostContext` fields
(`kernel`, `createGraphProvider`), resolved `SpecdConfig`, kernel actor resolver,
effective auth type, and a long-lived graph provider owned by the server.

When the API hosts a `LogRingBuffer` for Studio log readback, `createSdkContext` MUST
receive nested options `kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) }`.
Top-level `logRing` / `logFormatter` on `SdkContextOptions` MUST NOT be used.
`GET /v1/logs?prettier=true` MUST return plain text without ANSI escape sequences.

During bootstrap the server MUST create one provider via `createGraphProvider()`,
`await open()`, and retain it for graph routes while healthy. On
`GraphProviderStaleError` the server MUST close and reopen (or replace) that provider.
`ApiServer.close()` MUST close the long-lived provider.

Graph routes MUST NOT open/close a provider per HTTP request. After
`runIndexProjectGraph` completes, the server MUST replace/reopen the long-lived
provider before serving subsequent graph reads.

### Requirement: all API routes mount under /v1

Route plugins for project, changes, workspaces, specs, graph, and logs MUST register under the `/v1` prefix.

### Requirement: health or project payload exposes auth type without secrets

`GET /v1/health` and/or `GET /v1/project` MUST echo `auth: { type }` matching effective configuration without returning tokens or key material.

## Constraints

- `@specd/api` composition and delivery code MUST import host bootstrap and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:host-context`](../../sdk/host-context/spec.md) — `createSdkContext` bootstrap
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK import policy for API host
- [`api:auth-adapter-registry`](../auth-adapter-registry/spec.md) — auth wiring
- [`api:middleware-auth`](../middleware-auth/spec.md) — middleware
- [`core:kernel`](../../core/kernel/spec.md) — kernel use cases invoked through SDK context
- [`code-graph:composition`](../../code-graph/composition/spec.md) — long-lived provider lifecycle for HTTP API hosts
