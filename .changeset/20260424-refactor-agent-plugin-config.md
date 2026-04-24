---
    "@specd/plugin-manager": patch
    "@specd/skills": patch
    "@specd/plugin-agent-claude": patch
    "@specd/plugin-agent-copilot": patch
    "@specd/plugin-agent-codex": patch
---

20260424 - refactor-agent-plugin-config: Replace projectRoot: string with SpecdConfig in AgentPlugin and PluginContext, rename InstallOptions/InstallResult to agent-specific names, and inject built-in variables automatically when resolving skill bundles.

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
