# Openapi Docs Route

## Purpose

SpecD Studio capability **Openapi Docs Route** (`api:openapi-docs-route`). Expose generated OpenAPI and optional Swagger UI for integrators. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: openapi.json is served at a documented path

The API MUST expose an HTTP `GET` endpoint that returns the generated **OpenAPI 3.1** document as JSON.

The path MUST be documented in repository docs (for example `docs/api/openapi.md`) and MAY change between releases.

### Requirement: OpenAPI docs UI is optional

The server MAY expose an interactive documentation UI (e.g. Swagger UI), but it is not required for Studio v1.

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
