# Proposal: prevent-orphan-spec-locks

## Motivation

Raw filesystem enumeration found orphan `spec-lock.json` sidecar files in spec directories where no canonical `spec.md` artifact existed. This happens when nonexistent or mistyped spec IDs are recorded in implementation links and subsequently published during change archiving, or when empty spec directories are created with only lock sidecars. A multi-layered defense-in-depth and self-healing mechanism is required to prevent and clean up orphan spec locks across the lifecycle.

## Current behaviour

Currently:

1. `UpdateImplementationTracking` verifies that target implementation files exist on disk, but does not validate whether the provided `specId` exists in the canonical `SpecRepository` or is declared in `change.specIds`.
2. When specs are removed from a change in `EditChange`, dangling implementation links referencing the removed specs remain in `manifest.json`.
3. `RefreshImplementationTracking` sweeps for removed files on disk, but does not sweep for dangling links pointing to nonexistent or untracked specs.
4. `ArchiveChange` blindly includes all `specId` keys from `implementationBySpecId` in the publication plan, generating persisted `spec-lock.json` sidecars even for nonexistent specs.
5. `FsSpecRepository.publish` allows creating a brand-new spec directory containing only `spec-lock.json` when `publication.artifacts` is empty.

## Proposed solution

Implement defense-in-depth prevention and self-healing:

1. **Input validation**: Validate `specId` in `UpdateImplementationTracking` upon addition (`action: 'add'`). Reject unknown spec IDs with `SpecNotFoundError`.
2. **Self-healing sweep**: Add `_specSweep` to `RefreshImplementationTracking` to prune dangling implementation links referencing specs not in `change.specIds` and not found in the workspace `SpecRepository`.
3. **Auto-refresh on scope edit**: In `EditChange`, trigger implementation tracking refresh when `specIds` change.
4. **Safe archive publication**: In `ArchiveChange._prepareArchivePlan`, safely discard nonexistent spec publication candidates.
5. **Repository guard**: In `FsSpecRepository.publish`, throw `SpecPublicationError` when attempting to publish a new spec directory if `publication.artifacts` is empty.

## Specs affected

### New specs

(none)

### Modified specs

- `core:update-implementation-tracking`: Validate `specId` at link addition against change `specIds` and canonical `SpecRepository`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:refresh-implementation-tracking`: Prune dangling implementation links pointing to nonexistent specs not declared in `change.specIds`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:edit-change`: Trigger implementation tracking refresh when `specIds` are modified.
  - Depends on (added): none
  - Depends on (removed): none
- `core:archive-change`: Safely discard nonexistent spec publication candidates without failing or creating orphan sidecars.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-spec-repository`: Reject publishing a new spec when publication artifacts list is empty.
  - Depends on (added): none
  - Depends on (removed): none
- `core:spec-lock`: Clarify persisted lock sidecar lifecycle constraints: persisted state cannot create lock-only standalone spec directories.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core` application use cases (`UpdateImplementationTracking`, `RefreshImplementationTracking`, `EditChange`, `ArchiveChange`).
- `@specd/core` infrastructure repository (`FsSpecRepository`).
- `@specd/core` composition layer (`CompositionResolver` and use-case dependency factories).

## Technical context

- `UpdateImplementationTracking` and `RefreshImplementationTracking` receive workspace `SpecRepository` map from composition wiring.
- If a spec ID is not in `change.specIds` and not found in `SpecRepository.get()`, `UpdateImplementationTracking` throws `SpecNotFoundError`.
- `RefreshImplementationTracking._specSweep` prunes dangling links from `change.implementationLinks` idempotently.
- `EditChange` invokes `RefreshImplementationTracking` upon `specIds` modification.
- `ArchiveChange` discards nonexistent specs from the publication map.
- `FsSpecRepository.publish` checks `!specDirExists && publication.artifacts.length === 0` and throws `SpecPublicationError`.

## Open questions

(none)
