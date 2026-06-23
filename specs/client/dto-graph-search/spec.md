# Dto Graph Search

## Purpose

Client-side type for **Dto Graph Search**, kept in parity with the matching `api:dto-*` spec so remote and embedded Studio render the same JSON the API emits.

## Requirements

### Requirement: client DTO matches API wire shape

Field names, optional/required semantics, and nesting MUST match the paired `api:dto-*` spec. The client MUST NOT invent alternate property names.

### Requirement: types are shared or generated from API schemas

DTO types MUST be imported from a shared package or generated from the same schema source used by API presenters and OpenAPI.

### Requirement: symbol hits use reusable graph symbol refs

The client DTO for graph search symbol hits MUST reuse
[`client:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) for the nested `symbol` payload
rather than declaring duplicate location fields inline.

The client DTO MUST also preserve graph-search preview fields on both symbol and spec hits:

- `snippet`
- `startLine`
- `endLine`

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`api:dto-graph-search`](../../api/dto-graph-search/spec.md) — mirror API DTO
- [`client:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) — reusable graph symbol
  reference
