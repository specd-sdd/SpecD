# Handler Archived Changes

## Purpose

HTTP handlers for **archived changes** in SpecD Studio. They validate requests, call existing `@specd/core` (or graph) operations listed in the paired `routes-*` spec, and map results through presenters — HTTP handler wiring for **Archived Changes**: validates input, invokes kernel or graph operations, maps results through presenters. Business rules live in `@specd/core`, not in this module.

## Requirements

### Requirement: handler implements the routes contract under /v1

The module MUST implement every method, path, query, and body declared in [`api:routes-archived-changes`](../routes-archived-changes/spec.md) under the `/v1` prefix. It MUST NOT expose undocumented routes.

### Requirement: handler delegates to kernel without duplicating domain rules

Business rules for lifecycle, validation, approvals, and conflicts MUST live in `@specd/core`. This handler MUST invoke only:

- `GetArchivedChange`
- `GetReadOnlyChangeArtifact` for archived artifact body reads

### Requirement: successful responses use presenters and DTO wire shapes

Successful responses MUST be produced by the matching `api:presenter-*` module and conform to the corresponding `api:dto-*` spec.

### Requirement: failures map to RFC 7807 problem+json

Thrown kernel errors and validation failures MUST be converted through `api:problem-json` to `application/problem+json` responses with appropriate HTTP status codes.

### Requirement: archived detail preserves read-only change fields

The handler MUST preserve the merged archived read model fields instead of collapsing detail down to legacy archive-only metadata. In particular, detail responses MUST keep read-only change fields such as `description`, `history`, `workspaces`, `specDependsOn`, and artifact metadata derived from the archived change view.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact`, `core:get-change-artifact`, and `core:get-read-only-change-artifact` as appropriate — not raw repository access from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`api:routes-archived-changes`](../routes-archived-changes/spec.md) — HTTP contract
- [`core:kernel`](../../core/kernel/spec.md) — kernel use cases
