# Openapi Docs Route

## Purpose

SpecD Studio capability **Openapi Docs Route** (`api:openapi-docs-route`). Expose generated OpenAPI and optional Swagger UI for integrators. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: openapi.json is served at a stable path

`GET /openapi.json` MUST return the generated OpenAPI 3.1 document.

### Requirement: interactive docs are environment-gated

`GET /docs` (Swagger UI) MUST be disabled by default in production or protected by deployment configuration.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
