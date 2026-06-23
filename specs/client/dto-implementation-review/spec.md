# Dto Implementation Review

## Purpose

Client-side type for **Dto Implementation Review**, kept in parity with [`api:dto-implementation-review`](../../api/dto-implementation-review/spec.md) so remote and embedded Studio render the same JSON the API emits for `getImplementationReview`.

## Requirements

### Requirement: client DTO matches API wire shape

Field names, optional/required semantics, and nesting MUST match the paired `api:dto-implementation-review` spec. The client MUST NOT invent alternate property names.

### Requirement: types live in packages/client/src/dto/implementation-tracking.ts

`ImplementationReviewDto`, `ImplementationTrackingDto`, `ImplementationLinkDto`, and `TrackedImplementationFileDto` MUST be exported from `@specd/client` and re-exported via `dto/index.ts`.

### Requirement: port-changes-read uses ImplementationReviewDto

`getImplementationReview(name)` MUST return `Promise<ImplementationReviewDto>`, not `Record<string, unknown>`.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — client boundaries
- [`api:dto-implementation-review`](../../api/dto-implementation-review/spec.md) — mirror API DTO
