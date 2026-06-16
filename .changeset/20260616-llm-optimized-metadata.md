---
    "@specd/skills": minor
    "@specd/plugin-manager": minor
    "@specd/plugin-agent-claude": minor
    "@specd/plugin-agent-copilot": minor
    "@specd/plugin-agent-codex": minor
    "@specd/plugin-agent-standard": minor
    "@specd/cli": minor
    "@specd/core": minor
---

20260616 - llm-optimized-metadata: Introduced support for LLM-optimized metadata fields (optimizedDescription and optimizedContext) in the CLI context commands, list commands, and project status output. Refactored the skills repository and templates directory structure to support specialized optimizer agents (specd-spec-context-optimizer and specd-project-context-optimizer) and platform-specific categorized installation. Simplified all agent plugins by removing redundant capability helpers and adding direct capability literal configurations.

Specs affected:

- `skills:workflow-automation`
- `skills:agents`
- `skills:skill`
- `skills:skill-repository`
- `skills:skill-repository-infra`
- `skills:skill-templates-source`
- `plugin-manager:agent-plugin-type`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
- `cli:spec-context`
- `core:compile-context`
- `core:get-project-context`
- `cli:project-context`
- `cli:spec-list`
- `cli:project-status`
- `cli:change-context`
