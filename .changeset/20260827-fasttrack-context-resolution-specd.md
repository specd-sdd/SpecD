---
'@specd/specd': minor
---

20260827 - fasttrack-context-resolution: Fast-track now discovers governing specs through graph coverage and compiled workspace context, preventing unsupported raw spec reads. The workflow is manual-only across all agent integrations, with Claude and Copilot also receiving native model-invocation disablement.

Modified packages:

- @specd/skills
- @specd/plugin-agent-claude
- @specd/plugin-agent-codex
- @specd/plugin-agent-copilot
- @specd/plugin-agent-standard

Specs affected:

- `skills:skill-templates-source`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
