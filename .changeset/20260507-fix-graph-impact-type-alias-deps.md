---
    "@specd/code-graph": patch
    "@specd/cli": patch
    "@specd/skills": patch
---

20260507 - fix-graph-impact-type-alias-deps: Fix missing impact edges when symbols are referenced through type aliases and registry indirection (e.g. ArtifactParserRegistry -> ArtifactParser). Adds graph-derivation fingerprint for staleness detection, config-relative file selector resolution, and removes the confusing --changes flag from graph impact. Updates 8 specs across code-graph, CLI, and skills packages.

Specs affected:

- `code-graph:traversal`
- `code-graph:symbol-model`
- `code-graph:graph-store`
- `code-graph:indexer`
- `code-graph:staleness-detection`
- `cli:graph-impact`
- `code-graph:workspace-integration`
- `skills:skill-templates-source`
