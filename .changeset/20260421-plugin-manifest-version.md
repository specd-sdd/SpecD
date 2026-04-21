---
    "@specd/plugin-manager": patch
    "@specd/plugin-agent-claude": patch
    "@specd/plugin-agent-copilot": patch
    "@specd/plugin-agent-codex": patch
---

20260421 - plugin-manifest-version: Add version field to plugin manifests, read version from manifest in plugin factories, remove hardcoded versions from plugin classes, add sync script to build pipeline

Specs affected:

- `plugin-manager:plugin-loader`
- `plugin-manager:specd-plugin-type`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
