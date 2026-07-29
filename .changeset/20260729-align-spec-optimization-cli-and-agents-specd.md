---
'@specd/specd': minor
---

20260729 - align-spec-optimization-cli-and-agents: Aligns the persisted spec-optimization CLI, Core mutation semantics, and optimizer workflow templates around one executable contract. Adds direct and compatibility set/clear forms, strict runtime validation, durable field deletion, authoritative llmOptimizedContext gating, and clarified spec-reading guidance, with regression tests and documentation updates.

Modified packages:

- @specd/cli
- @specd/skills
- @specd/core

Specs affected:

- `cli:spec-optimizations`
- `skills:agents`
- `skills:skill-templates-source`
- `skills:workflow-automation`
- `core:update-persisted-spec-optimizations`
