---
'@specd/specd': patch
---

20260703 - fix-project-status-repository-wiring: Aligns the project status command and all directly affected core read/composition factories with the canonical repository wiring. Standardizes bootstrapping for ChangeRepository and SpecRepository by resolving schema-driven artifact-type behavior, metadata-path semantics, and spec existence check hooks through shared composition logic. This ensures that status-oriented reads observe consistent repository state and prevents false positives regarding artifact-drift, particularly on checklist task checkbox updates.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:get-project-summary`
- `core:list-workspaces`
- `core:list-changes`
- `core:list-drafts`
- `core:list-discarded`
- `core:get-status`
- `sdk:build-project-status-snapshot`
- `cli:project-status`
