# Port Changes Mutate

## Purpose

TypeScript surface for **Port Changes Mutate** on `SpecdDataPort`, mirroring the HTTP routes in the paired `api:routes-*` group. UI hooks call these methods; adapters implement them over HTTP or IPC.

## Requirements

### Requirement: port exposes Changes Mutate operations

The interface MUST declare asynchronous methods equivalent to the HTTP routes in the matching `api:routes-*` group:

- `saveChangeArtifact(name, filename, { content, originalHash, force? })`
- `validateChange(...)` — single step (`POST .../validate`)
- `validateChangeAll(name, { artifactId? })` — DAG batch (`POST .../validate-all`)
- `transitionChange(...)`, lifecycle posts, `patchChange(...)`
- `updateSpecDependencies(name, { specId, set | add | remove })` → `PATCH .../spec-dependencies`

### Requirement: port signatures are identical for HTTP and IPC adapters

Implementations (`adapter-remote-specd-data`, desktop IPC) MUST implement these methods without altering parameter or return types.

### Requirement: port failures surface as typed client errors

HTTP failures MUST be translated by `adapter-problem-json-errors` into errors the UI hooks can display.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`client:port-changes-mutate-validate-all`](../port-changes-mutate-validate-all/spec.md) — `validateChangeAll`
- [`client:dto-validate-batch-result`](../dto-validate-batch-result/spec.md) — batch DTO
- [`client:specd-data-port`](../specd-data-port/spec.md) — composed port
