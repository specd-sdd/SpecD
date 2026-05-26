# Port Changes Read

## Purpose

TypeScript surface for **Port Changes Read** on `SpecdDataPort`, mirroring the HTTP routes in the paired `api:routes-*` group. UI hooks call these methods; adapters implement them over HTTP or IPC.

## Requirements

### Requirement: port exposes Changes Read operations

The interface MUST declare asynchronous methods equivalent to the HTTP routes in the matching `api:routes-*` group:

- `getChange(name)`, `getChangeStatus(name, { ifModifiedSince?, refreshImplementation? })`
- `listChangeArtifacts(name)`, `getChangeArtifact(name, filename)`
- `getChangeContext(name, query)`, `previewChange(name, query)`, `previewChangeDraft(name, input)`, `outlineChangeArtifact(name, filename, input?)`, instructions helpers
- `getImplementationReview(name)` → [`client:dto-implementation-review`](dto-implementation-review/spec.md) (`implementationTracking.links`, `implementationTracking.trackedFiles`, `specIds`)

Drafted and discarded changes are read-only and MUST use dedicated read entry points:

- `getDraft(name)`, `getDraftStatus(name, { ifModifiedSince? })`, `listDraftArtifacts(name)`
- `getDiscarded(name)`, `getDiscardedStatus(name, { ifModifiedSince? })`, `listDiscardedArtifacts(name)`
- `getReadOnlyChangeArtifact(name, filename, readOnlyOrigin)` where `readOnlyOrigin` is `draft` | `discarded` | `archived` (reserved)

`getDraftArtifact` and `getDiscardedArtifact` MAY delegate to `getReadOnlyChangeArtifact` with the matching origin. These methods map to `/drafts/{name}/*` and `/discarded/{name}/*` and MUST NOT call active `/changes/{name}/*` routes.

### Requirement: port signatures are identical for HTTP and IPC adapters

Implementations (`adapter-remote-specd-data`, desktop IPC) MUST implement these methods without altering parameter or return types.

### Requirement: port failures surface as typed client errors

HTTP failures MUST be translated by `adapter-problem-json-errors` into errors the UI hooks can display.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Active artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact`. Read-only draft/discarded bodies MUST use `core:get-read-only-change-artifact` via `getReadOnlyChangeArtifact` — not `getChangeArtifact` or raw repository access.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`client:specd-data-port`](../specd-data-port/spec.md) — composed port
