# Http Server Static Ui

## Purpose

When `specd ui serve` runs, the browser loads Studio from the same origin as the API so the connect gate can be skipped. This spec defines how the Node server serves the built `@specd/ui` dist: static assets with correct content types and SPA fallback for client-side deep links.

## Requirements

### Requirement: static assets are served from configured dist path

Given `uiDistPath`, the server MUST serve files from that directory at `/` (or configured base) with correct content types.

### Requirement: SPA fallback returns index.html

Unknown non-API GET paths that look like client routes MUST fall back to `index.html` so React Router can handle deep links.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
