# plugin-agent-codex:plugin-agent

## Purpose

This spec defines the Codex agent plugin contract for install/uninstall behavior, install target directory, and exact frontmatter support so implementation and verification are deterministic.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as default or named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Plugin runtime contract

The implementation MUST return a valid `AgentPlugin` that:

- has `type: 'agent'` (hardcoded for type safety)
- has `name` and `version` sourced from `specd-plugin.json` via the factory — not hardcoded in the class
- implements `install(config, options)` and `uninstall(config, options)` with real filesystem behavior, using the provided `SpecdConfig`
- uses a stable frontmatter model for generated skill files

### Requirement: Skill installation and frontmatter injection

The plugin MUST install skills from `@specd/skills` and inject Codex-compatible frontmatter into markdown skill files during install.

Installation flow MUST:

1. load requested skills (or all skills when no filter is provided)
2. resolve frontmatter for each skill
3. write files marked as shared to the Codex shared skills resource directory
4. write files not marked as shared to the installed skill directory
5. prepend frontmatter only to markdown files that are not marked as shared
6. return an `InstallResult` with installed and skipped entries

### Requirement: Frontmatter field contract

The Codex frontmatter contract MUST model and emit this exact supported set:

- `name` (required)
- `description` (required)

No other frontmatter keys are considered Codex-supported in this spec.

### Requirement: Install location

Skills MUST be installed to `.codex/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.codex/skills/<skill-name>/`.

Files marked as shared MUST be installed under `.codex/skills/_specd-shared/`. This shared directory MUST NOT contain a `SKILL.md` file.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.codex/skills/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory MUST remain in place because other installed skills may still reference it.

When `options.skills` is omitted, uninstall MUST remove all specd-managed skill directories and `_specd-shared/`.

Uninstall MUST NOT remove unrelated directories or files under `.codex/skills/` that are not part of the specd-managed skill set.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill operations.
- The plugin MUST implement concrete install and uninstall behavior.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-templates-source`](../skills/skill-templates-source/spec.md) — frontmatter injection responsibility and template source contract
