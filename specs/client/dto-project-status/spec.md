# Dto Project Status

## Purpose

Client-side type for **Dto Project Status**, kept in parity with the matching `api:dto-*` spec so remote and embedded Studio render the same JSON the API emits.

## Requirements

### Requirement: client DTO matches API wire shape

The TypeScript `ProjectStatusDto` / embedded `graph` summary in `@specd/client` MUST mirror [`api:dto-project-status`](../../api/dto-project-status/spec.md), including graph count and diagnostic fields (`fileCount`, `documentCount`, `symbolCount`, `specCount`, `lastIndexedAt`, `lastIndexedRef`, `stale`, `currentRef`, `fingerprintMismatch`, `warnings[]`).

### Requirement: client project status graph includes warnings

`ProjectStatusDto.graph.warnings` in `@specd/client` MUST preserve `{ type: string; message: string }[]` entries from the API wire shape.

### Requirement: types are shared or generated from API schemas

DTO types MUST be imported from a shared package or generated from the same schema source used by API presenters and OpenAPI.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`api:dto-project-status`](../../api/dto-project-status/spec.md) — mirror API DTO
