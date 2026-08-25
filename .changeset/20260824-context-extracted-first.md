---
'@specd/core': minor
---

20260824 - context-extracted-first: CompileContext now renders change-scoped specs from their merged delta view - extracted-first through the schema's metadataExtraction engine - in every display mode, falling back to canonical metadata only when no merged content is usable. Context warnings were aligned with actionable semantics: spurious new-spec metadata warnings and cache-miss regeneration noise are gone, lock optimizations never apply to specs under modification, and out-of-scope specs now distinguish missing-optimization from stale-optimization. dependsOn traversal handles non-persisted change specs structurally via manifest-first ordering and existence-checked registration.

Specs affected:

- `core:compile-context`
- `core:get-spec-context`
- `core:get-project-context`
