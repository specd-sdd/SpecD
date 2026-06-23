# Dto Change Detail

## Purpose

Client-side type for **Dto Change Detail**, kept in parity with the matching `api:dto-*` spec so remote and embedded Studio render the same JSON the API emits.

## Requirements

### Requirement: client DTO matches API wire shape

Field names, optional/required semantics, and nesting MUST match the paired `api:dto-*` spec. The client MUST NOT invent alternate property names.

### Requirement: types are shared or generated from API schemas

DTO types MUST be imported from a shared package or generated from the same schema source used by API presenters and OpenAPI.

### Requirement: archived snapshot exposes archivedMeta on ChangeDetailDto

When `getArchivedChange(name)` maps the archived snapshot into `ChangeDetailDto`, the result MUST set `state` to `archived` and MUST include optional `archivedMeta` with `archivedName`, `archivedAt`, and `artifactTypes` (artifact type IDs from the archive). Active changes loaded via `getChange` MUST omit `archivedMeta`.

### Requirement: ChangeDetailDto exposes invalidationPolicy

`ChangeDetailDto` MUST include optional `invalidationPolicy` (`none` | `surgical` | `downstream` | `global`) matching the API presenter.

### Requirement: ChangeHistoryEventDto allows type-specific fields

`ChangeHistoryEventDto` MUST include `type`, `at`, and optional `by`, and MUST allow additional properties per event type (index signature or equivalent) so `ui:change-tab-events` can list every field returned by the API presenter.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`api:dto-change-detail`](../../api/dto-change-detail/spec.md) — mirror API DTO
