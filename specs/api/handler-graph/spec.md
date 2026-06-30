# Handler Graph

## Purpose

HTTP handlers for **graph** in SpecD Studio. They validate requests, call graph operations through the SDK host context (`createGraphProvider`, `runIndexProjectGraph`) and kernel use cases from `@specd/sdk`, and map results through presenters. Business rules live in code-graph and core use cases — not in this delivery module.

## Requirements

### Requirement: handler implements the routes contract under /v1

The module MUST implement every method, path, query, and body declared in [`api:routes-graph`](../routes-graph/spec.md) under the `/v1` prefix. It MUST NOT expose undocumented routes.

### Requirement: handler delegates to kernel without duplicating domain rules

Business rules MUST live in core and code-graph use cases. This handler MUST invoke only:

- `apiContext.createGraphProvider()` for stats, search, impact, and hotspots
- `runIndexProjectGraph` from `@specd/sdk` for `POST /v1/graph/index`
- change-scoped graph view composed from change `specIds` via kernel use cases

The handler MUST NOT import `createCodeGraphProvider` from `@specd/code-graph` directly.

### Requirement: successful responses use presenters and DTO wire shapes

Successful responses MUST be produced by the matching `api:presenter-*` module and conform to the corresponding `api:dto-*` spec.

### Requirement: failures map to RFC 7807 problem+json

Thrown kernel errors and validation failures MUST be converted through `api:problem-json` to `application/problem+json` responses with appropriate HTTP status codes.

### Requirement: graph indexing uses CLI-aligned project assembly

For `POST /v1/graph/index`, the handler MUST call `runIndexProjectGraph` from `@specd/sdk` with the resolved `SpecdConfig` and process-scoped kernel. It MUST NOT build a parallel legacy workspace-target shape or duplicate CLI assembly logic outside the SDK helper.

### Requirement: SDK delivery imports

Handler modules MUST import graph orchestration helpers and kernel types from `@specd/sdk`. They MUST NOT import `@specd/core` or `@specd/code-graph` directly.

## Constraints

- Handler modules MUST import graph orchestration and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK import policy
- [`sdk:run-index-project-graph`](../../sdk/run-index-project-graph/spec.md) — index orchestration
- [`api:routes-graph`](../routes-graph/spec.md) — HTTP contract
