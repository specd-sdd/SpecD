# plugin-agent-standard:plugin-agent

## Purpose

The Agent Skills open standard (agentskills.io) is adopted by a growing number of agent clients (Gemini CLI, Cursor, Amp, Roo Code, etc.). specd needs a vendor-neutral plugin that installs skills using this standard's frontmatter format, complementing the existing vendor-specific plugins. This spec defines the Agent Skills standard plugin contract for skill install/uninstall, target install directory, frontmatter handling including `allowed-tools`, and integration requirements.

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

The Agent Skills standard frontmatter model MUST support this exact field set per the agentskills.io specification:

- `name` (required)
- `description` (required)
- `license` (optional)
- `compatibility` (optional)
- `metadata` (optional `Record<string, string>`)
- `allowed-tools` (optional, space-separated string of pre-approved tools)

Unknown fields MUST NOT be emitted into generated `SKILL.md` files.

### Requirement: Application layer

The application layer MUST include an `InstallSkills` use case that:

1. reads skills from `@specd/skills`, passing `SpecdConfig` for built-in variable resolution
2. resolves the per-skill frontmatter map
3. prepends Agent Skills standard YAML frontmatter only to markdown files not marked as shared
4. writes files not marked as shared to the installed skill directory under the `projectRoot` provided in `SpecdConfig`
5. writes files marked as shared to the Agent Skills standard shared skills resource directory under the `projectRoot` provided in `SpecdConfig`

### Requirement: Frontmatter injection

During install, the plugin MUST prepend YAML frontmatter to each skill-local markdown file and include only configured fields supported by the Agent Skills standard.

The plugin MUST NOT prepend skill frontmatter to files marked as shared.

### Requirement: Install location

Project-level skill installation MUST target `.agents/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.agents/skills/<skill-name>/`.

Files marked as shared MUST be installed under `.agents/skills/_specd-shared/`. This shared directory MUST NOT contain a `SKILL.md` file.

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

When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. The shared resource directory MUST remain in place because other installed skills may still reference it.

When `options.skills` is omitted, uninstall MUST remove all specd-managed skill directories and `_specd-shared/`.

Uninstall MUST NOT remove unrelated directories or files under `.agents/skills/` that are not part of the specd-managed skill set.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill repository access.
- The plugin MUST implement the `AgentPlugin` contract defined by `@specd/plugin-manager`.
- The plugin MUST remain an adapter package with no domain logic outside plugin orchestration concerns.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.
- The frontmatter key for pre-approved tools MUST be `allowed-tools` (with hyphen) per the agentskills.io specification, not `allowed_tools` (underscore).

## Spec Dependencies

- [`plugin-agent-opencode:plugin-agent`](../../plugins-opencode/plugin-agent/spec.md) — reference implementation for the clone
- [`default:_global/commits`](../../../_global/commits/spec.md) — commit scope registration
