# Routes Archived Changes

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Archived Changes** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Read-only HTTP contract for archived changes.

## Requirements

### Requirement: GET archived change returns read-only archived detail

`GET /v1/archived-changes/{name}` MUST return archived metadata and manifest snapshot via `GetArchivedChange`. Unknown name MUST return 404 with `application/problem+json`.

The success body MUST reflect the merged archived read model rather than the pre-merge minimal DTO. It MUST include at least:

- `name`
- `state`
- `archivedName`
- `archivedAt` (ISO-8601)
- `specIds`
- `schemaName`
- `schemaVersion`
- `history`
- `workspaces`
- `artifacts` as read-only artifact metadata entries

The archived `artifacts[]` payload MUST list only files actually present in the archived snapshot. Manifest placeholders that remained `missing` before archive MUST NOT be surfaced as clickable archived artifact rows.

Archived artifact rows MUST also preserve task metadata (`hasTasks`) and MAY include `totalTasks` / `completedTasks` derived from the archived content using the current schema's task-completion rules so Studio can render archived task tabs without assuming `tasks.md`.

It MAY also expose `description`, `specDependsOn`, `updatedAt`, `archivedBy`, and `archivedMeta`. Archived detail MUST NOT be served from `GET /v1/changes/{name}`.

### Requirement: GET archived artifact body returns tracked read-only content

`GET /v1/archived-changes/{name}/artifacts/{filename}` MUST return the tracked artifact content for that archived snapshot via `GetReadOnlyChangeArtifact` with `readOnlyOrigin` `archived`.

Unknown change or untracked filename MUST return a typed problem+json error. This route MUST NOT fall through to active `/v1/changes/{name}/artifacts/{filename}` handling.

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
