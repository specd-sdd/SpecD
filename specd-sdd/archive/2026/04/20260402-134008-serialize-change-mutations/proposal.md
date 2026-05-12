# Proposal: serialize-change-mutations

## Motivation

Concurrent CLI or skill operations on the same change can lose persisted state because they mutate stale in-memory snapshots and the last manifest write wins. This is now surfacing in real workflows where agents validate or perform other change operations in parallel.

## Current behaviour

Existing change-mutating use cases commonly follow the pattern `ChangeRepository.get(name) -> mutate Change -> ChangeRepository.save(change)`. `FsChangeRepository.save()` writes the full manifest atomically, but it does not serialize the full read-modify-write section, so concurrent processes can overwrite each other's updates without detecting a conflict.

## Proposed solution

Introduce a repository-level serialized mutation API for persisted `Change` state, so use cases can express "load, mutate, and persist this change safely" without knowing about manifests or lock files. Apply that API consistently across all use cases that modify an existing change, rather than fixing `ValidateArtifacts` in isolation.

## Specs affected

### New specs

- none

### Modified specs

- `core:core/change-repository-port`: extend the port contract with a serialized mutation operation for existing changes, define its concurrency semantics, and clarify how it differs from snapshot reads via `get()`.
  - Depends on (added): none
- `core:core/validate-artifacts`: change validation persistence to use the repository mutation path so concurrent validations on the same change do not lose `validatedHash`, invalidation, or dependency updates.
  - Depends on (added): none
- `core:core/edit-change`: move spec-scope edits for an existing change onto the serialized mutation path so concurrent scope changes cannot overwrite each other.
  - Depends on (added): none
- `core:core/draft-change`: persist drafting through the serialized mutation path so shelving a change cannot race with other mutations of the same change.
  - Depends on (added): none
- `core:core/restore-change`: persist restoration through the serialized mutation path so bringing a draft back cannot race with other mutations of the same change.
  - Depends on (added): none
- `core:core/discard-change`: persist discard events through the serialized mutation path so terminal discard operations cannot lose concurrent history mutations.
  - Depends on (added): none
- `core:core/approve-spec`: persist spec approvals through the serialized mutation path so approval state and recorded artifact hashes cannot be overwritten by concurrent change mutations.
  - Depends on (added): none
- `core:core/approve-signoff`: persist signoff approvals through the serialized mutation path so recorded signoff state and artifact hashes cannot be overwritten by concurrent change mutations.
  - Depends on (added): none
- `core:core/skip-artifact`: persist explicit artifact skips through the serialized mutation path so skip decisions cannot be lost when other processes mutate the same change.
  - Depends on (added): none
- `core:core/transition-change`: persist lifecycle transitions through the serialized mutation path so state changes and any related resets are serialized with other mutations on the same change.
  - Depends on (added): none
- `core:core/update-spec-deps`: persist per-spec dependency updates through the serialized mutation path so `specDependsOn` entries cannot be lost during concurrent change activity.
  - Depends on (added): none
- `core:core/archive-change`: serialize the mutation of the active change during the archive flow, especially the transition into `archiving`, so archive startup cannot race with other in-flight change mutations.
  - Depends on (added): none

## Impact

- `packages/core/src/application/ports/change-repository.ts`
- `packages/core/src/infrastructure/fs/change-repository.ts`
- `packages/core/src/composition/change-repository.ts`
- `packages/core/src/application/use-cases/validate-artifacts.ts`
- `packages/core/src/application/use-cases/edit-change.ts`
- `packages/core/src/application/use-cases/draft-change.ts`
- `packages/core/src/application/use-cases/restore-change.ts`
- `packages/core/src/application/use-cases/discard-change.ts`
- `packages/core/src/application/use-cases/approve-spec.ts`
- `packages/core/src/application/use-cases/approve-signoff.ts`
- `packages/core/src/application/use-cases/skip-artifact.ts`
- `packages/core/src/application/use-cases/transition-change.ts`
- `packages/core/src/application/use-cases/update-spec-deps.ts`
- `packages/core/src/application/use-cases/archive-change.ts`
- unit tests for the affected use cases and repository port behavior
- integration tests for concurrent mutation behavior in `FsChangeRepository`

## Technical context

- The agreed architectural direction is to solve this in `ChangeRepository`, not in the CLI.
- A lock around manifest writing alone is not sufficient, because the stale snapshot problem happens before `save()`.
- The preferred API direction is a repository mutation operation such as `mutate(name, fn)` rather than exposing a lower-level `withLock(...)` primitive to use cases.
- `get()` remains a snapshot read; the new mutation API provides a serialized read-modify-write section for one persisted change.
- The initial bug report came from parallel artifact validation, but the solution scope is intentionally broader: every use case that mutates an existing change should adopt the same safe persistence pattern.
- Exploration and graph search both identified existing change-mutating use cases beyond `ValidateArtifacts`, especially `EditChange`, `DraftChange`, `RestoreChange`, `DiscardChange`, `ApproveSpec`, `ApproveSignoff`, `SkipArtifact`, `TransitionChange`, and `UpdateSpecDeps`.
- A direct code search over `packages/core/src/application/use-cases` confirmed one additional candidate: `ArchiveChange`, which mutates and saves an already-existing change before the archive completes.
- The same search also showed `CreateChange`, but that case is intentionally excluded because it creates a new change rather than mutating an existing persisted one.
- During exploration, the code graph itself produced a Ladybug lock when queried in parallel, reinforcing the practical lesson that shared persisted state needs explicit coordination even when individual writes are atomic.

## Open questions

- None at proposal stage.
