# Adapter Memory Specd Data

## Purpose

SpecD Studio capability **Adapter Memory Specd Data** (`client:adapter-memory-specd-data`). In-memory `SpecdDataPort` for unit tests and Storybook without network I/O. This spec is canonical after archive: implementers rely on the requirements below, not change-only documents.

## Requirements

### Requirement: memory adapter implements the full SpecdDataPort surface

The adapter MUST implement every method group defined on `client:specd-data-port` with deterministic fixture data.

### Requirement: memory adapter performs no network or disk I/O

Calls MUST NOT open sockets or read the real project filesystem unless explicitly configured in a test harness.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
