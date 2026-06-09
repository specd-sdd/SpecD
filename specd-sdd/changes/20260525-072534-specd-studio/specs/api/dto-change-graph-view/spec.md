# Dto Change Graph View

## Purpose

Stable JSON wire shape for **Dto Change Graph View** returned by `@specd/api` and consumed by `@specd/client`. Field names feed OpenAPI and TypeScript types; presenters map kernel results into this shape without adding business rules.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The **Dto Change Graph View** wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: presenters map domain results without embedding rules

[`api:presenter-change`](../presenter-change/spec.md) MUST map kernel or graph results into this DTO and MUST NOT embed lifecycle, validation, or approval logic.

### Requirement: change graph view lists per-spec coverage

`GET /v1/graph/changes/{name}` MUST return a JSON object with:

- `changeName` — change name
- `specIds` — spec IDs in change scope (ordered list)
- `specs` — array of `{ specId, coveredFiles, coveredSymbols }` where:
  - `coveredFiles[]` use [`api:dto-graph-file-ref`](../dto-graph-file-ref/spec.md)
  - `coveredSymbols[]` use [`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md)

The response MUST NOT use a `links` property; clients and OpenAPI MUST use `specs` for per-spec coverage rows.

### Requirement: optional fields are omitted rather than null

Optional properties MUST be omitted from JSON when absent unless the OpenAPI schema explicitly allows `null`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`api:dto-graph-file-ref`](../dto-graph-file-ref/spec.md) — reusable graph file reference
- [`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) — reusable graph symbol reference
