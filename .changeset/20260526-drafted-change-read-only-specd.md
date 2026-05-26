---
'@specd/specd': patch
---

20260526 - drafted-change-read-only: Enforces read-only semantics for drafted changes across @specd/core and the CLI by splitting active vs draft storage access. Active get/mutate no longer resolve drafts; drafted changes are accessed via getDraft and exposed through read-only views, while restore/discard are the only allowlisted mutations. Updates CLI commands and test coverage to reflect the new drafted/discarded read models and error handling.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:change`
- `core:change-repository-port`
- `core:restore-change`
- `core:discard-change`
- `core:drafted-change-view`
- `core:drafted-change-read-only-error`
- `core:get-draft`
- `core:list-drafts`
- `core:get-status`
- `core:draft-change`
- `cli:drafts-show`
- `cli:drafts-list`
- `cli:change-draft`
- `cli:change-status`
- `cli:project-status`
- `cli:project-dashboard`
- `core:get-discarded`
- `cli:discarded-show`
- `core:discarded-change-view`
- `core:list-discarded`
- `cli:discarded-list`
- `core:read-only-change-view`
