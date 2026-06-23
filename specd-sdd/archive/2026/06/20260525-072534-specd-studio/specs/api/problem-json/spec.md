# Problem Json

## Purpose

Remote Studio adapters and the connect panel need predictable JSON errors, not stack traces or HTML. This spec requires mapping specd and kernel failures to RFC 7807 `application/problem+json` responses with stable codes consumed by `client:adapter-problem-json-errors`.

## Requirements

### Requirement: error responses use application/problem+json

When a handler or middleware surfaces a failure, the response MUST use `Content-Type: application/problem+json` and include at least `type`, `title`, and `status` fields compatible with RFC 7807.

### Requirement: SpecdError codes are preserved in the problem body

When the thrown error is a `SpecdError` (or subclass), the problem payload MUST include the specd error code and any safe detail fields expected by `client:adapter-problem-json-errors`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
