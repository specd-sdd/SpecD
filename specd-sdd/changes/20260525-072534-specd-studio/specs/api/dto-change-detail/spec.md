# Dto Change Detail

## Purpose

Stable JSON wire shape for **Dto Change Detail** returned by `@specd/api` and consumed by `@specd/client`. Field names feed OpenAPI and TypeScript types; presenters map kernel results into this shape without adding business rules.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The **Dto Change Detail** wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: DTO includes mandatory Studio fields

The type MUST include at least:

- `specIds`, `specDependsOn`, schema, `invalidationPolicy`, append-only `history[]`, approval summaries — no artifact bodies

### Requirement: history events are extensible per event type

Each `history[]` element MUST include `type`, `at`, and `by` (actor object with `name` and `email`, or a string alias). Additional properties MUST reflect the kernel `ChangeEvent` variant (e.g. `from`/`to` on `transitioned`, `specIds` on `created`, `cause` and `affectedArtifacts` on `invalidated`). The wire shape MUST allow clients such as `ui:change-tab-events` to render all non-header fields without a fixed union per type in v1.

### Requirement: presenters map domain results without embedding rules

[`api:presenter-change`](../presenter-change/spec.md) MUST map kernel or graph results into this DTO and MUST NOT embed lifecycle, validation, or approval logic.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
