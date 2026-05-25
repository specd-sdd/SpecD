# Openapi Generation

## Purpose

SpecD Studio capability **Openapi Generation** (`api:openapi-generation`). Generate a machine-readable OpenAPI 3.1 document from route and DTO schemas. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: OpenAPI reflects route and DTO specs

Generated paths and schemas MUST be derived from the Zod (or equivalent) types that implement `api:routes-*` and `api:dto-*` contracts, not hand-maintained parallel definitions.

### Requirement: document version tracks API prefix

The generated document MUST describe the `/v1` surface only.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
