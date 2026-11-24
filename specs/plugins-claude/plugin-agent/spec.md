# plugin-agent-claude:plugin-agent

## Purpose

Claude agent plugin implementation. Exports `create(): AgentPlugin` that provides skill installation by declaring Claude-supported capabilities and frontmatter source values to `@specd/skills`, which renders the final installed markdown for Claude Code.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin | Promise<AgentPlugin>` as default or named export. `create` MUST read `name` and `version` from the package `specd-plugin.json` and MUST throw `PluginValidationError` (fields `specd-plugin.json: name` or `specd-plugin.json: version`) when the manifest it resolves lacks a non-empty string for either; the resulting plugin has no `type`.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The loader awaits the result, so `create` MAY be `async`. The returned plugin MUST NOT carry a `type` discriminator.

### Requirement: Manifest and install context

The manifest `specd-plugin.json` MUST declare `schemaVersion: 2`, MUST NOT declare `pluginType`, and MUST declare one contribution of kind `agents` with the local id `claude` (`contributes: { "agents": { "claude": {} } }`), addressable as `@specd/plugin-agent-claude.claude`.

`install` and `uninstall` receive an `AgentInstallContext` (`config`, `options`, `contributions`) as defined by `plugin-manager:agent-plugin-type`. Wherever this spec refers to `config` and `options` of `install` and `uninstall`, they are `context.config` and `context.options`. The plugin declares no `configSchema`, so it accepts no plugin `config`.

### Requirement: Domain layer

The domain layer MUST contain:

- `domain/types/claude-plugin.ts` — implementation of `AgentPlugin` interface, receiving `name` and `version` via constructor (not hardcoded)
- `domain/types/frontmatter.ts` — Frontmatter type definitions
- `domain/frontmatter/index.ts` — metadata maps: `skillFrontmatter: Record<string, Frontmatter>` for skills and `agentFrontmatter` for sub-agents

The plugin class constructor MUST accept `name` and `version` as parameters.

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
   - Agents to `.claude/agents/<agent-name>.md` (flat file, only when the `agents` capability is declared)
7. Install files marked as shared to the rendered `sharedFolder` location under the project root
8. Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.
9. Sub-agent Mapping: When installing an agent, the plugin MUST:
   - Map the `allowed_tools` list into a single comma-separated string for the `tools` YAML key.
   - Read the preferred model from `specd-agent.meta.json` when that file is present for the agent and map it to the `model` YAML key. The model is optional: when no model is defined the `model` key MUST be omitted.
   - Prepend the rendered system prompt with the generated YAML frontmatter.

The plugin MUST NOT assemble the final YAML frontmatter document itself for standard skills after bundle resolution.
The plugin MUST NOT normalize capability objects on behalf of `@specd/skills`.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter injection

During install, the plugin MUST provide Claude frontmatter values to `@specd/skills` so that the rendered skill-local markdown output includes Claude-compatible YAML frontmatter.

The YAML keys of a skill's frontmatter MUST use the spelling Claude Code reads: `name`, `description`, `allowed-tools`, `argument-hint`, `disable-model-invocation` and `user-invocable` (hyphenated) and `when_to_use` and `model` (as written). The internal value collection may keep snake_case property names, but the rendered YAML MUST NOT contain `allowed_tools`, `argument_hint`, `disable_model_invocation` or `user_invocable` in a skill, because Claude Code ignores unknown keys and a misspelled `disable-model-invocation` would leave a manual-only skill invocable by the model. Agent files keep their own keys (`name`, `description`, `tools`, `model`).

The plugin MUST NOT prepend YAML frontmatter itself after bundle resolution.

Files marked as shared MUST continue to be written without Claude skill frontmatter.

The installed output MUST preserve the fast-track journal-resumability instructions and MUST include no static or unsupported frontmatter fields.

### Requirement: Install location

Skills MUST be installed to `.claude/skills/` in the project root.
Agents MUST be installed to `.claude/agents/` in the project root (when `agents` capability is supported).

For each skill or agent, files not marked as shared MUST be installed under its respective categorized directory.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Prompt Injection

`ClaudeAgentPlugin.install()` MUST inject the base agent instruction prompt into `CLAUDE.md` under the project root using `injectSpecdBlock(claudeMdPath, prompt, 'claude')`.

- The injected block is the reference-counted base block `<!-- <specd agents="claude"> -->`. No separate plugin-specific marker block is written.
- `install()` MAY pass `extraInstructions` to `renderBaseAgentInstruction` for Claude-specific guidance.
- A full `uninstall()` MUST call `removeSpecdBlock(claudeMdPath, 'claude')`, which removes only this plugin's reference; the block itself is removed when no other agent plugin references it.
- A filtered `uninstall()` (with `options.skills` or `options.agents`) MUST keep the block.

### Requirement: Uninstall behavior

`uninstall(context: AgentInstallContext)` MUST remove installed skill directories from `.claude/skills/` and agent files from `.claude/agents/` relative to `context.config.projectRoot`, honouring `context.options`.

**Filtered uninstall.** An empty `skills` or `agents` array counts as not provided. Selected names MUST be validated against the specd-managed skill and agent names: a name that is not managed (including any name with a path separator or `..`) is skipped, reported in the result of `uninstallWithResult()` (the plugin method that returns the report; `uninstall()` itself resolves to nothing, as the `AgentPlugin` contract requires), and never touches the filesystem. A full uninstall removes the managed agent files from both the runtime agents directory (when the runtime has one) and the shared folder, whatever `capabilities` it receives. When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. When `options.agents` is provided, uninstall MUST remove only the selected specd-managed agent files from `.claude/agents/`. A filtered uninstall MUST NOT remove the shared folder, any file in it (except the `<agent-name>.agent.md` files selected through `options.agents` that live there because the runtime lacks the `agents` capability; uninstall evaluates `capabilities` the way install does, and the default set includes `agents`), or the owners marker (`.owners.json`), and MUST NOT call `removeSharedOwner`. It MUST keep the `claude` reference in the prompt block of `CLAUDE.md`.

**Full uninstall.** When neither `options.skills` nor `options.agents` is provided, uninstall MUST:

1. remove all specd-managed skill directories under `.claude/skills/`, including legacy flat `<skill>.md` files left by previous versions;
2. remove all specd-managed agent files under `.claude/agents/`;
3. call `removeSpecdBlock` for `CLAUDE.md`, which drops only this plugin's `claude` reference (the block itself disappears only when no other agent plugin references it);
4. follow the uninstall protocol of `skills:shared-folder-owners` for the resolved `sharedFolder` location: call `removeSharedOwner(sharedDir, 'claude')`; when `hadMarker` is `false` (legacy install or unreadable marker) every shared file MUST be left untouched; when other owners remain every shared file MUST be left untouched; when no owner remains, delete `shared.md`, every managed `<agent>.agent.md` file and the marker, and then call `removeSharedFolderIfEmpty` so that the folder survives when foreign files remain. Errors other than `ENOTEMPTY` and `ENOENT` MUST propagate.

Uninstall MUST NOT remove unrelated directories or files under `.claude/skills/`, `.claude/agents/` or the shared folder that are not part of the specd-managed set.

### Requirement: Shared folder ownership and agent placement

Before writing the first file into the resolved `sharedFolder` location (including agent files placed there as a fallback), `install()` MUST call `addSharedOwner(sharedDir, 'claude')` from `@specd/skills`, for filtered and unfiltered installs alike, so that `skills:shared-folder-owners` can tell when the last owner leaves.

The target directory for agent files MUST be derived from the `capabilities` declared to `@specd/skills`: when they include `agents`, agents are written to `.claude/agents/`; otherwise they are written next to `shared.md` in the resolved `sharedFolder` location. The declared set normally includes `agents`, but the install routine MUST honour the fallback when it does not (so the branch is exercisable by passing a capability list without `agents`).

### Requirement: Fast-track skill installation

Claude installation MUST include `specd-fasttrack` when standard skills are installed without an explicit skill filter. It MUST resolve the skill through `ResolveBundle`, provide Claude's supported capabilities and structured frontmatter values, and write the rendered skill under the existing Claude skill-directory contract.

The installed output MUST preserve the fast-track journal-resumability instructions and MUST include no static or unsupported frontmatter fields.

### Requirement: Manual-only fast-track routing

The Claude fast-track frontmatter description MUST state that the skill is manual-only and may be used only when the user explicitly invokes `/specd-fasttrack`. Its rendered frontmatter MUST set `disable-model-invocation: true` (hyphenated, as Claude Code reads it).

## Constraints

- This plugin depends on `@specd/skills` for skill operations.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents
- [`skills:agent-instruction-template`](../skills/agent-instruction-template/spec.md) — shared base prompt rendering and block management
- [`skills:shared-folder-owners`](../skills/shared-folder-owners/spec.md) — owners marker for the shared folder
