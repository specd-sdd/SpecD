---
    "@specd/core": minor
    "@specd/cli": minor
---

20260427 - schema-artifact-hastasks: Introduced an explicit hasTasks boolean field to artifact definitions in the schema as a master switch for task tracking. Implemented semantic validation at schema load and defensive runtime checks in TransitionChange to ensure requiresTaskCompletion consistency, while providing default markdown checkbox patterns when enabled.

Specs affected:

- `core:core/schema-format`
- `cli:cli/change-status`
- `core:core/transition-change`
