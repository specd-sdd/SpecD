# Presenter Project

## Purpose

Maps kernel or graph results into the matching `dto-*` response for **Presenter Project**. Presenters are pure formatting at the HTTP boundary so handlers do not embed lifecycle or validation logic.

## Requirements

### Requirement: presenter maps entities to DTO fields deterministically

Given the same kernel or graph result, the presenter MUST produce the same DTO JSON shape, omitting optional properties when values are absent.

### Requirement: presenter does not encode business rules

The presenter MUST NOT decide lifecycle transitions, validation outcomes, or approval state — those belong in core use cases invoked via the SDK kernel surface.

### Requirement: project status presenter maps graph health diagnostics

When mapping `buildProjectStatusSnapshot.graphHealth`, the project presenter MUST populate the `graph` slice on [`api:dto-project-status`](../dto-project-status/spec.md) with the same diagnostic fields and `warnings[]` derivation rules as `toGraphStatusDto` in [`api:presenter-graph`](../presenter-graph/spec.md).

Count fields (`symbolCount`, `specCount`, `indexed`) MUST continue to reflect graph statistics when graph health is included.

### Requirement: project status presentation uses the canonical client mapper

The API project-status presenter MUST delegate final DTO construction to the pure mapper exported by `@specd/client`.

API-specific code MAY assemble structural inputs from SDK results and server auth state, but MUST NOT maintain a divergent project-status field mapping.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`api:dto-project`](../dto-project/spec.md) — project wire shape
- [`api:dto-project-status`](../dto-project-status/spec.md) — project-status wire shape
- [`client:dto-project-status`](../../client/dto-project-status/spec.md) — canonical status DTO and pure mapper shared with IPC
