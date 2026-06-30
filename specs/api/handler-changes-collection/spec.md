# Handler Changes Collection

## Purpose

HTTP handlers for **changes collection** in SpecD Studio. They validate requests, call kernel use cases exposed through `@specd/sdk` as listed in the paired `routes-*` spec, and map results through presenters. Business rules live in core use cases invoked via `apiContext.kernel` — not in this delivery module.

## Requirements

### Requirement: handler implements the routes contract under /v1

The module MUST implement every method, path, query, and body declared in [`api:routes-changes-collection`](../routes-changes-collection/spec.md) under the `/v1` prefix. It MUST NOT expose undocumented routes.

### Requirement: handler delegates to kernel without duplicating domain rules

Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel`, including:

- `CreateChange`
- `kernel.changes.list`
- `kernel.changes.listDrafts`
- `kernel.changes.listDiscarded`
- `kernel.changes.listArchived`
- `DetectOverlap`

### Requirement: successful responses use presenters and DTO wire shapes

Successful responses MUST be produced by the matching `api:presenter-*` module and conform to the corresponding `api:dto-*` spec.

### Requirement: failures map to RFC 7807 problem+json

Thrown kernel errors and validation failures MUST be converted through `api:problem-json` to `application/problem+json` responses with appropriate HTTP status codes.

### Requirement: archived list serializes list-result structure instead of legacy arrays

When mapping `kernel.changes.listArchived`, the handler MUST preserve the split `items/meta` shape introduced by the merged archive index contract. It MUST NOT flatten archive rows into a bare array that loses pagination metadata.

### Requirement: SDK delivery imports

Handler modules MUST import kernel types, errors, and use-case entry points from `@specd/sdk`. They MUST NOT import `@specd/core` directly.

## Constraints

- Handler modules MUST import kernel types and use-case entry points from `@specd/sdk`, not `@specd/core` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK import policy for API delivery
- [`api:routes-changes-collection`](../routes-changes-collection/spec.md) — HTTP contract
