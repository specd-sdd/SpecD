---
'@specd/specd': patch
---

20260727 - agent-plugin-prompt-injection: Inject standardized specd agent instruction prompts and native hooks during agent plugin installation

Modified packages:

- @specd/plugin-manager
- @specd/plugin-agent-claude
- @specd/plugin-agent-copilot
- @specd/plugin-agent-codex
- @specd/plugin-agent-standard
- @specd/skills

Specs affected:

- `plugin-manager:install-plugin-use-case`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-standard:plugin-agent`
- `skills:agent-instruction-template`
