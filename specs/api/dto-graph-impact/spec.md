# Dto Graph Impact

## Purpose

Stable JSON wire shape for **Dto Graph Impact** returned by `@specd/api` and consumed by `@specd/client`. Field names feed OpenAPI and TypeScript types; presenters map kernel results into this shape without adding business rules.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The **Dto Graph Impact** wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: presenters map domain results without embedding rules

[`api:presenter-graph`](../presenter-graph/spec.md) MUST map kernel or graph results into this DTO and MUST NOT embed lifecycle, validation, or approval logic.

### Requirement: impact entries use reusable graph refs

`GraphImpactDto.symbols[]` MUST use the reusable shape defined by
[`api:dto-graph-symbol-ref`](../dto-graph-symbol-ref/spec.md) plus optional impact-specific fields
such as `risk` and required traversal `depth`.

`GraphImpactDto.files[]` MUST use the reusable shape defined by
[`api:dto-graph-file-ref`](../dto-graph-file-ref/spec.md) plus optional impact-specific fields such
as `risk`.

`GraphImpactDto.specs[]` MUST expose affected spec ids as canonical `workspace:capability-path`
strings. The array MUST always be present, even when empty.

### Requirement: impact response exposes aggregate blast-radius metrics

`GraphImpactDto` MUST expose the aggregate analysis fields returned by graph impact:

- `riskLevel`
- `directDepsCount`
- `indirectDepsCount`
- `transitiveDepsCount`
- `affectedFilesCount`
- `affectedProcesses`

`GraphImpactDto.files[]` MUST be present as an array for all graph-impact responses, even when
empty, so clients can render a stable `Specs` / `Symbols` / `Files` layout without shape-guards.

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
