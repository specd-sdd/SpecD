# plugin-agent-standard:plugin-agent

## Purpose

The Agent Skills open standard (agentskills.io) is adopted by a growing number of agent clients (Gemini CLI, Cursor, Amp, Roo Code, etc.). specd needs a vendor-neutral plugin that installs skills using this standard's metadata contract while relying on `@specd/skills` to render the final installed markdown.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as a named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Domain layer

The domain layer MUST define:

- a plugin runtime type implementing the `AgentPlugin` contract, receiving `name` and `version` via constructor (not hardcoded)
- an Agent Skills standard frontmatter type reflecting the fields defined by the agentskills.io specification
- a per-skill frontmatter map keyed by skill name

The plugin class constructor MUST accept `name` and `version` as parameters. The `type` getter MUST return `'agent'` (hardcoded).

### Requirement: Frontmatter type contract

The Agent Skills standard frontmatter value model MUST support this exact field set per the agentskills.io specification:

- `name` (required)
- `description` (required)
- `license` (optional)
- `compatibility` (optional)
- `metadata` (optional `Record<string, string>`)
- `allowed-tools` (optional, space-separated string of pre-approved tools)

Unknown fields MUST NOT be represented in the structured value collection for generated `SKILL.md` files.

### Requirement: Application layer

The application layer MUST have an `InstallSkills` use case that orchestrates:

1. Get skills via `@specd/skills`
2. Resolve standard frontmatter source values for each skill
3. Declare only the Standard agent supported capability identifiers (`['frontmatter']`)
4. Resolve bundles through `ResolveBundle` so built-in render defaults are supplied by `@specd/skills`
5. Pass `variables.sharedFolder` only when overriding the default shared path contract
6. Install files not marked as shared to categorized directories relative to `projectRoot`:
   - Skills to `.agents/skills/<skill-name>/`
   - Agents to the same directory as the shared context file (since `agents` capability is not supported)
7. Install files marked as shared to the rendered `sharedFolder` location under the project root

The plugin MUST NOT prepend YAML frontmatter after bundle resolution.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter injection

During install, the plugin MUST provide structured Agent Skills standard frontmatter values to `@specd/skills`, and the rendered skill-local markdown output MUST include only configured fields supported by the Agent Skills standard.

Files marked as shared MUST continue to be written without Agent Skills standard frontmatter.

### Requirement: Install location

Project-level skill installation MUST target `.agents/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.agents/skills/<skill-name>/`.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: allowed-tools configuration

The per-skill frontmatter map MUST declare `allowed-tools` for each skill with appropriate tool strings matching the agentskills.io format (space-separated). Tool strings MUST include the tools needed by each specd skill:

- Read, Write, Edit, Grep, Glob for file operations
- `Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)` for command execution
- Agent for sub-agent spawning where applicable

### Requirement: Project init wizard integration

The interactive `specd project init` plugin selection MUST include `@specd/plugin-agent-standard` in the known agent plugin options.

### Requirement: Meta package inclusion

The `@specd/specd` meta package MUST declare `@specd/plugin-agent-standard` as a workspace dependency.

### Requirement: Uninstall behavior

`uninstall(config: SpecdConfig, options?: AgentInstallOptions)` MUST remove installed skill directories from `.agents/skills/` relative to `config.projectRoot`.

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory at the resolved `sharedFolder` location MUST remain in place because other installed skills may still reference it.

When `options.skills` is omitted, uninstall MUST remove all specd-managed skill directories and the resolved sharedFolder location.

Uninstall MUST NOT remove unrelated directories or files under `.agents/skills/` that are not part of the specd-managed skill set.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill repository access.
- The plugin MUST implement the `AgentPlugin` contract defined by `@specd/plugin-manager`.
- The plugin MUST remain an adapter package with no domain logic outside plugin orchestration concerns.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.
- The frontmatter key for pre-approved tools MUST be `allowed-tools` (with hyphen) per the agentskills.io specification, not `allowed_tools` (underscore).

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution with built-in render defaults
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents and their prompts.
