# Routes Changes Collection

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Changes Collection** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. HTTP for listing and creating changes.

## Requirements

### Requirement: collection routes list changes drafts discarded and archived

The API MUST expose `GET /changes`, `/drafts`, `/discarded`, `/archived-changes`, and `/changes/overlaps` mapping to the corresponding kernel list and overlap operations.

### Requirement: drafts and discarded are read-only collections

`GET /drafts` and `GET /discarded` MUST return read-only summaries backed by drafted/discarded views. These collections exist for navigation and inspection only; lifecycle mutation entry points for drafts live under `/drafts/{name}/*` and MUST NOT be mixed into `/changes/{name}/*`.

### Requirement: POST changes creates a new change

`POST /changes` MUST accept a `CreateChange` input body and return the created change summary.

### Requirement: POST changes separates request validation from schema preconditions

`POST /changes` MUST validate the request body shape through Fastify route schema before handler logic runs. Invalid input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

After request validation succeeds, the handler MUST load the active schema and reject change creation when the schema resolves only to a raw reference rather than a compiled schema object. This rejection is a business precondition failure, not a request-shape validation error.

### Requirement: list responses include summary fields for sidebars

List endpoints MUST return `name`, description snippet, derived lifecycle state, `updatedAt` when known, and blocker count sufficient for Studio sidebars.

### Requirement: archived-changes list returns paginated archive index rows

`GET /v1/archived-changes` MUST mirror the merged `ListArchived` contract by returning an object with:

- `items`: archive index rows
- `meta`: pagination metadata

Each archive index row MUST include at least `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, `workspaces`, and `artifacts`. Studio maps those rows to archived sidebar summaries without fetching full archived detail first.

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
