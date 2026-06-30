# Openapi Generation

## Purpose

SpecD Studio capability **Openapi Generation** (`api:openapi-generation`). Generate a machine-readable OpenAPI 3.1 document from route and DTO schemas. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: OpenAPI is generated from Fastify route schemas

The OpenAPI document MUST be generated from the Fastify route `schema` declarations (params/query/body/response) and shared DTO schemas, using `@fastify/swagger` (or an equivalent OpenAPI generator).

The implementation MUST NOT maintain a hand-written OpenAPI document (paths/schemas) in parallel to the route/DTO definitions.

### Requirement: document version tracks API prefix

The generated document MUST describe the `/v1` surface only.

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
