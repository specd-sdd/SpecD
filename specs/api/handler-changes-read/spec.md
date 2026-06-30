# Handler Changes Read

## Purpose

HTTP handlers for **changes read** in SpecD Studio. They validate requests, call kernel use cases exposed through `@specd/sdk` as listed in the paired `routes-*` spec, and map results through presenters. Business rules live in core use cases invoked via `apiContext.kernel` — not in this delivery module.

## Requirements

### Requirement: handler implements the routes contract under /v1

The module MUST implement every method, path, query, and body declared in [`api:routes-changes-read`](../routes-changes-read/spec.md) under the `/v1` prefix. It MUST NOT expose undocumented routes.

### Requirement: handler delegates to kernel without duplicating domain rules

Business rules for lifecycle, validation, approvals, and conflicts MUST live in core use cases. This handler MUST invoke them only through `apiContext.kernel` (types and factories imported from `@specd/sdk`), including:

- `GetStatus` (with optional `ifModifiedSince`)
- `GetChangeArtifact`
- `GetReadOnlyChangeArtifact` (draft and discarded artifact bodies)
- `CompileContext`
- `PreviewSpec` (GET and POST with optional `artifactOverrides`)
- `OutlineChangeArtifact`
- `GetArtifactInstruction`
- `GetHookInstructions`
- `GetImplementationReview`
- change detail via repository get (metadata only, no artifact bodies inline)

When serving change or read-only artifact lists, the handler MAY combine repository/view metadata with `GetStatus` and active schema metadata in order to expose `hasTasks`, `totalTasks`, and `completedTasks` without duplicating task-completion rules in the UI.

### Requirement: artifact GET and PUT use dedicated core use cases

For `/changes/{name}/artifacts/{filename}`, `GET` MUST call `GetChangeArtifact` and `PUT` MUST call `SaveChangeArtifact`. For `/drafts/{name}/artifacts/{filename}` and `/discarded/{name}/artifacts/{filename}`, `GET` MUST call `GetReadOnlyChangeArtifact` with the matching `readOnlyOrigin`. The handler MUST NOT call `ChangeRepository.artifact` or `saveArtifact` directly.

### Requirement: successful responses use presenters and DTO wire shapes

Successful responses MUST be produced by the matching `api:presenter-*` module and conform to the corresponding `api:dto-*` spec.

### Requirement: failures map to RFC 7807 problem+json

Thrown kernel errors and validation failures MUST be converted through `api:problem-json` to `application/problem+json` responses with appropriate HTTP status codes.

### Requirement: mutations pass the request-scoped actor into kernel

Every mutating kernel call MUST receive the `actor` resolved in `createApiContext` so history events record the correct `by` field.

### Requirement: SDK delivery imports

Handler modules MUST import kernel types, errors, and use-case entry points from `@specd/sdk`. They MUST NOT import `@specd/core` directly.

## Constraints

- Handler modules MUST import kernel types and use-case entry points from `@specd/sdk`, not `@specd/core` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Active artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact`. Draft/discarded artifact GET MUST use `core:get-read-only-change-artifact` — not raw `ChangeRepository` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK import policy for API delivery
- [`api:routes-changes-read`](../routes-changes-read/spec.md) — route contract
- [`core:get-status`](../../core/get-status/spec.md) — status use case
- [`core:get-change-artifact`](../../core/get-change-artifact/spec.md) — artifact read
- [`core:get-read-only-change-artifact`](../../core/get-read-only-change-artifact/spec.md) — draft/discarded artifact read
