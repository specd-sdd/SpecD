# Dto Implementation Review

## Purpose

Stable JSON wire shape for **`GET /v1/changes/{name}/implementation-review`**, returned by `@specd/api` and consumed by `@specd/client`. Reflects manifest **implementation-tracking** (accepted links + tracked files) for Studio Impact and CLI `changes implementation review`.

## Requirements

### Requirement: response JSON uses stable camelCase field names

The wire shape MUST use camelCase property names stable across Studio releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: top-level shape matches GetImplementationReview

`GET .../implementation-review` MUST return:

- `specIds` — readonly list of spec IDs in the change scope
- `implementationTracking` — object with:
  - `links` — array of accepted implementation links
  - `trackedFiles` — array of tracked files under review

### Requirement: implementation link entries

Each `implementationTracking.links[]` entry MUST include:

- `specId` — canonical spec ID (e.g. `ui:change-tab-impact`)
- `file` — project-relative file path (raw manifest path)
- `fileLinkExplicit` — boolean; `false` when the file row exists only as a container for symbol-level links
- `symbols` — optional string array of symbol identifiers when symbol-level links exist

### Requirement: tracked file entries

Each `implementationTracking.trackedFiles[]` entry MUST include:

- `file` — project-relative file path
- `state` — one of `open`, `resolved`, `ignored`

### Requirement: handler maps kernel projection without business rules

The route handler MUST call `GetImplementationReview` and serialize `implementationTracking` via [`api:presenter-change`](../presenter-change/spec.md) (or equivalent presenter) without adding lifecycle, validation, or graph enrichment in v1. CLI graph stale-symbol enrichment remains CLI-only unless a future change adds an API flag.

### Requirement: optional fields are omitted rather than null

Optional properties (e.g. `symbols`) MUST be omitted from JSON when absent unless the OpenAPI schema explicitly allows `null`.

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
- [`core:change`](../../core/change/spec.md) — manifest link and tracked-file semantics
