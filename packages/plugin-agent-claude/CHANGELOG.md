# @specd/plugin-agent-claude

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

- 58c75d9: Add `Bash(specd *)` to frontmatter allowed-tools and add specd graph support.
  - Add `Bash(specd *)` to all skill frontmatter allowed-tools in plugin-agent-claude/frontmatter/index.ts
  - Add `Bash(specd *)` to all .opencode/skills SKILL.md frontmatter
  - Use specd CLI commands for code analysis:
    - `specd spec list` and `specd spec show` for reading specs
    - `specd graph search`, `specd graph impact`, `specd graph stats` for code analysis
  - Add guardrails to specd and specd-new skills preventing code writes
  - Update single spec mode to use `workspace:path` format instead of `specs/` paths

- aa2e957: 20260421 - plugin-manifest-version: Add version field to plugin manifests, read version from manifest in plugin factories, remove hardcoded versions from plugin classes, add sync script to build pipeline

  Specs affected:
  - `plugin-manager:plugin-loader`
  - `plugin-manager:specd-plugin-type`
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-copilot:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`

- Updated dependencies [58c75d9]
- Updated dependencies [7ac27d1]
- Updated dependencies [0109e6d]
- Updated dependencies [5215349]
- Updated dependencies [9225d20]
- Updated dependencies [aa2e957]
  - @specd/skills@0.1.0
  - @specd/plugin-manager@0.1.0
