# Specd Data Port

## Purpose

`@specd/ui` must never import `@specd/core`. `SpecdDataPort` is the single aggregated interface the IDE uses for project, change, workspace spec, graph, and remote log data, implemented by HTTP remote, in-memory fakes, or desktop IPC.

## Requirements

### Requirement: SpecdDataPort aggregates all port method groups

The interface MUST compose `port-project`, `port-changes-collection`, `port-changes-read`, `port-changes-mutate`, `port-workspaces-specs`, `port-graph`, `port-archived-changes`, and `port-studio-panel`.

The `port-studio-panel` contribution is limited to remote log readback and debug trace writes. User-visible Output/Problems session buffers are local UI state and MUST NOT be modeled as remote `SpecdDataPort` methods.

### Requirement: multiple adapters implement the same port interface

Production implementations include `adapter-remote-specd-data`, `adapter-memory-specd-data`, and desktop IPC local; they MUST expose identical method signatures.

## Constraints

- `@specd/ui` and `@specd/client` MUST NOT import `@specd/core` or `@specd/sdk` for kernel bootstrap.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`client:port-studio-panel`](../port-studio-panel/spec.md) — remote log I/O
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
