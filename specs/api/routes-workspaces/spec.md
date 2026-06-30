# Routes Workspaces

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Workspaces** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. This route group covers workspace discovery and top-level canonical spec tree listing only.

## Requirements

### Requirement: GET workspaces lists orchestrated project workspaces

`GET /v1/workspaces` MUST use `ListWorkspaces` as the source of truth for workspace identity, ownership, code roots, and declaration order.

The response MAY enrich those rows with static descriptor fields from `SpecdConfig` such as `prefix` and `specsPath`, but it MUST NOT bypass `ListWorkspaces` by rebuilding the workspace list from raw config alone.

### Requirement: GET workspace spec tree lists canonical specs without artifact bodies

`GET /v1/workspaces/{ws}/specs` MUST return the canonical spec tree for the selected workspace from `kernel.specs.list`.

Each entry MUST provide discovery metadata needed to navigate canonical specs, but this route MUST NOT inline canonical artifact bodies or per-spec detail payloads. Canonical spec detail, artifact reads, outline, context, and metadata actions belong to `api:routes-specs-read`.

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
