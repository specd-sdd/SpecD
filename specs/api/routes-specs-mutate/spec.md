# Routes Specs Mutate

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Specs Mutate** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. This route group is limited to workspace-level spec validation.

## Requirements

### Requirement: POST validate runs structural ValidateSpecs

`POST /v1/workspaces/{ws}/specs/validate` MUST run `ValidateSpecs` either for the whole workspace or for a single canonical spec selected by the optional `specPath` query parameter.

### Requirement: spec validation inputs are schema-validated

The route MUST declare schema validation for `ws` params and optional `specPath` query input before handler logic runs. Invalid input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
