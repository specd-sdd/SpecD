# plugin-agent-opencode:plugin-agent

## Purpose

Open Code support is required to keep agent-plugin behavior consistent across the ecosystem and avoid a Claude-only installation path. This spec defines the Open Code plugin contract for skill install/uninstall, target install directory, and metadata value handling so `@specd/skills` can render the final installed markdown predictably.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as a named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Domain layer

The domain layer MUST define:

- a plugin runtime type implementing the `AgentPlugin` contract, receiving `name` and `version` via constructor (not hardcoded)
- an Open Code frontmatter type reflecting the supported Open Code keys
- a per-skill frontmatter map keyed by skill name

The plugin class constructor MUST accept `name` and `version` as parameters. The `type` getter MUST return `'agent'` (hardcoded).

### Requirement: Frontmatter type contract

The Open Code frontmatter value model MUST support this exact field set:

- `name` (required)
- `description` (required)
- `license` (optional)
- `compatibility` (optional)
- `metadata` (optional `Record<string, string>`)

Unknown fields MUST NOT be represented in the structured value collection for generated `SKILL.md` files.

### Requirement: Application layer

The application layer MUST have an `InstallSkills` use case that orchestrates:

1. Get skills via `@specd/skills`
2. Resolve Open Code frontmatter source values for each skill
3. Declare only the Open Code supported capability identifiers (`['mcp', 'agents', 'frontmatter']`)
4. Resolve bundles through `ResolveBundle` so built-in render defaults are supplied by `@specd/skills`
5. Pass `variables.sharedFolder` only when overriding the default shared path contract
6. Install files not marked as shared to categorized directories relative to `projectRoot`:
   - Skills to `.opencode/skills/<skill-name>/`
   - Agents to `.opencode/agents/<agent-name>/`
7. Install files marked as shared to the rendered `sharedFolder` location under the project root
8. Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.
9. Sub-agent Mapping: When installing an agent, the plugin MUST:
   - Set `mode: "subagent"` in the YAML frontmatter.
   - Transform `allowedTools` (e.g., `Bash`, `Read`) into a YAML permissions list (e.g., `- bash: allow`, `- read: allow`).
   - Prepend the rendered system prompt with the generated YAML frontmatter.

The plugin MUST NOT prepend YAML frontmatter for standard skills after bundle resolution.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter injection

During install, the plugin MUST provide structured Open Code frontmatter values to `@specd/skills`, and the rendered skill-local markdown output MUST include only configured fields supported by Open Code.

Files marked as shared MUST continue to be written without Open Code skill frontmatter.

### Requirement: Install location

Project-level skill installation MUST target `.opencode/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.opencode/skills/<skill-name>/`.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Project init wizard integration

The interactive `specd project init` plugin selection MUST include `@specd/plugin-agent-opencode` in the known agent plugin options.

### Requirement: Meta package inclusion

The `@specd/specd` meta package MUST declare `@specd/plugin-agent-opencode` as a workspace dependency.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.opencode/skills/` and agent files from `.opencode/agents/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory at the resolved `sharedFolder` location MUST remain in place because other installed skills may still reference it.

When `options.agents` is provided, uninstall MUST remove only the selected specd-managed agent files from `.opencode/agents/`.

When no filters are provided, uninstall MUST remove all specd-managed skill directories, all specd-managed agent files under `.opencode/agents/`, and the resolved sharedFolder location.

Uninstall MUST NOT remove unrelated directories or files under `.opencode/skills/` or `.opencode/agents/` that are not part of the specd-managed skill or agent set.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill repository access.
- The plugin MUST implement the `AgentPlugin` contract defined by `@specd/plugin-manager`.
- The plugin MUST remain an adapter package with no domain logic outside plugin orchestration concerns.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution with built-in render defaults
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents and their prompts.
