---
'@specd/specd': patch
---

20261113 - plugin-architecture: Plugin system base: plugin as a feature with N contributions declared in the manifest, flat plugins list in specd.yaml, open registry of contribution-kind handlers, scoped names and @scope/name.id addressing, runtime and install lifecycles, registerPlugins in the SDK, migration of agent plugins and cli plugins commands

Modified packages:

- @specd/core
- @specd/plugin-manager
- @specd/cli
- @specd/sdk
- @specd/plugin-agent-claude
- @specd/plugin-agent-copilot
- @specd/plugin-agent-codex
- @specd/plugin-agent-opencode
- @specd/plugin-agent-standard
- @specd/skills

Specs affected:

- `core:config`
- `core:config-loader`
- `core:config-writer-port`
- `plugin-manager:specd-plugin-type`
- `plugin-manager:plugin-loader`
- `plugin-manager:register-plugins-use-case`
- `plugin-manager:install-plugin-use-case`
- `plugin-manager:uninstall-plugin-use-case`
- `plugin-manager:update-plugin-use-case`
- `plugin-manager:list-plugins-use-case`
- `cli:plugins-install`
- `cli:plugins-uninstall`
- `cli:plugins-update`
- `cli:plugins-list`
- `cli:plugins-show`
- `sdk:composition`
- `sdk:host-context`
- `plugin-manager:agent-plugin-type`
- `cli:project-init`
- `cli:project-update`
- `cli:config-show`
- `core:check-registry`
- `plugin-manager:load-plugin-use-case`
- `plugin-manager:plugin-errors`
- `plugin-manager:plugin-repository-port`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
- `cli:host-context`
- `skills:shared-folder-owners`
