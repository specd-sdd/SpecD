# Port Graph

## Purpose

TypeScript surface for **Port Graph** on `SpecdDataPort`, mirroring the HTTP routes in the paired `api:routes-*` group. UI hooks call these methods; adapters implement them over HTTP or IPC.

## Requirements

### Requirement: port exposes Graph operations

The interface MUST declare asynchronous methods equivalent to the HTTP routes in the matching `api:routes-*` group:

- `getGraphStatus()`, `indexGraph()`, `searchGraph(query)`, `getImpact(query)`, `getHotspots()`, spec/change graph views

`indexGraph({ force? })` MUST mirror `POST /v1/graph/index` and return the indexing summary DTO rather than a graph-status DTO.

`searchGraph(query)` MUST expose the full graph-search query surface used by Studio:

- `q`
- `workspace`
- `kinds`
- `filePattern`
- `excludePaths`
- `excludeWorkspaces`
- `symbols`
- `specs`
- `limit`

`getImpact(query)` MUST forward `depth` as part of the graph impact selector.

`getImpact(query)` MUST support `symbol`, `file`, or `spec` as the graph impact selector.

### Requirement: port signatures are identical for HTTP and IPC adapters

Implementations (`adapter-remote-specd-data`, desktop IPC) MUST implement these methods without altering parameter or return types.

### Requirement: port failures surface as typed client errors

HTTP failures MUST be translated by `adapter-problem-json-errors` into errors the UI hooks can display.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`client:specd-data-port`](../specd-data-port/spec.md) — composed port
