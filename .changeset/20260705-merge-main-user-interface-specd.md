---
'@specd/specd': patch
---

20260705 - merge-main-user-interface: Merge local main into feat-user-interface and realign the branch with the current mainline behavior for project-status, context compilation, repository wiring, and spec persistence semantics. The change preserves branch-specific user-interface work while adopting main's conventions and absorbed upstream spec behavior, then revalidates artifacts, implementation links, and verification flow for archiving.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:compile-context`
- `core:edit-change`
- `core:get-project-context`
- `core:get-project-summary`
- `core:get-spec-context`
- `core:get-status`
- `core:list-changes`
- `core:list-discarded`
- `core:list-drafts`
- `core:list-workspaces`
- `core:spec-repository-port`
- `core:validate-specs`
- `sdk:build-project-status-snapshot`
- `cli:project-status`
- `core:change-repository-port`
- `core:storage`
