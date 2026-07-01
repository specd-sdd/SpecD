# Dto Project Status

## Purpose

Stable JSON wire shape for **Dto Project Status** returned by `@specd/api` and consumed by `@specd/client`. Field names feed OpenAPI and TypeScript types; presenters map kernel results into this shape without adding business rules.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The **Dto Project Status** wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: DTO includes mandatory Studio fields

The type MUST include at least:

- active/draft/discarded/archive counts
- `graph` summary with freshness/stale and the same fields as [`api:dto-graph-status`](../dto-graph-status/spec.md) needed for Studio chrome and Graph main view: counts (`fileCount`, `documentCount`, `symbolCount`, `specCount`), `lastIndexedAt`, `lastIndexedRef`, `stale`, `currentRef`, `fingerprintMismatch`, and `warnings[]`
- `auth: { type }`

When graph health is unavailable, `graph` MAY be omitted; when present, diagnostic fields MUST follow the same omission rules as `GraphStatusDto`.

### Requirement: project graph summary exposes health diagnostics

The embedded `graph` summary on `ProjectStatusDto` MUST expose count, freshness, and diagnostic fields with the same shapes and omission rules as [`api:dto-graph-status`](../dto-graph-status/spec.md), including `warnings[]`, `fingerprintMismatch`, `currentRef`, and `stale`.

### Requirement: presenters map domain results without embedding rules

[`api:presenter-project`](../presenter-project/spec.md) MUST map kernel or graph results into this DTO and MUST NOT embed lifecycle, validation, or approval logic.

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
