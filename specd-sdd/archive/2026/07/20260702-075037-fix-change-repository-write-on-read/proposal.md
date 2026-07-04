# Proposal: fix-change-repository-write-on-read

## Motivation

Ordinary repository read operations (`get`, `list`, `getDraft`, etc.) should be pure query operations. Modifying the change manifest and persisting lifecycle invalidations as a side effect of a read makes the system fragile, hard to predict, and breaks layer boundaries (e.g. read-only commands like `project status` performing disk writes).

## Current behaviour

Currently, `FsChangeRepository.get()` loads the change manifest and syncs artifacts against the active schema, and auto-invalidates the change (writing to disk) if any validated files have drifted. This write-on-read happens during any read-only workflow action, leading to unexpected disk writes and potential state desynchronization.

## Proposed solution

- Retain the auto-invalidation and sync persistence logic within `FsChangeRepository.get()` (and other read paths) to keep the persistence lifecycle fully encapsulated in the FS adapter, ensuring use cases remain agnostic of the manifest structure.
- Introduce a strict **initialization guard**: `FsChangeRepository` must skip all drift detection, auto-invalidation, and sync operations (and thus never write to disk) if the repository is not fully initialized (i.e., when `artifactTypes` are not resolved).
- Ensure that **all write operations**, including auto-invalidation and sync writes performed during reads, are serialized using the repository's change lock (`_withChangeLock`) to prevent concurrent write hazards and guarantee consistency.
- This ensures that read operations performed by partially initialized repositories (such as background tools or command compositions lacking schema context) are completely side-effect free, preventing false drift invalidations from being written to disk, while fully composed repository reads remain consistent and concurrency-safe.

## Specs affected

### New specs

(None)

### Modified specs

- `core:change-repository-port`: Revise the `get` contract and `Auto-invalidation on get when artifact files drift` requirements to clarify that drift detection and auto-invalidation writes are only performed when the repository is fully initialized with resolved artifact types.
  - Depends on (added): none
  - Depends on (removed): none
- `core:storage`: Clarify that load-time status derivation and drift detection invariants are only enforced when artifact types are resolved.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `FsChangeRepository` (`packages/core/src/infrastructure/fs/change-repository.ts`): Remove direct `_writeManifestAtomic` calls inside `_manifestToChange` for both sync normalization and drift invalidation.
- `change-repository.spec.ts`: Update tests that verify auto-invalidation and sync-persisting on `get()` to expect that the manifest on disk is not modified by `get()`, but is correctly updated when `mutate()` or `save()` is used.

## Technical context

- Decoupling read-time side effects is critical to prevent "liar context" and unexpected write activity during status commands.
- Simply stopping read-time writes keeps the in-memory representation accurate while deferring the physical write to the next legitimate mutation command.

## Open questions

(None)
