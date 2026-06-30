# Routes Project

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Project** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Project-level read and schema validation.

## Requirements

### Requirement: project routes expose config status context and schema

The API MUST provide `GET /project`, `/project/status`, `/project/context`, `/project/schema`, and `POST /project/schema/validate` under `/v1`.

### Requirement: project status aggregates lists and graph freshness

`GET /project/status` MUST compose active/draft/discarded/archive counts and graph freshness/stale flags equivalent to CLI `project status`.

### Requirement: GET project echoes auth type for clients

`GET /project` MUST include `auth: { type }` matching effective server configuration without secrets.

### Requirement: project-route inputs are schema-validated

Every `params`, `query`, and `body` shape accepted by this route group MUST be declared in Fastify route schema and validated before handler logic runs.

For `GET /project/context`, boolean and numeric query flags such as `followDeps` and `depth` MUST reject malformed values with HTTP 400 `application/problem+json` and code `INVALID_REQUEST`.

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
