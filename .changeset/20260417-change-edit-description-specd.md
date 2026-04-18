---
'@specd/specd': patch
---

20260417- - change-edit-description: Implements the --description option in the specd change edit command, which was documented in the spec but never implemented. Adds description field to EditChangeInput, updateDescription() method to the Change entity, and modifies EditChange.execute() to persist the description without invalidating the change.

Modified packages:

- @specd/cli
- @specd/core

Specs affected:

- `cli:cli/change-edit`
- `core:core/edit-change`
- `core:core/change`
