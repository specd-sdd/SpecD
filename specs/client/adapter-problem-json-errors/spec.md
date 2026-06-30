# Adapter Problem Json Errors

## Purpose

SpecD Studio capability **Adapter Problem Json Errors** (`client:adapter-problem-json-errors`). Translate HTTP problem responses into typed errors the UI can display. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: problem+json is parsed into SpecdClientError

When response `Content-Type` is `application/problem+json`, the adapter MUST parse `status`, `title`, `detail`, and specd-specific extension fields into a throwable error type.

### Requirement: 409 conflict preserves conflict metadata

For `ArtifactConflictError` (HTTP 409), the adapter MUST preserve enough detail for `ui:hooks-inspector-save` to show a conflict UI.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
