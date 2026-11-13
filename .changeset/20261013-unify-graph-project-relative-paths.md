---
    "@specd/cli": minor
    "@specd/sdk": minor
    "@specd/code-graph": minor
---

20261013 - unify-graph-project-relative-paths: Unifies code-graph results to consistently expose projectRelativePath across symbols, files, documents, hotspots, and impact analyses while eliminating legacy configRelativePath, displayPath, and displayTargets. Upgrades SQLite store schema to version 14 with zero-join denormalized paths backed by ADR-0028. Introduces host-agnostic SDK orchestrators in @specd/sdk to decouple presentation from graph operations.

Specs affected:

- `cli:graph-search`
- `cli:graph-hotspots`
- `cli:graph-impact`
- `sdk:run-graph-search`
- `sdk:run-graph-hotspots`
- `sdk:run-graph-impact`
- `code-graph:symbol-model`
- `code-graph:document-model`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
