# Dto Graph Search

## Purpose

Stable JSON wire shape for **Dto Graph Search** returned by `@specd/api` and consumed by `@specd/client`. Field names feed OpenAPI and TypeScript types; presenters map kernel results into this shape without adding business rules.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The **Dto Graph Search** wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: presenters map domain results without embedding rules

[`api:presenter-graph`](../presenter-graph/spec.md) MUST map kernel or graph results into this DTO and MUST NOT embed lifecycle, validation, or approval logic.

### Requirement: symbol hits use reusable graph symbol refs

`GraphSearchResultDto.symbols[]` MUST include:

- `workspace`
- `symbol`
- `score`
- `snippet`
- `startLine`
- `endLine`

The nested `symbol` object MUST use the reusable shape defined by
[`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) rather than repeating ad hoc symbol
location fields inline.

### Requirement: spec hits expose preview context

`GraphSearchResultDto.specs[]` MUST include preview context from graph search:

- `snippet`
- `startLine`
- `endLine`

Those fields MUST reflect the persisted graph-search preview contract rather than being recomputed by the API.

### Requirement: document hits expose file context

`GraphSearchResultDto.documents[]` MUST include hits for non-specification documents from the graph search:

- `workspace`
- `path`
- `projectRelativePath`
- `score`
- `snippet`
- `startLine`
- `endLine`

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
- [`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) — reusable graph symbol reference
