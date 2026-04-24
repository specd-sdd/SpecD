---
'@specd/specd': patch
---

20260424 - refactor-agent-plugin-config: Replace projectRoot: string with SpecdConfig in AgentPlugin and PluginContext, rename InstallOptions/InstallResult to agent-specific names, and inject built-in variables automatically when resolving skill bundles.

Modified packages:

- @specd/plugin-manager
- @specd/skills
- @specd/plugin-agent-claude
- @specd/plugin-agent-copilot
- @specd/plugin-agent-codex

Specs affected:

- `plugin-manager:specd-plugin-type`
- `plugin-manager:agent-plugin-type`
- `plugin-manager:install-plugin-use-case`
- `skills:resolve-bundle`
- `skills:skill-repository-port`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-manager:uninstall-plugin-use-case`
- `plugin-manager:update-plugin-use-case`
- `plugin-manager:plugin-loader`
