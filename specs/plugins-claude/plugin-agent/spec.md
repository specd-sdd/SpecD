# plugin-agent-claude:plugin-agent

## Purpose

Claude agent plugin implementation. Exports `create(): AgentPlugin` that provides skill installation by declaring Claude-supported capabilities and frontmatter source values to `@specd/skills`, which renders the final installed markdown for Claude Code.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as default or named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Domain layer

The domain layer MUST contain:

- `claude-plugin.ts` — implementation of `AgentPlugin` interface, receiving `name` and `version` via constructor (not hardcoded)
- `frontmatter.ts` — Frontmatter type definitions
- `frontmatter/` — skill metadata map (`skillFrontmatter: Record<string, Frontmatter>`)

The plugin class constructor MUST accept `name` and `version` as parameters. The `type` getter MUST return `'agent'` (hardcoded).

### Requirement: Frontmatter type

The Claude plugin MUST define a structured value model that can represent the Claude-supported metadata set:

- `name`
- `description`
- `when_to_use`
- `argument_hint`
- `disable_model_invocation`
- `user_invocable`
- `allowed_tools`
- `model`
- `effort`
- `context`
- `agent`
- `hooks`
- `paths`
- `shell`

### Requirement: Application layer

The application layer MUST have an `InstallSkills` use case that orchestrates:

1. Get skills via `@specd/skills`
2. Resolve Claude frontmatter source values for each skill
3. Declare only the Claude-supported capability identifiers for each install (`['mcp', 'agents', 'frontmatter']`)
4. Resolve bundles through `ResolveBundle` so built-in render defaults are supplied by `@specd/skills`
5. Pass `variables.sharedFolder` only when overriding the default shared path contract
6. Install files not marked as shared to categorized directories relative to `projectRoot`:
   - Skills to `.claude/skills/<skill-name>/`
   - Agents to `.claude/agents/<agent-name>/` (only when `agents` capability is supported)
7. Install files marked as shared to the rendered `sharedFolder` location under the project root
8. Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.
9. Sub-agent Mapping: When installing an agent, the plugin MUST:
   - Map `allowedTools` list into a single comma-separated string for the `tools` YAML key.
   - Map the preferred model from `specd-agent.meta.json` to the `model` YAML key if present.
   - Prepend the rendered system prompt with the generated YAML frontmatter.

The plugin MUST NOT assemble the final YAML frontmatter document itself for standard skills after bundle resolution.
The plugin MUST NOT normalize capability objects on behalf of `@specd/skills`.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter injection

During install, the plugin MUST provide Claude frontmatter values to `@specd/skills` so that the rendered skill-local markdown output includes Claude-compatible YAML frontmatter.

The plugin MUST NOT prepend YAML frontmatter itself after bundle resolution.

Files marked as shared MUST continue to be written without Claude skill frontmatter.

### Requirement: Install location

Skills MUST be installed to `.claude/skills/` in the project root.
Agents MUST be installed to `.claude/agents/` in the project root (when `agents` capability is supported).

For each skill or agent, files not marked as shared MUST be installed under its respective categorized directory.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.claude/skills/` and agent files from `.claude/agents/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory at the resolved `sharedFolder` location MUST remain in place because other installed skills may still reference it.

When `options.agents` is provided, uninstall MUST remove only the selected specd-managed agent files from `.claude/agents/`.

When no filters are provided, uninstall MUST remove all specd-managed skill directories, all specd-managed agent files under `.claude/agents/`, and the resolved sharedFolder location.

Uninstall MUST NOT remove unrelated directories or files under `.claude/skills/` or `.claude/agents/` that are not part of the specd-managed skill or agent set.

## Constraints

- This plugin depends on `@specd/skills` for skill operations.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution with built-in render defaults
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents and their prompts.
