# plugin-agent-standard:plugin-agent

## Purpose

The Agent Skills open standard (agentskills.io) is adopted by a growing number of agent clients (Gemini CLI, Cursor, Amp, Roo Code, etc.). specd needs a vendor-neutral plugin that installs skills using this standard's metadata contract while relying on `@specd/skills` to render the final installed markdown.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin | Promise<AgentPlugin>` as a named export. `create` MUST read `name` and `version` from the package `specd-plugin.json` and MUST throw `PluginValidationError` (fields `specd-plugin.json: name` or `specd-plugin.json: version`) when the manifest it resolves lacks a non-empty string for either; the resulting plugin has no `type`.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The loader awaits the result, so `create` MAY be `async`. The returned plugin MUST NOT carry a `type` discriminator.

### Requirement: Manifest and install context

The manifest `specd-plugin.json` MUST declare `schemaVersion: 2`, MUST NOT declare `pluginType`, and MUST declare one contribution of kind `agents` with the local id `standard` (`contributes: { "agents": { "standard": {} } }`), addressable as `@specd/plugin-agent-standard.standard`.

`install` and `uninstall` receive an `AgentInstallContext` (`config`, `options`, `contributions`) as defined by `plugin-manager:agent-plugin-type`. Wherever this spec refers to `config` and `options` of `install` and `uninstall`, they are `context.config` and `context.options`. The plugin declares no `configSchema`, so it accepts no plugin `config`.

### Requirement: Domain layer

The domain layer MUST define:

- a plugin runtime type implementing the `AgentPlugin` contract, receiving `name` and `version` via constructor (not hardcoded)
- an Agent Skills standard frontmatter type reflecting the fields defined by the agentskills.io specification
- a per-skill frontmatter map keyed by skill name

The plugin class constructor MUST accept `name` and `version` as parameters.

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

### Requirement: Prompt Injection

`StandardAgentPlugin.install()` MUST inject the base agent instruction prompt into the shared `AGENTS.md` file under the project root.

- `install()` MUST call `injectSpecdBlock(agentsMdPath, prompt, 'standard')`. The base `<!-- <specd agents="…"> -->` block in `AGENTS.md` is shared and reference-counted by plugin id, so several agent plugins can target the same file.
- `uninstall()` MUST call `removeSpecdBlock(agentsMdPath, 'standard')`, which drops the `standard` reference, purges any legacy `<!-- <specd-plugin:standard> -->` block, and removes the shared base block only when no other agent plugin still references it.
- No separate plugin marker block (`<!-- <specd-plugin:standard> -->`) is injected during install.
- Only a full `uninstall()` calls `removeSpecdBlock`; a filtered `uninstall()` keeps the block.

### Requirement: allowed-tools configuration

The per-skill frontmatter map MUST declare `allowed-tools` for each skill with appropriate tool strings matching the agentskills.io format (space-separated). Tool strings MUST include the tools needed by each specd skill:

- Read, Write, Edit, Grep, Glob for file operations
- `Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)` for command execution
- Agent for sub-agent spawning where applicable

Tool patterns MUST use the space style `Bash(<command> *)` for every skill; the colon style (`Bash(git:*)`) MUST NOT be used. Skills that need other commands list them in the same style (for example `Bash(git *)`, `Bash(gh *)` for `specd-compliance`); `specd-compliance` MUST additionally include `Bash(node *)` and `Bash(pnpm *)`.

### Requirement: Project init wizard integration

The interactive `specd project init` plugin selection MUST include `@specd/plugin-agent-standard` in the known agent plugin options.

### Requirement: Meta package inclusion

The `@specd/specd` meta package MUST declare `@specd/plugin-agent-standard` as a workspace dependency.

### Requirement: Uninstall behavior

`uninstall(context: AgentInstallContext)` MUST remove installed skill directories from `.agents/skills/` relative to `context.config.projectRoot`, honouring `context.options`. Because this plugin has no native agents directory, its agent files live in the resolved `sharedFolder` location as `<agent-name>.agent.md`.

**Filtered uninstall.** An empty `skills` or `agents` array counts as not provided. Selected names MUST be validated against the specd-managed skill and agent names: a name that is not managed (including any name with a path separator or `..`) is skipped, reported in the result of `uninstallWithResult()` (the plugin method that returns the report; `uninstall()` itself resolves to nothing, as the `AgentPlugin` contract requires), and never touches the filesystem. A full uninstall removes the managed agent files from both the runtime agents directory (when the runtime has one) and the shared folder, whatever `capabilities` it receives. When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. When `options.agents` is provided, uninstall MUST remove only `<sharedFolder>/<agent-name>.agent.md` for the selected agents. A filtered uninstall MUST NOT remove any other shared file, MUST NOT touch the owners marker (`.owners.json`), MUST NOT call `removeSharedOwner`, and MUST keep the `standard` reference in the prompt block of `AGENTS.md`.

**Full uninstall.** When neither `options.skills` nor `options.agents` is provided, uninstall MUST:

1. remove all specd-managed skill directories under `.agents/skills/`, including legacy flat `<skill>.md` files left by previous versions;
2. call `removeSpecdBlock` for `AGENTS.md`, which drops only this plugin's `standard` reference (the block itself disappears only when no other agent plugin references it);
3. follow the uninstall protocol of `skills:shared-folder-owners` for the resolved `sharedFolder` location: call `removeSharedOwner(sharedDir, 'standard')`; when `hadMarker` is `false` every shared file MUST be left untouched; when other owners remain every shared file MUST be left untouched; when no owner remains, delete `shared.md`, every managed `<agent>.agent.md` file and the marker, and then call `removeSharedFolderIfEmpty` so that the folder survives when foreign files remain. Errors other than `ENOTEMPTY` and `ENOENT` MUST propagate.

Uninstall MUST NOT remove unrelated directories or files under `.agents/skills/` or the shared folder that are not part of the specd-managed set.

### Requirement: Shared folder ownership and agent placement

Before writing the first file into the resolved `sharedFolder` location (shared bundle files and agent files, which this plugin always places there), `install()` MUST call `addSharedOwner(sharedDir, 'standard')` from `@specd/skills`, for filtered and unfiltered installs alike, so that `skills:shared-folder-owners` can tell when the last owner leaves.

Because the plugin declares only the `frontmatter` capability, the agent fallback is unconditional: agent files are always written next to `shared.md` as `<agent-name>.agent.md`.

### Requirement: Fast-track skill installation

Agent Skills Standard installation MUST include `specd-fasttrack` when standard skills are installed without an explicit skill filter. It MUST resolve the skill through `ResolveBundle`, provide its supported `frontmatter` capability and structured standard frontmatter values, and write the rendered skill under `.agents/skills/specd-fasttrack/`.

The per-skill frontmatter entry MUST declare an `allowed-tools` value sufficient for the fast-track workflow's file operations, SpecD/Node/PNPM commands, and delegated-agent use when that capability is available. The output MUST omit capability-dependent instructions that the Standard runtime does not support.

### Requirement: Manual-only fast-track routing

The Agent Skills standard fast-track frontmatter description MUST state that the skill is manual-only and may be used only when the user explicitly invokes `/specd-fasttrack`.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill repository access.
- The plugin MUST implement the `AgentPlugin` contract defined by `@specd/plugin-manager`.
- The plugin MUST remain an adapter package with no domain logic outside plugin orchestration concerns.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- The frontmatter key for pre-approved tools MUST be `allowed-tools` (with hyphen) per the agentskills.io specification, not `allowed_tools` (underscore).

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents
- [`skills:agent-instruction-template`](../skills/agent-instruction-template/spec.md) — shared base prompt rendering and block management
- [`skills:shared-folder-owners`](../skills/shared-folder-owners/spec.md) — owners marker for the shared folder
