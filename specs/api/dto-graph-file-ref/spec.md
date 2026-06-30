# Dto Graph File Ref

## Purpose

Stable JSON wire shape for a reusable **graph file reference** returned by `@specd/api` and
consumed by `@specd/client`. Graph endpoints use this DTO to expose file identity and resolved
path context without forcing Studio to parse `workspace:path` strings itself.

## Requirements

### Requirement: graph file refs expose canonical id and resolved path context

`GraphFileRefDto` MUST declare:

- `id` — canonical graph file identifier, using the existing `workspace:path` format
- `workspace` — workspace name parsed from the canonical identifier
- `workspaceRelativePath` — file path relative to the workspace `codeRoot`
- `projectRelativePath` — file path relative to the loaded project root

The DTO MUST NOT require clients to split `id` in order to recover workspace or path fields needed
for navigation.

### Requirement: graph file refs use stable camelCase field names

The **Dto Graph File Ref** wire shape MUST use camelCase property names stable across Studio
releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: api computes project-relative file context

`@specd/api` MUST compute `projectRelativePath` using the loaded `SpecdConfig.workspaces`
definition rather than requiring `@specd/code-graph` to know project-root presentation concerns.

## Constraints

- `@specd/api` delivery and composition code MUST import host bootstrap and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery
  layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module
  conventions
