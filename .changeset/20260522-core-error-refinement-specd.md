---
'@specd/specd': patch
---

20260522 - core-error-refinement: Refine monorepo error handling so user-facing failures are reported through typed SpecdError hierarchies instead of generic Error throws. This adds package-level error bases for core, cli, code-graph, and skills, updates archive and dependency workflows to emit machine-readable errors, and introduces a global error-handling conventions spec to formalize the contract.

Modified packages:

- @specd/core
- @specd/code-graph
- @specd/cli
- @specd/skills

Specs affected:

- `core:archive-change`
- `core:update-spec-deps`
- `default:_global/conventions`
- `default:_global/error-handling-conventions`
- `code-graph:symbol-model`
- `cli:entrypoint`
- `skills:skill`
