# plugin-agent-codex:plugin-agent

## Purpose

This spec defines the Codex agent plugin contract for install/uninstall behavior, install target directory, and exact metadata value support so `@specd/skills` can render deterministic installed skill files for Codex.

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
- declares only Codex-supported capability identifiers to `@specd/skills`

### Requirement: Skill installation and frontmatter injection

The plugin MUST install skills from `@specd/skills` and pass Codex-compatible capability identifiers (`['mcp', 'agents', 'frontmatter']`) plus frontmatter source values into markdown skill rendering during install.

Installation flow MUST:

1. load requested skills (or all skills when no filter is provided)
2. resolve structured frontmatter source values for each skill
3. declare only the Codex-supported capability identifiers for each skill
4. resolve bundles through `ResolveBundle` so built-in render defaults are supplied by `@specd/skills`
5. pass `variables.sharedFolder` only when overriding the default shared path contract
6. write files marked as shared to the rendered `sharedFolder` location under the project root
7. write files not marked as shared to categorized directories relative to `projectRoot`:
   - Skills to `.codex/skills/<skill-name>/`
   - Agents to `.codex/agents/<agent-name>.toml`
8. Sub-agent Mapping: When installing an agent, the plugin MUST:
   - Generate a TOML file instead of Markdown.
   - Map `name` and `description` to TOML keys.
   - Wrap the rendered system prompt in a multi-line string (`"""`) and map it to the `developer_instructions` TOML key.
   - Ensure the instructions are correctly escaped for TOML.
9. rely on the rendered markdown returned by `@specd/skills` for non-shared markdown files
10. return an `InstallResult` with installed and skipped entries
11. Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.

The plugin MUST NOT prepend YAML frontmatter for standard skills after bundle resolution.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter field contract

The Codex frontmatter value contract MUST cover this exact supported set:

- `name` (required)
- `description` (required)

No other frontmatter keys are considered Codex-supported in this spec.

### Requirement: Install location

Skills MUST be installed to `.codex/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.codex/skills/<skill-name>/`.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.codex/skills/` and agent files from `.codex/agents/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory at the resolved `sharedFolder` location MUST remain in place because other installed skills may still reference it.

When `options.agents` is provided, uninstall MUST remove only the selected specd-managed agent files from `.codex/agents/`.

When no filters are provided, uninstall MUST remove all specd-managed skill directories, all specd-managed agent files under `.codex/agents/`, and the resolved sharedFolder location.

Uninstall MUST NOT remove unrelated directories or files under `.codex/skills/` or `.codex/agents/` that are not part of the specd-managed skill or agent set.

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
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution with built-in render defaults
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents and their prompts.
