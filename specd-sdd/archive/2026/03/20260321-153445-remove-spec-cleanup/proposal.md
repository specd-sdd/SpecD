# Proposal: remove-spec-cleanup

## Motivation

When a spec is removed from a change via `change edit --remove-spec`, the specId is removed from the manifest but the scaffolded directories (`specs/<ws>/<path>/` and `deltas/<ws>/<path>/`) remain as orphans. This creates confusion and can cause issues if the specId is later re-added with stale content.

## Current behaviour

Running `change edit --remove-spec` removes the spec from the manifest but leaves orphan empty directories:

```bash
specd change create test --spec "core:core/generate-spec-metadata"
# Creates:
#   .specd/changes/.../specs/core/core/generate-spec-metadata/
#   .specd/changes/.../deltas/core/core/generate-spec-metadata/

specd change edit test --remove-spec "core:core/generate-spec-metadata"
# specId removed from manifest ✓
# directories remain on disk ✗
```

## Proposed solution

1. Add `unscaffold(specIds)` method to `ChangeRepository` port — removes the `specs/` and `deltas/` subtrees for the given specIds from the change directory
2. Call `unscaffold` from `EditChange.execute` after removing specIds — clean up directories atomically after manifest update
3. Empty directories are removed silently
4. If directories contain files, remove them too (user hasn't written anything meaningful yet — these are just scaffolded empty files)

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/edit-change`: Add call to `ChangeRepository.unscaffold()` after spec removal in `EditChange.execute`
- `core:core/change-repository-port`: Add `unscaffold(change, specIds)` method requirement to the port interface

## Impact

- **ChangeRepository port**: New `unscaffold` method added to interface
- **FsChangeRepository**: New implementation of `unscaffold` using `fs.rm` to remove directories
- **EditChange use case**: New call to `unscaffold` after `removeSpecIds` processing
- **No API breaking changes**: New method is additive only

## Open questions

_none_
