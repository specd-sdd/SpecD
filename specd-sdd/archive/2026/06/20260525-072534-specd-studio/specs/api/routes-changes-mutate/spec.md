# Routes Changes Mutate

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Changes Mutate** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Mutating HTTP on a change. v1 does not enforce server Bearer when `api.auth.type` is `disabled`.

## Requirements

### Requirement: PUT artifact save uses SaveChangeArtifact use case

`PUT /changes/{name}/artifacts/{filename}` MUST accept `{ content, originalHash, force? }` and invoke `SaveChangeArtifact`. Hash conflicts MUST return HTTP 409; approval guard without `force` MUST map to `SaveRequiresForceError`.

### Requirement: POST routes run validate transition and lifecycle actions

`POST .../validate` (single schema step, flat `ValidateResultDto`), `POST .../validate-all` (DAG batch via `kernel.changes.validateBatch`, `ValidateBatchResultDto`), `POST .../transition`, draft, restore, discard, archive, approve-spec, approve-signoff, invalidate, and skip-artifact MUST delegate to the matching kernel use cases without duplicated rules.

`POST .../validate-all` MUST accept optional `{ artifactId }` and MUST NOT loop `specIds` in the handler.

### Requirement: mutating-route inputs are schema-validated

Every `params`, `query`, and `body` shape accepted by this route group MUST be declared in Fastify route schema and validated before handler logic runs.

This includes at minimum artifact save bodies, validate filters, transition targets and hook-phase selectors, skip-artifact bodies, and implementation-tracking mutations. Invalid input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

### Requirement: draft and restore mutations use change lifecycle actions

Drafted and discarded changes are read-only storage classes, but lifecycle mutations continue to be addressed by change name through the active mutation surface:

- **Draft active change**: `POST /changes/{name}/draft` shelves an active change to drafts.
- **Restore drafted change**: `POST /changes/{name}/restore` restores a drafted change back to the active list.
- **Discard active or drafted change**: `POST /changes/{name}/discard` permanently discards a change (whether currently active or drafted).

There is no restore from discarded; there MUST NOT be `POST /discarded/{name}/restore`.

### Requirement: PATCH routes edit metadata spec deps and implementation tracking

`PATCH /changes/{name}` MUST support safe `description` updates and approval-invalidating `addSpecIds`/`removeSpecIds` plus `invalidationPolicy`. Response MUST be full `ChangeDetailDto` via `toChangeDetailDto`.

`PATCH /changes/{name}/spec-dependencies` MUST accept `{ specId, add?, remove?, set? }`, delegate to `kernel.changes.updateSpecDeps`, and return `{ specId, dependsOn }` (Studio refetches detail after save).

`PATCH /changes/{name}/implementation-tracking` MUST accept `{ action, file, specId?, symbols? }`, delegate to `kernel.changes.updateImplementationTracking`, and return `{ implementationTracking }` with tracked files and confirmed links.

### Requirement: mutating routes pass request actor into kernel

Every mutating handler MUST pass the request-scoped actor from `createApiContext` into kernel use cases for history `by`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
