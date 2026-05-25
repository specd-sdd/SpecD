# Routes Specs Mutate

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Specs Mutate** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Mutating routes for workspace-level spec validation and metadata (privileged).

## Requirements

### Requirement: POST validate runs structural ValidateSpecs

`POST /v1/workspaces/{ws}/specs/validate` MUST run `ValidateSpecs` for a `specPath` or the whole workspace per request body/query.

### Requirement: POST metadata saves or regenerates spec metadata files

`POST /v1/workspaces/{ws}/specs/{path}/metadata` MUST call `saveMetadata` or `generateMetadata` per request body.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
