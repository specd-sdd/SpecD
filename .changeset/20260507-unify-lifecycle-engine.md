---
    "@specd/core": minor
    "@specd/cli": patch
---

20260507 - unify-lifecycle-engine: Introduce a shared LifecycleEngine in @specd/core to centralize lifecycle interpretation, dependency-aware artifact status, blockers, routing, and next-action decisions across status, context, transitions, validation, and artifact guidance. This removes schema/DAG-aware lifecycle logic from Change, aligns CLI and agent-facing surfaces with one authority, and adds focused debug logging plus coverage around the new engine-backed behavior.

Specs affected:

- `core:change`
- `core:get-status`
- `core:compile-context`
- `core:transition-change`
- `core:lifecycle-engine`
- `core:validate-artifacts`
- `core:get-artifact-instruction`
- `cli:change-status`
- `cli:change-context`
- `cli:change-transition`
- `cli:change-validate`
- `cli:change-artifact-instruction`
