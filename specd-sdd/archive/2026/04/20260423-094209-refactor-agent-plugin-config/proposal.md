# Proposal: refactor-agent-plugin-config

## Motivation

The current plugin system and skill resolution logic are too coupled to the `projectRoot` string primitive, forcing consumers to reconstruct project context and manually handle common variables. By passing the full `SpecdConfig`, we provide plugins with the rich context they need and enable automatic injection of built-in variables in skill templates, improving developer ergonomics and consistency.

## Current behaviour

Currently, `AgentPlugin.install()` and `PluginContext` only receive `projectRoot: string`. This makes it difficult for plugins to access other project-level configurations (like workspaces or storage paths) without re-resolving the configuration. Additionally, skill templates require manual passing of common variables like `{{projectRoot}}` and `{{configPath}}`, and several core types use generic names (`InstallOptions`, `InstallResult`) that are actually specific to agent plugins.

## Proposed solution

We will refactor the plugin interfaces to accept `SpecdConfig` instead of `projectRoot`, providing immediate access to the fully resolved project state. Generic agent-specific types will be renamed for clarity. The skills package will be updated to automatically inject built-in variables derived from the configuration during bundle resolution, making them globally available in templates without manual effort.

## Specs affected

### New specs

- _none_

### Modified specs

- `plugin-manager:specd-plugin-type`: Replace `projectRoot: string` and `config: Record<string, unknown>` in `PluginContext` with `SpecdConfig`.
  - Depends on (added): none
- `plugin-manager:agent-plugin-type`: Replace `projectRoot: string` with `SpecdConfig` in `install`/`uninstall` signatures; rename `InstallOptions`/`InstallResult` to `AgentInstallOptions`/`AgentInstallResult`.
  - Depends on (added): none
- `plugin-manager:install-plugin-use-case`: Update to pass `SpecdConfig` instead of `projectRoot` string.
  - Depends on (added): none
- `plugin-manager:uninstall-plugin-use-case`: Update to pass `SpecdConfig` instead of `projectRoot` string.
  - Depends on (added): none
- `plugin-manager:update-plugin-use-case`: Update to pass `SpecdConfig` instead of `projectRoot` string.
  - Depends on (added): none
- `plugin-manager:plugin-loader`: Update `PluginLoaderOptions` to accept `SpecdConfig` for plugin initialization.
  - Depends on (added): none
- `skills:resolve-bundle`: Implement automatic injection of built-in variables (`{{projectRoot}}`, `{{configPath}}`).
  - Depends on (added): none
- `skills:skill-repository-port`: Update `getBundle` to support built-in variable resolution, potentially requiring `SpecdConfig` access.
  - Depends on (added): none
- `plugin-agent-claude:plugin-agent`: Update implementation to handle `SpecdConfig` in lifecycle methods and skill installation.
  - Depends on (added): none
- `plugin-agent-copilot:plugin-agent`: Update implementation to handle `SpecdConfig` in lifecycle methods and skill installation.
  - Depends on (added): none
- `plugin-agent-codex:plugin-agent`: Update implementation to handle `SpecdConfig` in lifecycle methods and skill installation.
  - Depends on (added): none
- `plugin-agent-opencode:plugin-agent`: Update implementation to handle `SpecdConfig` in lifecycle methods and skill installation.
  - Depends on (added): none

## Impact

This change affects the core plugin architecture and skill resolution pipeline. It requires updates to all agent plugins (Claude, Copilot, Codex, OpenCode) and the CLI wiring. While primarily a refactor, it introduces a breaking change to the `SpecdPlugin` and `AgentPlugin` interfaces, necessitating a coordinated update across the monorepo.

## Technical context

- **SpecdConfig as Source of Truth**: The `SpecdConfig` already contains the `projectRoot` and the per-plugin configuration (under `plugins.agents[].config`), making the individual fields redundant.
- **PluginLoader Context**: The `PluginLoader` will receive the full `SpecdConfig`. Since it is managed by the Kernel/CLI which already has the config resolved, passing it directly avoids redundant I/O and reconstruction.
- **Built-in Variables**: Confirmed variables for automatic injection include `{{projectRoot}}`, `{{configPath}}`, and `{{schemaRef}}`. These will be merged as a base layer during skill bundle resolution.
- **Removal of typeContext**: The `typeContext` field in `PluginContext` is unused by current agent plugins and becomes obsolete with the introduction of the full `SpecdConfig`. It will be removed to simplify the interface.
- **Naming Ergonomics**: Renaming `InstallOptions` to `AgentInstallOptions` avoids confusion with potential future general plugin installation mechanisms.

## Open questions

_none_
