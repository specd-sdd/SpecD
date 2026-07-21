---
'@specd/specd': patch
---

20260721 - remove-lifecycle-from-change-context: Remove lifecycle availability and blocking state from change context so change status is the single source of lifecycle information.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:compile-context`
- `cli:change-context`
