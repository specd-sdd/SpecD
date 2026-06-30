# Presenter Change

## Purpose

Maps kernel or graph results into the matching `dto-*` response for **Presenter Change**. Presenters are pure formatting at the HTTP boundary so handlers do not embed lifecycle or validation logic.

## Requirements

### Requirement: presenter maps entities to DTO fields deterministically

Given the same kernel or graph result, the presenter MUST produce the same DTO JSON shape, omitting optional properties when values are absent.

### Requirement: presenter does not encode business rules

The presenter MUST NOT decide lifecycle transitions, validation outcomes, or approval state — those belong in core use cases invoked via the SDK kernel surface.

### Requirement: historyEventDto maps type-specific ChangeEvent fields

`toChangeDetailDto` MUST map each kernel `ChangeEvent` to `ChangeHistoryEventDto` with ISO `at`, actor `by`, and all variant-specific properties needed by Studio (`ui:change-tab-events`). At minimum: `created` → `specIds`, `schemaName`, `schemaVersion`; `transitioned` → `from`, `to`; `invalidated` → `cause`, `message`, `affectedArtifacts`. Other variants (`spec-approved`, `signed-off`, `artifacts-synced`, etc.) MUST forward their domain fields without dropping them to type-only stubs.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
- [`api:dto-change`](../dto-change/spec.md) — wire shape
