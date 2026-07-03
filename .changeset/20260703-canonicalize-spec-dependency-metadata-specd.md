---
'@specd/specd': patch
---

20260703 - canonicalize-spec-dependency-metadata: Canonicalize persisted spec dependency metadata by projecting dependsOn from spec-lock into metadata.json, keeping context compilation and validation aligned with that canonical view. The implementation hardens the repository boundary around sidecars, preserves change snapshot seeding semantics, and adds validation plus regression coverage for stale or mismatched metadata across context, save, and archive flows.

Modified packages:

- @specd/core

Specs affected:

- `core:spec-metadata`
- `core:spec-lock`
- `core:get-spec-context`
- `core:get-project-context`
- `core:compile-context`
- `core:validate-specs`
- `core:create-change`
- `core:edit-change`
- `core:spec-repository-port`
- `core:generate-metadata`
- `core:save-spec-metadata`
