# @specd/plugin-manager

## 0.2.0

### Minor Changes

- 1bdd9b0: 20260429 - shared-skill-bundle-targets: Adds first-class shared file support for skill bundles so plugin installers can route shared templates to a dedicated shared directory while preserving compatibility when no shared target is configured. Agent plugin installers now install and uninstall only specd-managed skills, keeping unrelated user skills untouched during full uninstall operations. The change also standardizes shared template references and verifies end-to-end behavior across codex, claude, copilot, and opencode plugin workflows.

  Specs affected:
  - `skills:skill-bundle`
  - `skills:skill-repository-port`
  - `skills:skill-repository-infra`
  - `skills:resolve-bundle`
  - `plugin-manager:agent-plugin-type`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`

### Patch Changes

- aad2115: 20260424 - refactor-agent-plugin-config: Replace projectRoot: string with SpecdConfig in AgentPlugin and PluginContext, rename InstallOptions/InstallResult to agent-specific names, and inject built-in variables automatically when resolving skill bundles.

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

- Updated dependencies [c7c485e]
- Updated dependencies [0103454]
- Updated dependencies [c5c8f64]
- Updated dependencies [f4aa390]
- Updated dependencies [60ea657]
- Updated dependencies [ef13876]
- Updated dependencies [5f6a823]
- Updated dependencies [1c1c54a]
- Updated dependencies [c558cb2]
  - @specd/core@0.2.0

## 0.1.0

### Minor Changes

- 7ac27d1: 20260418 - plugin-system-phase-1: Phase 1 introduces the plugin-based agent architecture and migrates the CLI and core flows from skills-manifest management to plugin lifecycle management. It adds the plugin-manager package, agent plugin packages (Claude/Copilot/Codex), canonical skills template/repository infrastructure, and new plugins install/list/show/update/uninstall command flows, including project init/update integration. The change also updates documentation, hooks, tests, and config persistence so plugin declarations in specd.yaml become the authoritative installation source.

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

### Patch Changes

- 0109e6d: 20260420 - fix-agent-plugin-type-check: The `isAgentPlugin` type guard now validates that `plugin.type === 'agent'` in addition to checking for `install` and `uninstall` methods, ensuring runtime consistency with the `AgentPlugin` interface definition.
- 5215349: 20260420 - plugin-type-validation: Add plugin type validation to plugin-manager. Derive PluginType from PLUGIN_TYPES const array, add isSpecdPlugin and isAgentPlugin type guards to domain, and verify AgentPlugin in use cases before install/uninstall to prevent runtime errors with unknown plugin types.

  Specs affected:
  - `plugin-manager:specd-plugin-type`
  - `plugin-manager:agent-plugin-type`
  - `plugin-manager:install-plugin-use-case`
  - `plugin-manager:uninstall-plugin-use-case`
  - `plugin-manager:update-plugin-use-case`
  - `plugin-manager:plugin-loader`

- aa2e957: 20260421 - plugin-manifest-version: Add version field to plugin manifests, read version from manifest in plugin factories, remove hardcoded versions from plugin classes, add sync script to build pipeline

  Specs affected:
  - `plugin-manager:plugin-loader`
  - `plugin-manager:specd-plugin-type`
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`

- Updated dependencies [4b28916]
- Updated dependencies [026650f]
- Updated dependencies [58f8092]
- Updated dependencies [99f23ff]
- Updated dependencies [7ac27d1]
- Updated dependencies [7942039]
- Updated dependencies [f70f882]
- Updated dependencies [80dbaaf]
- Updated dependencies [4dd5db8]
  - @specd/core@0.1.0
