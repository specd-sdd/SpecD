---
'@specd/specd': patch
---

20260418 - fix-spec-overlap-conflict: Fixes corrupted manifest error when reading changes with `spec-overlap-conflict` invalidation cause. The `INVALIDATED_CAUSES` array in `change-repository.ts` was missing the `'spec-overlap-conflict'` value, causing `change list` and other commands to fail with "Corrupted manifest: invalid invalidated cause in manifest". Also updates the `core:core/change` spec documentation to include `spec-overlap-conflict` in the list of valid invalidation causes.

Modified packages:

- @specd/core

Specs affected:

- `core:core/change`
