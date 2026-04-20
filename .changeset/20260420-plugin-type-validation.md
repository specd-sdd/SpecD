---
'@specd/plugin-manager': patch
---

20260420 - plugin-type-validation: Add plugin type validation to plugin-manager. Derive PluginType from PLUGIN_TYPES const array, add isSpecdPlugin and isAgentPlugin type guards to domain, and verify AgentPlugin in use cases before install/uninstall to prevent runtime errors with unknown plugin types.

Specs affected:

- `plugin-manager:specd-plugin-type`
- `plugin-manager:agent-plugin-type`
- `plugin-manager:install-plugin-use-case`
- `plugin-manager:uninstall-plugin-use-case`
- `plugin-manager:update-plugin-use-case`
- `plugin-manager:plugin-loader`
