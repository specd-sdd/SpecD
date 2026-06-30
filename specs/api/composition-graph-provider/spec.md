# Composition Graph Provider

## Purpose

Graph routes must not construct `@specd/code-graph` providers ad hoc with divergent paths or freshness rules. This spec centralizes provider creation from `SpecdConfig` so index, search, impact, and linkage handlers share one implementation and expose stale-state signals to the UI.

## Requirements

### Requirement: provider is created from project configuration

The factory MUST obtain graph providers from the `createGraphProvider` function on the process-scoped `SdkHostContext` (created by `createSdkContext`). Each provider MUST be bound to the resolved `SpecdConfig` (workspaces, code roots) for the served project.

### Requirement: indexing preparation follows the merged project-assembly model

API graph indexing MUST use SDK orchestration (`runIndexProjectGraph` from `@specd/sdk`) with the same project-level assembly semantics as the CLI:

- orchestrated workspaces from `ListWorkspaces`
- effective graph config assembled from project config
- one project-level provider index call

API composition MUST NOT reconstruct an older workspace-target contract or duplicate CLI assembly logic outside the SDK helper.

### Requirement: stale state is observable

The provider (or its stats call) MUST expose freshness/stale signals consumed by `GET /v1/graph/status` so the UI can warn when the index is out of date.

### Requirement: SDK graph provider factory

Graph handlers and composition MUST obtain providers by calling `createGraphProvider` on the process-scoped `SdkHostContext`. They MUST NOT import `createCodeGraphProvider` from `@specd/code-graph` directly.

## Constraints

- `@specd/api` graph composition MUST import orchestration helpers from `@specd/sdk`.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:run-index-project-graph`](../../sdk/run-index-project-graph/spec.md) — project-level graph indexing orchestration
