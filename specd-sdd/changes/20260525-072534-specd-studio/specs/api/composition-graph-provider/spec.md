# Composition Graph Provider

## Purpose

Graph routes must not construct `@specd/code-graph` providers ad hoc with divergent paths or freshness rules. This spec centralizes provider creation from `SpecdConfig` so index, search, impact, and linkage handlers share one implementation and expose stale-state signals to the UI.

## Requirements

### Requirement: provider is created from project configuration

The factory MUST accept the resolved `SpecdConfig` (workspaces, code roots) and return a provider exposing index, search, impact, stats, and linkage operations used by `api:routes-graph`.

### Requirement: stale state is observable

The provider (or its stats call) MUST expose freshness/stale signals consumed by `GET /v1/graph/status` so the UI can warn when the index is out of date.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
