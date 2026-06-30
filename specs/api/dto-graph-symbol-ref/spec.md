# Dto Graph Symbol Ref

## Purpose

Stable JSON wire shape for a reusable **graph symbol reference** returned by `@specd/api` and
consumed by `@specd/client`. Graph endpoints use this DTO to expose symbol identity, source
location, and resolved path context without forcing Studio to parse raw symbol ids.

## Requirements

### Requirement: graph symbol refs expose canonical id, source location, and resolved paths

`GraphSymbolRefDto` MUST declare:

- `id` — canonical graph symbol identifier
- `workspace` — workspace name owning the symbol source file
- `workspaceRelativePath` — source file path relative to the workspace `codeRoot`
- `projectRelativePath` — source file path relative to the loaded project root
- `name` — symbol display name
- `kind` — symbol kind string from the graph model
- `line` — 1-based source line
- `column` — 0-based source column

The DTO MUST NOT require clients to parse `id` in order to recover workspace or file-navigation
data.

### Requirement: graph symbol refs use stable camelCase field names

The **Dto Graph Symbol Ref** wire shape MUST use camelCase property names stable across Studio
releases. OpenAPI generation MUST derive schemas from these names.

### Requirement: api computes path context while preserving graph-domain ids

`@specd/api` MUST preserve the canonical graph symbol id exactly as emitted by the graph provider,
while enriching the response with workspace-relative and project-relative path fields in delivery.

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
