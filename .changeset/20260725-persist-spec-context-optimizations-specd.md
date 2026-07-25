---
'@specd/specd': patch
---

20260725 - persist-spec-context-optimizations: Persist LLM spec optimizations and dependency state in spec-lock, project them into generated metadata, and detect lock-aware staleness.

Modified packages:

- @specd/core
- @specd/cli
- @specd/skills
- @specd/code-graph

Specs affected:

- `core:spec-lock`
- `core:spec-repository-port`
- `core:spec-metadata`
- `core:generate-metadata`
- `core:update-spec-metadata`
- `core:validate-specs`
- `core:compile-context`
- `core:get-spec-context`
- `cli:spec-update-metadata`
- `cli:spec-generate-metadata`
- `cli:spec-metadata`
- `core:spec-optimization`
- `cli:spec-deps`
- `core:update-persisted-spec-deps`
- `cli:spec-optimizations`
- `cli:spec-write-metadata`
- `core:invalidate-spec-metadata`
- `cli:spec-invalidate-metadata`
- `core:update-persisted-spec-implementation`
- `cli:spec-implementation`
- `core:get-persisted-spec-deps`
- `core:get-persisted-spec-implementation`
- `core:get-persisted-spec-optimizations`
- `core:update-persisted-spec-optimizations`
- `core:get-spec-metadata`
- `core:archive-change`
- `core:save-spec-metadata`
- `core:kernel`
- `core:kernel-builder`
- `core:composition`
- `core:get-project-context`
- `core:list-specs`
- `core:fs-spec-repository`
- `core:regenerate-spec-metadata`
- `sdk:composition`
- `cli:spec-list`
- `skills:agents`
- `core:materialize-spec-metadata`
- `core:config-writer-port`
- `cli:project-init`
- `core:persist-spec-metadata`
- `core:initialize-persisted-spec-state`
- `cli:spec-init`
- `core:search-specs`
- `core:project-metadata`
- `core:update-project-metadata`
- `skills:skill-templates-source`
- `code-graph:indexer`
- `core:get-persisted-spec-schema`
- `core:update-persisted-spec-schema`
- `cli:spec-schema`
- `core:validation-result-cache-port`
