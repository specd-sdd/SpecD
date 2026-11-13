---
'@specd/specd': minor
---

20261113 - support-commas-in-names: CLI list options split their values on commas, so a file path or spec id containing a comma becomes two names that do not exist. Names must survive intact: lists carry whole names and every host passes arrays to the use cases. Also hardens spec ID handling in dependency commands: IDs are really validated (empty or malformed values are rejected), changes deps gains --clear, and an invalid persisted spec-lock fails with an actionable error that the CLI can repair.

Modified packages:

- @specd/core
- @specd/cli
- @specd/skills

Specs affected:

- `core:update-implementation-tracking`
- `cli:change-implementation`
- `core:edit-change`
- `cli:change-edit`
- `core:spec-id-format`
- `core:update-spec-deps`
- `cli:change-deps`
- `core:update-persisted-spec-deps`
- `cli:spec-deps`
- `core:spec-lock`
- `core:workspace`
- `core:create-change`
- `cli:graph-index`
- `skills:workflow-automation`
- `core:generate-metadata`
- `core:validate-specs`
- `core:preview-spec`
- `core:config`
- `core:get-persisted-spec-deps`
- `core:get-persisted-spec-implementation`
- `core:get-persisted-spec-optimizations`
- `core:get-persisted-spec-schema`
- `core:update-persisted-spec-implementation`
- `core:update-persisted-spec-optimizations`
- `core:update-persisted-spec-schema`
- `core:spec-metadata`
- `core:config-loader`
- `cli:change-create`
- `cli:project-init`
- `core:spec-repository-port`
- `core:archived-change-index-entry`
