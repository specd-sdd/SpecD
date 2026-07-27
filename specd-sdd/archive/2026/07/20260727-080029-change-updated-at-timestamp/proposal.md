# Proposal: change-updated-at-timestamp

## Motivation

Changes currently lack explicit `updatedAt` tracking in their domain entity and persisted manifest. This prevents client tools and API layers (such as UI hooks and HTTP status queries) from determining when a change was last modified or leveraging conditional caching (`ifModifiedSince` / revision timestamps). Adding `updatedAt` to `Change` provides deterministic revision tracking and improves performance in status queries.

## Current behaviour

`Change` entities and `manifest.json` files only persist `createdAt` and event histories. When clients query change status or request updates, there is no single top-level `updatedAt` field to check, forcing redundant processing or client-side recalculation. Legacy change manifests do not store an `updatedAt` field at all.

## Proposed solution

Implement `updatedAt` directly in `main` by adopting the design pattern demonstrated in the `feat/user-interface` reference branch (`../specd-worktrees/feat-user-interface`). All modifications will be executed exclusively on `main`:

- Extend the `Change` domain entity (`packages/core/src/domain/entities/change.ts`) with an `updatedAt` property, ensuring `updatedAt >= createdAt` and providing a `touch()` mutation helper.
- Update `manifest.json` schema (`packages/core/src/infrastructure/fs/manifest.ts`) and `FsChangeRepository` (`packages/core/src/infrastructure/fs/change-repository.ts`) to persist and load `updatedAt`.
- Provide backward compatibility in `FsChangeRepository` via `deriveManifestUpdatedAt` for legacy manifests missing `updatedAt` (deriving it as the maximum event timestamp or falling back to `createdAt`).
- Update `save-change-artifact` (`packages/core/src/application/use-cases/save-change-artifact.ts`) to advance `updatedAt` upon artifact saves.
- Update `GetStatus` use case (`packages/core/src/application/use-cases/get-status.ts`) to support client revision checking (`ifModifiedSince`) against `updatedAt.getTime()` with an HTTP-304-style short-circuit (`unchanged: true`, intentionally omitting full artifact/lifecycle projections).

## Specs affected

### New specs

- None

### Modified specs

- `core:change`: Add `updatedAt` property requirements, invariants (`updatedAt >= createdAt`), and timestamp mutation lifecycle (`touch()`).
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-manifest`: Add optional `updatedAt` field to `manifest.json` schema and serialization rules.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-change-repository`: Require `updatedAt` persistence and backward-compatible fallback derivation (`deriveManifestUpdatedAt`) for legacy manifests.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: Add `ifModifiedSince` / client revision comparison against change `updatedAt`, documenting the HTTP-304-style early return (`unchanged`) and exceptions to full status/refresh projections.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core`: `Change` entity (`change.ts`), `manifest.ts`, `FsChangeRepository` (`change-repository.ts`), `save-change-artifact.ts`, `get-status.ts`.
- Note: All changes target the main repository (`main`). The external worktree branch (`feat/user-interface`) is used purely as a read-only reference and will not be modified.

## Technical Context

Adopting the implementation pattern from `feat/user-interface` reference branch (`../specd-worktrees/feat-user-interface`):

- Verification in entity constructor ensures `updatedAt.getTime() >= createdAt.getTime()`.
- Legacy manifests missing `updatedAt` compute fallback timestamp dynamically during load (`deriveManifestUpdatedAt`).
- `save-change-artifact` touch logic ensures `updatedAt` advances cleanly on edits.
- `GetStatus.ifModifiedSince` is intentionally a 304-style short-circuit: when the client revision is current, return `unchanged: true` without re-evaluating full status (empty `artifactStatuses`, skipped refresh).

## Open questions

- None
