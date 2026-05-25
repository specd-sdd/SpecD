# Routes Workspaces

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Workspaces** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. HTTP contract for workspace discovery and canonical spec tree (workspace truth, not change-scoped deltas).

## Requirements

### Requirement: GET workspaces lists configured workspaces

`GET /v1/workspaces` MUST return the workspace list from `SpecdConfig.workspaces` including name, path prefix, ownership, and code roots.

### Requirement: GET spec tree and metadata without inline bodies

`GET /v1/workspaces/{ws}/specs` MUST return spec tree metadata. `GET /v1/workspaces/{ws}/specs/{path}` MUST return filenames, content hashes, and dependencies but MUST NOT inline artifact file bodies.

### Requirement: canonical spec artifacts are read-only in Studio v1

`GET /v1/workspaces/{ws}/specs/{path}/artifacts/{filename}` MAY return canonical artifact content for display. Studio v1 MUST NOT expose a mutating route for canonical workspace artifacts.

### Requirement: outline and context routes follow kernel contracts

`GET .../outline` and `GET .../context` MUST forward query parameters to `GetOutline` and `GetContext` respectively.

### Requirement: GET specs search accepts q and workspace filter

`GET /v1/specs/search` MUST accept `q` and optional workspace filter and delegate to `kernel.specs.search`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
