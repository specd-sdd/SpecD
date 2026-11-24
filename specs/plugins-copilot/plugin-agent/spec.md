# plugin-agent-copilot:plugin-agent

## Purpose

This spec defines the Copilot plugin contract for concrete install/uninstall behavior, project install location, and exact metadata value support so agent skills are rendered through `@specd/skills` and remain usable directly in Copilot workflows.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin | Promise<AgentPlugin>` as default or named export. `create` MUST read `name` and `version` from the package `specd-plugin.json` and MUST throw `PluginValidationError` (fields `specd-plugin.json: name` or `specd-plugin.json: version`) when the manifest it resolves lacks a non-empty string for either; the resulting plugin has no `type`.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The loader awaits the result, so `create` MAY be `async`. The returned plugin MUST NOT carry a `type` discriminator.

### Requirement: Manifest and install context

The manifest `specd-plugin.json` MUST declare `schemaVersion: 2`, MUST NOT declare `pluginType`, and MUST declare one contribution of kind `agents` with the local id `copilot` (`contributes: { "agents": { "copilot": {} } }`), addressable as `@specd/plugin-agent-copilot.copilot`.

`install` and `uninstall` receive an `AgentInstallContext` (`config`, `options`, `contributions`) as defined by `plugin-manager:agent-plugin-type`. Wherever this spec refers to `config` and `options` of `install` and `uninstall`, they are `context.config` and `context.options`. The plugin declares no `configSchema`, so it accepts no plugin `config`.

### Requirement: Plugin runtime contract

The implementation MUST return a valid `AgentPlugin` that:

- has `name` and `version` sourced from `specd-plugin.json` via the factory — not hardcoded in the class
- implements `install(context)` and `uninstall(context)` with real filesystem behavior, using `context.config` and `context.options`
- uses a stable structured metadata value model for generated skill files
- declares only Copilot-supported capability identifiers to `@specd/skills`

### Requirement: Skill installation and frontmatter injection

The plugin MUST install skills from `@specd/skills` and pass Copilot-compatible capability identifiers (`['frontmatter', 'agents']`) plus frontmatter source values into markdown skill rendering during install.

Installation flow MUST:

1. load requested skills (or all skills when no filter is provided)
2. resolve structured frontmatter source values for each skill
3. declare only the Copilot-supported capability identifiers for each skill
4. resolve bundles through `ResolveBundle` so built-in render defaults are supplied by `@specd/skills`
5. pass `variables.sharedFolder` only when overriding the default shared path contract
6. write files marked as shared to the rendered `sharedFolder` location under the project root
7. write files not marked as shared to categorized directories relative to `projectRoot`:
   - Skills to `.github/skills/<skill-name>/`
   - Agents to `.github/agents/<agent-name>.agent.md`
8. Sub-agent Mapping: When installing an agent, the plugin MUST:
   - Use the `.agent.md` suffix.
   - Emit `tools` as a YAML list of strings.
   - Prepend the rendered system prompt with the generated YAML frontmatter.
9. rely on the rendered markdown returned by `@specd/skills` for non-shared markdown files
10. return an `InstallResult` with installed and skipped entries

The plugin MUST NOT prepend YAML frontmatter for standard skills after bundle resolution.
The plugin MUST NOT call `SkillRepository.getBundle(...)` directly from the install flow when `ResolveBundle` is available.
The plugin MUST NOT use a `buildCapabilities` helper; capability arrays MUST be passed as literals or constants.

### Requirement: Frontmatter field contract

The Copilot frontmatter value contract for skills MUST cover this exact supported set:

- required: `name`, `description`
- optional core field: `license`
- optional CLI-supported fields: `allowed-tools`, `user-invocable`, `disable-model-invocation`

Fields outside this set MUST NOT be represented in the Copilot frontmatter value collection by default. This field set applies to skills. Agent entries MAY additionally carry `allowed-tools` (comma-separated tool names, split only on top-level commas so a comma inside parentheses stays in its pattern), which `install()` emits as the `tools` YAML list of strings of the generated agent file; it is never written to a skill's frontmatter.

### Requirement: Install location

Project-level skill installation MUST target `.github/skills/` under the `projectRoot` provided in `SpecdConfig`.

For each skill, files not marked as shared MUST be installed under `.github/skills/<skill-name>/`.

Files marked as shared MUST be installed under the rendered `sharedFolder` location within the project root. When no override is provided, that location MUST default to a relative path derived from the runtime config directory.

The resolved shared location MUST NOT contain a `SKILL.md` file.

### Requirement: Prompt Injection

`CopilotAgentPlugin.install()` MUST inject the base agent instruction prompt into `.github/copilot-instructions.md` under the project root using `injectSpecdBlock(path, prompt, 'copilot')`.

- The injected block is the reference-counted base block `<!-- <specd agents="copilot"> -->`. No separate plugin-specific marker block is written.
- A full `uninstall()` MUST call `removeSpecdBlock(path, 'copilot')`, which removes only this plugin's reference; the block itself is removed when no other agent plugin references it.
- A filtered `uninstall()` (with `options.skills` or `options.agents`) MUST keep the block.

### Requirement: Uninstall behavior

`uninstall(context: AgentInstallContext)` MUST remove installed skill directories from `.github/skills/` and agent files from `.github/agents/` relative to `context.config.projectRoot`, honouring `context.options`.

**Filtered uninstall.** An empty `skills` or `agents` array counts as not provided. Selected names MUST be validated against the specd-managed skill and agent names: a name that is not managed (including any name with a path separator or `..`) is skipped, reported in the result of `uninstallWithResult()` (the plugin method that returns the report; `uninstall()` itself resolves to nothing, as the `AgentPlugin` contract requires), and never touches the filesystem. A full uninstall removes the managed agent files from both the runtime agents directory (when the runtime has one) and the shared folder, whatever `capabilities` it receives. When `options.skills` is provided, uninstall MUST remove only the selected specd-managed skill directories. When `options.agents` is provided, uninstall MUST remove only the selected specd-managed agent files from `.github/agents/`. A filtered uninstall MUST NOT remove the shared folder, any file in it (except the `<agent-name>.agent.md` files selected through `options.agents` that live there because the runtime lacks the `agents` capability; uninstall evaluates `capabilities` the way install does, and the default set includes `agents`), or the owners marker (`.owners.json`), and MUST NOT call `removeSharedOwner`. It MUST keep the `copilot` reference in the prompt block of `.github/copilot-instructions.md`.

**Full uninstall.** When neither `options.skills` nor `options.agents` is provided, uninstall MUST:

1. remove all specd-managed skill directories under `.github/skills/`, including legacy flat `<skill>.md` files left by previous versions;
2. remove all specd-managed agent files under `.github/agents/`;
3. call `removeSpecdBlock` for `.github/copilot-instructions.md`, which drops only this plugin's `copilot` reference (the block itself disappears only when no other agent plugin references it);
4. follow the uninstall protocol of `skills:shared-folder-owners` for the resolved `sharedFolder` location: call `removeSharedOwner(sharedDir, 'copilot')`; when `hadMarker` is `false` (legacy install or unreadable marker) every shared file MUST be left untouched; when other owners remain every shared file MUST be left untouched; when no owner remains, delete `shared.md`, every managed `<agent>.agent.md` file and the marker, and then call `removeSharedFolderIfEmpty` so that the folder survives when foreign files remain. Errors other than `ENOTEMPTY` and `ENOENT` MUST propagate.

Uninstall MUST NOT remove unrelated directories or files under `.github/skills/`, `.github/agents/` or the shared folder that are not part of the specd-managed set.

### Requirement: Shared folder ownership and agent placement

Before writing the first file into the resolved `sharedFolder` location (including agent files placed there as a fallback), `install()` MUST call `addSharedOwner(sharedDir, 'copilot')` from `@specd/skills`, for filtered and unfiltered installs alike, so that `skills:shared-folder-owners` can tell when the last owner leaves.

The target directory for agent files MUST be derived from the `capabilities` declared to `@specd/skills`: when they include `agents`, agents are written to `.github/agents/`; otherwise they are written next to `shared.md` in the resolved `sharedFolder` location. The declared set normally includes `agents`, but the install routine MUST honour the fallback when it does not (so the branch is exercisable by passing a capability list without `agents`).

### Requirement: Fast-track skill installation

Copilot installation MUST include `specd-fasttrack` when standard skills are installed without an explicit skill filter. It MUST resolve the skill through `ResolveBundle`, provide only Copilot-supported capabilities and structured frontmatter values, and write the rendered skill under the existing Copilot skill-directory contract.

Runtime branches that need unavailable capabilities MUST be omitted rather than represented as executable instructions, and shared output MUST remain free of skill frontmatter.

### Requirement: Manual-only fast-track routing

The Copilot fast-track frontmatter description MUST state that the skill is manual-only and may be used only when the user explicitly invokes `/specd-fasttrack`. Its frontmatter MUST set `disable-model-invocation: true`.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill operations.
- The plugin MUST implement concrete install and uninstall behavior.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-bundle`](../skills/skill-bundle/spec.md) — shared bundle file routing contract
- [`skills:skill-templates-source`](../skills/skill-templates-source/spec.md) — source of the bundled skill templates consumed through the skill repository, like the other agent plugins
- [`skills:resolve-bundle`](../skills/resolve-bundle/spec.md) — canonical install-time bundle resolution
- [`skills:agents`](../skills/agents/spec.md) — defines specialized optimizer agents
- [`skills:agent-instruction-template`](../skills/agent-instruction-template/spec.md) — shared base prompt rendering and block management
- [`skills:shared-folder-owners`](../skills/shared-folder-owners/spec.md) — owners marker for the shared folder
