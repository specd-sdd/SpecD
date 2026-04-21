# plugin-agent-opencode:plugin-agent

## Purpose

Open Code support is required to keep agent-plugin behavior consistent across the ecosystem and avoid a Claude-only installation path. This spec defines the Open Code plugin contract for skill install/uninstall, target install directory, and frontmatter handling so the plugin can be implemented predictably and validated against the same standards used by other agent plugins.

## Requirements

### Requirement: Factory export

The package MUST export `create(): AgentPlugin` as a named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback — this works both in development (source tree) and after build/publish (`dist/` with manifest at package root). The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Domain layer

The domain layer MUST define:

- a plugin runtime type implementing the `AgentPlugin` contract, receiving `name` and `version` via constructor (not hardcoded)
- an Open Code frontmatter type reflecting the supported Open Code keys
- a per-skill frontmatter map keyed by skill name

The plugin class constructor MUST accept `name` and `version` as parameters. The `type` getter MUST return `'agent'` (hardcoded).

### Requirement: Frontmatter type contract

The Open Code frontmatter model MUST support this exact field set:

- `name` (required)
- `description` (required)
- `license` (optional)
- `compatibility` (optional)
- `metadata` (optional `Record<string, string>`)

Unknown fields MUST NOT be emitted into generated `SKILL.md` files.

### Requirement: Application layer

The application layer MUST include an `InstallSkills` use case that:

1. reads skills from `@specd/skills`
2. resolves the per-skill frontmatter map
3. prepends Open Code-compatible YAML frontmatter to markdown skill files
4. writes installed skills to the Open Code project skill directory

### Requirement: Frontmatter injection

During install, the plugin MUST prepend YAML frontmatter to each markdown skill file and include only configured fields supported by Open Code.

### Requirement: Install location

Project-level skill installation MUST target `.opencode/skills/` under the provided `projectRoot`.

### Requirement: Project init wizard integration

The interactive `specd project init` plugin selection MUST include `@specd/plugin-agent-opencode` in the known agent plugin options.

### Requirement: Meta package inclusion

The `@specd/specd` meta package MUST declare `@specd/plugin-agent-opencode` as a workspace dependency.

### Requirement: Uninstall behavior

`uninstall(projectRoot, options)` MUST remove installed skill directories from `.opencode/skills/`.

When `options.skills` is provided, uninstall MUST remove only the selected skill directories.

When `options.skills` is omitted, uninstall MUST remove the full `.opencode/skills/` tree.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill repository access.
- The plugin MUST implement the `AgentPlugin` contract defined by `@specd/plugin-manager`.
- The plugin MUST remain an adapter package with no domain logic outside plugin orchestration concerns.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`plugin-manager:agent-plugin-type`](../../plugins-manager/agent-plugin-type/spec.md) — defines the `AgentPlugin` install/uninstall contract
- [`skills:skill-templates-source`](../../skills/skill-templates-source/spec.md) — defines template source and plugin-side frontmatter injection responsibility
