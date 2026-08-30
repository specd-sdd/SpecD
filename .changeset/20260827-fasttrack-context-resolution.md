---
    "@specd/skills": minor
    "@specd/plugin-agent-claude": minor
    "@specd/plugin-agent-codex": minor
    "@specd/plugin-agent-copilot": minor
    "@specd/plugin-agent-standard": minor
---

20260827 - fasttrack-context-resolution: Fast-track now discovers governing specs through graph coverage and compiled workspace context, preventing unsupported raw spec reads. The workflow is manual-only across all agent integrations, with Claude and Copilot also receiving native model-invocation disablement.

Specs affected:

- `skills:skill-templates-source`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
