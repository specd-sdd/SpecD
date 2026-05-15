---
    "@specd/core": minor
    "@specd/cli": minor
---

20260515 - refine-artifact-invalidation-scope: Introduce configurable invalidation policies (none, surgical, downstream, global) that control how artifact drift and manual invalidation reopen the artifact DAG, replacing the previous global-everything behavior. Add a manual changes invalidate command with policy-aware target selection, an approval/signoff force guard, and drift-aware display state (complete-with-drift) in status surfaces. Extend the change manifest with invalidationPolicy and per-file hasDrift fields while keeping LifecycleEngine and canonical lifecycle states unchanged.

Specs affected:

- `core:change`
- `core:validate-artifacts`
- `core:lifecycle-engine`
- `core:get-status`
- `cli:change-status`
- `core:invalidate-change`
- `cli:change-invalidate`
- `core:config`
- `core:change-manifest`
- `core:transition-change`
- `cli:change-artifacts`
- `core:edit-change`
- `core:create-change`
