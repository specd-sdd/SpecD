# plugin-agent-copilot:plugin-agent

## Purpose

This spec defines the Copilot plugin contract for concrete install/uninstall behavior, project install location, and exact metadata value support so agent skills are rendered through `@specd/skills` and remain usable directly in Copilot workflows.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as default or named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Plugin runtime contract

The implementation MUST return a valid `AgentPlugin` that:

- has `type: 'agent'` (hardcoded for type safety)
- has `name` and `version` sourced from `specd-plugin.json` via the factory — not hardcoded in the class
- implements `install(config, options)` and `uninstall(config, options)` with real filesystem behavior, using the provided `SpecdConfig`
- uses a stable structured metadata value model for generated skill files
- declares only Copilot-supported capability identifiers to `@specd/skills`

### Requirement: Skill installation and frontmatter injection

The plugin MUST install skills from `@specd/skills` and pass Copilot-compatible capability identifiers plus frontmatter source values into markdown skill rendering during install.

Installation flow MUST:

1. load requested skills (or all skills when no filter is provided)
2. resolve structured frontmatter source values for each skill
3. declare only the Copilot-supported capability identifiers for each skill
4. pass `variables.sharedFolder` only when overriding the default shared path contract
5. write files marked as shared to the rendered `sharedFolder` location under the project root
6. write files not marked as shared to the installed skill directory
7. rely on the rendered markdown returned by `@specd/skills` for non-shared markdown files
8. return an `InstallResult` with installed and skipped entries

### Requirement: Frontmatter field contract

The Copilot frontmatter value contract MUST cover this exact supported set:

- required: `name`, `description`
- optional core field: `license`
- optional CLI-supported fields: `allowed-tools`, `user-invocable`, `disable-model-invocation`

Fields outside this set MUST NOT be represented in the Copilot frontmatter value collection by default.

### Requirement: Install location

Project-level skill installation MUST target `.github/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.github/skills/<skill-name>/`.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.github/skills/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory at the resolved `sharedFolder` location MUST remain in place because other installed skills may still reference it.

When `options.skills` is omitted, uninstall MUST remove all specd-managed skill directories and the resolved sharedFolder location.

Uninstall MUST NOT remove unrelated directories or files under `.github/skills/` that are not part of the specd-managed skill set.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill operations.
- The plugin MUST implement concrete install and uninstall behavior.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-templates-source`](../skills/skill-templates-source/spec.md) — frontmatter injection responsibility and template source contract
