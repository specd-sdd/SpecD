---
    "@specd/core": patch
    "@specd/cli": patch
    "@specd/skills": patch
    "@specd/code-graph": patch
---

20260522 - implementation-file-tracking: Implement automated implementation file tracking in changes and explicit symbol-to-spec linking materialized in spec-lock sidecars.

Specs affected:

- `core:change`
- `core:change-manifest`
- `core:spec-metadata`
- `core:archive-change`
- `core:vcs-adapter`
- `cli:change-status`
- `core:spec-lock`
- `cli:change-implementation`
- `skills:skill-templates-source`
- `skills:workflow-automation`
- `core:implementation-detector-port`
- `code-graph:symbol-model`
- `core:vcs-adapter-port`
- `core:vcs-implementation-detector`
- `core:get-status`
- `core:compile-context`
- `core:transition-change`
- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
- `code-graph:graph-store`
- `code-graph:traversal`
- `code-graph:composition`
- `cli:graph-impact`
- `code-graph:indexer`
