---
    "@specd/cli": minor
    "@specd/core": minor
    "@specd/plugin-agent-claude": minor
    "@specd/plugin-agent-copilot": minor
    "@specd/plugin-agent-codex": minor
    "@specd/plugin-manager": minor
    "@specd/skills": minor
---

20260418 - plugin-system-phase-1: Phase 1 introduces the plugin-based agent architecture and migrates the CLI and core flows from skills-manifest management to plugin lifecycle management. It adds the plugin-manager package, agent plugin packages (Claude/Copilot/Codex), canonical skills template/repository infrastructure, and new plugins install/list/show/update/uninstall command flows, including project init/update integration. The change also updates documentation, hooks, tests, and config persistence so plugin declarations in specd.yaml become the authoritative installation source.

Specs affected:

- `cli:cli/plugins-install`
- `cli:cli/plugins-list`
- `cli:cli/plugins-show`
- `cli:cli/plugins-update`
- `core:core/config`
- `core:core/config-writer-port`
- `cli:cli/project-init`
- `cli:cli/project-update`
- `cli:cli/plugins-uninstall`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-manager:install-plugin-use-case`
- `plugin-manager:uninstall-plugin-use-case`
- `plugin-manager:update-plugin-use-case`
- `plugin-manager:list-plugins-use-case`
- `plugin-manager:load-plugin-use-case`
- `plugin-manager:plugin-repository-port`
- `plugin-manager:specd-plugin-type`
- `plugin-manager:agent-plugin-type`
- `plugin-manager:plugin-errors`
- `plugin-manager:plugin-loader`
- `skills:skill`
- `skills:skill-bundle`
- `skills:skill-repository`
- `skills:list-skills`
- `skills:get-skill`
- `skills:resolve-bundle`
- `skills:skill-repository-port`
- `skills:skill-repository-infra`
- `skills:skill-templates-source`
