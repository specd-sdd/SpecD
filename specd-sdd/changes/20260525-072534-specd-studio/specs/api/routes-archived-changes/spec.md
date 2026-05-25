# Routes Archived Changes

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Archived Changes** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Read-only HTTP contract for archived changes.

## Requirements

### Requirement: GET archived change returns manifest snapshot

`GET /v1/archived-changes/{name}` MUST return archived metadata and manifest snapshot via `GetArchivedChange`. Unknown name MUST return 404 with `application/problem+json`.

The success body MUST include at least: `name`, `archivedName`, `archivedAt` (ISO-8601), `specIds`, `schemaName`, `schemaVersion`, and `artifacts` (artifact type IDs present at archive time). It MUST NOT be served from `GET /v1/changes/{name}`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
