# Routes Changes Read

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Changes Read** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Read-only HTTP for one change: detail, conditional status, artifacts, context, preview, instructions. No `/validation` resource.

## Requirements

### Requirement: read routes use /v1 prefix and JSON responses

All paths MUST be under `/v1`. Responses MUST use `application/json` unless returning raw artifact text.

### Requirement: /changes read routes resolve active changes only

`/changes/{name}` and all `/changes/{name}/*` read routes MUST treat drafted and discarded names as **not found**. When `name` exists only under `drafts/` or `discarded/`, handlers MUST return HTTP 404 `application/problem+json` rather than serving a read-only view through the active change routes.

### Requirement: GET change detail omits artifact bodies

`GET /changes/{name}` MUST return metadata, `specIds`, schema, append-only `history`, and approval summaries and MUST NOT inline artifact file bodies.

### Requirement: GET status supports ifModifiedSince short-circuit

`GET /changes/{name}/status` MUST accept optional `ifModifiedSince`. When it equals manifest `updatedAt`, the handler MUST return `{ unchanged: true, updatedAt }` without building the full artifact DAG. Otherwise return full status including blockers, `nextAction`, tasks, and implementation projection.

### Requirement: refreshImplementation query runs before GetStatus

When `refreshImplementation=true`, the handler MUST run implementation refresh before `GetStatus`, matching CLI semantics.

### Requirement: artifact list and body routes use dedicated core use cases

`GET /changes/{name}/artifacts` lists tracked filenames and aggregate states from the active change. `GET /changes/{name}/artifacts/{filename}` MUST return `ArtifactContentDto` via `GetChangeArtifact`, not direct repository access.

`GET /drafts/{name}/artifacts` and `GET /discarded/{name}/artifacts` MUST list metadata from `DraftedChangeView` / `DiscardedChangeView` without inline bodies. `GET /drafts/{name}/artifacts/{filename}` and `GET /discarded/{name}/artifacts/{filename}` MUST return `ArtifactContentDto` via `GetReadOnlyChangeArtifact` with `readOnlyOrigin` `draft` or `discarded`, not `GetChangeArtifact` and not direct `ChangeRepository` calls.

### Requirement: context preview and instruction routes delegate to kernel

`GET .../context`, `GET .../preview`, hook-instructions, artifact-instruction, and implementation-review routes MUST forward query parameters to the matching kernel use cases.

`GET .../context` MUST default `includeChangeSpecs` to **true** (unless `includeChangeSpecs=false`), default `step` to a workflow step derived from the change `state` (not a hard-coded project-only step), and return markdown shaped like CLI `changes context` (project entries plus change spec full content or catalogue).

`GET .../implementation-review` MUST return JSON matching [`api:dto-implementation-review`](../dto-implementation-review/spec.md) (`specIds`, `implementationTracking.links`, `implementationTracking.trackedFiles`).

### Requirement: POST preview accepts draft artifact overrides

`POST /changes/{name}/preview` MUST accept JSON body `{ specId: string, artifactOverrides?: Record<string, string> }` where keys are change-directory filenames (e.g. `deltas/ui/foo/spec.md.delta.yaml`). The handler MUST call `PreviewSpec` with `artifactOverrides` when present. `GET .../preview?specId=` MUST remain for saved-on-disk preview only.

### Requirement: POST change artifact outline accepts draft content

`POST /changes/{name}/artifacts/{filename}/outline` MUST accept optional JSON body `{ content?: string }`. When `content` is set, the handler MUST call `OutlineChangeArtifact` with draft content; when omitted, outline bytes from the saved change artifact. Response MUST be JSON outline entry shape (filename, outline, optional selectorHints).

### Requirement: unknown change returns 404 problem+json

Requests for a non-existent change name MUST return HTTP 404 with `application/problem+json`. Malformed queries MUST return HTTP 400.

### Requirement: drafted change read routes are separate and read-only

The API MUST expose read-only drafted change routes under `/drafts/{name}`:

- `GET /drafts/{name}` → drafted change detail (read-only) as `ChangeDetailDto` (no mutation fields implied).
- `GET /drafts/{name}/status` → drafted status via `GetStatus`, returning a `ChangeStatusDto` that supports `unchanged` short-circuit but MUST NOT include lifecycle transitions that require mutation.
- `GET /drafts/{name}/artifacts` and `GET /drafts/{name}/artifacts/{filename}` → allow reading tracked artifact content for inspection.
- `GET /drafts/{name}/context`, `GET /drafts/{name}/preview`, instruction routes → identical shapes to the active `/changes/{name}` read routes.

Drafted routes MUST NOT allow artifact writes: there is no `PUT /drafts/{name}/artifacts/{filename}`.

### Requirement: discarded change read routes are separate and read-only

The API MUST expose read-only discarded change routes under `/discarded/{name}`:

- `GET /discarded/{name}` → discarded change detail (read-only) as `ChangeDetailDto`.
- `GET /discarded/{name}/status` → discarded status via `GetStatus` (read-only view).
- `GET /discarded/{name}/artifacts` and `GET /discarded/{name}/artifacts/{filename}` → allow reading tracked artifact content for inspection.

Discarded routes MUST NOT allow any lifecycle mutation or artifact writes.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load for **active** changes MUST use `core:save-change-artifact` and `core:get-change-artifact`. Read-only draft/discarded artifact bodies MUST use `core:get-read-only-change-artifact` — not raw `ChangeRepository` methods from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
