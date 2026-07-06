---
'@specd/specd': patch
---

20260706 - decouple-composition-factories: Normalize @specd/core composition factories around canonical createX(deps) and convenience createX(config, options?) entry points backed by a shared CompositionResolver. Make the kernel and kernel builder pure orchestration over that same resolver path, remove core-owned graph-store extensibility, and align compile-context, get-project-context, and project-status graph behavior with the merged specs.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:composition`
- `core:kernel`
- `default:_global/architecture`
- `core:kernel-builder`
- `core:create-change`
- `core:get-status`
- `core:transition-change`
- `core:draft-change`
- `core:restore-change`
- `core:discard-change`
- `core:archive-change`
- `core:composition-resolver`
- `core:validate-artifacts`
- `core:compile-context`
- `core:list-changes`
- `core:list-drafts`
- `core:list-discarded`
- `core:edit-change`
- `core:skip-artifact`
- `core:update-spec-deps`
- `core:list-archived`
- `core:get-archived-change`
- `core:run-step-hooks`
- `core:get-hook-instructions`
- `core:get-artifact-instruction`
- `core:approve-spec`
- `core:approve-signoff`
- `core:list-specs`
- `core:get-spec`
- `core:save-spec-metadata`
- `core:invalidate-spec-metadata`
- `core:get-active-schema`
- `core:validate-specs`
- `core:generate-metadata`
- `core:get-spec-context`
- `core:list-workspaces`
- `core:get-project-context`
- `core:get-config`
- `core:project-metadata`
- `core:update-project-metadata`
- `core:resolve-schema`
- `core:spec-overlap`
- `core:get-draft`
- `core:get-discarded`
- `core:invalidate-change`
- `core:search-specs`
- `core:preview-spec`
- `core:validate-schema`
- `core:get-spec-outline`
- `core:update-implementation-tracking`
- `core:refresh-implementation-tracking`
- `core:get-implementation-review`
- `core:update-spec-metadata`
- `core:get-project-summary`
- `default:_global/docs`
- `cli:change-implementation`
- `sdk:build-project-status-snapshot`
