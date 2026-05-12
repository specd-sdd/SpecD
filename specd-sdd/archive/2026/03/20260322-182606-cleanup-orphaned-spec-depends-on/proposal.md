# Proposal: cleanup-orphaned-spec-depends-on

## Motivation

`Change.updateSpecIds()` replaces `_specIds` but does not clean up `_specDependsOn` entries whose keys are no longer in the new spec list. This leaves orphaned dependency entries that `CompileContext` may attempt to resolve, and that persist through save/load round-trips.

## Current behaviour

When a spec is removed from a change via `updateSpecIds()`, its `specDependsOn` entry (if any) survives. The orphaned entry:

- Persists in `manifest.json` after save
- Is loaded back into the entity on next `get()`
- May cause `CompileContext` to include unnecessary dependency specs during traversal

`syncArtifacts` already cleans up artifact files for removed specIds, but no equivalent cleanup exists for `specDependsOn`.

## Proposed solution

In `Change.updateSpecIds()`, after setting `_specIds`, iterate over `_specDependsOn` and delete any entry whose key is not in the new set of spec IDs. This is consistent with how `syncArtifacts` handles stale artifact files.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/change`: Add a requirement that `updateSpecIds` must remove orphaned `specDependsOn` entries for specs no longer in the updated list.

## Impact

- `Change` entity (`packages/core/src/domain/entities/change.ts`) — `updateSpecIds` method
- Tests in `packages/core/test/domain/entities/change.spec.ts`
- No API or external dependency changes

## Open questions

_(none)_
