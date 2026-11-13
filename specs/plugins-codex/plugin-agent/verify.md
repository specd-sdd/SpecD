# Verification: plugin-agent-codex:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes plugin factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available
- **AND** it returns an `AgentPlugin` or a promise of one

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-codex"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-codex"` and `version === "1.0.0"`

#### Scenario: No type discriminator

- **WHEN** `create()` is called
- **THEN** the returned plugin has no `type` property

#### Scenario: Async factory result is awaited

- **GIVEN** `create()` returns a promise
- **WHEN** the plugin loader resolves the plugin
- **THEN** the loader awaits the promise and uses the resolved `AgentPlugin`

### Requirement: Manifest and install context

#### Scenario: Manifest declares the agents contribution

- **WHEN** the manifest of the package is read
- **THEN** `schemaVersion` is `2`, `pluginType` is absent and `contributes.agents` has the id `codex`

#### Scenario: Install receives the context

- **WHEN** `install({ config, options, contributions: ['codex'] })` is called
- **THEN** the plugin installs using `config` and `options`

### Requirement: Plugin runtime contract

#### Scenario: Created plugin satisfies runtime contract

- **WHEN** `create()` is called
- **THEN** the returned plugin has no `type` property
- **AND** it exposes `install(context)` and `uninstall(context)`
- **AND** it declares only Codex-supported capability identifiers during install

#### Scenario: Codex runtime does not pass capability objects

- **WHEN** the plugin prepares install-time rendering data
- **THEN** it passes capability identifiers rather than pre-normalized capability objects

### Requirement: Skill installation and frontmatter injection

#### Scenario: Install passes Codex capability identifiers and frontmatter source values

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `install(config, options)` runs
- **THEN** the plugin passes Codex capability identifiers and frontmatter source values into `@specd/skills`
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Install routes shared files to the rendered sharedFolder location

- **GIVEN** a resolved bundle contains files marked as shared and non-shared
- **WHEN** `install(config, options)` writes files
- **THEN** shared files are written to the rendered sharedFolder location under the project root
- **AND** non-shared files are written under `.codex/skills/<skill-name>/`
- **AND** shared files do not receive frontmatter

#### Scenario: Codex install does not call repository bundle resolution directly

- **WHEN** the Codex install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Frontmatter field contract

#### Scenario: Codex value model limits fields to supported keys

- **WHEN** frontmatter values are generated for a skill file
- **THEN** only `name` and `description` are represented
- **AND** unsupported keys are excluded

#### Scenario: Unsupported Codex keys are absent from represented values

- **WHEN** a field outside the Codex-supported set is considered
- **THEN** it is not included in the Codex frontmatter value collection

### Requirement: Install location

#### Scenario: Skills are written under Codex directory and sharedFolder default

- **WHEN** install writes skill files
- **THEN** files are created only under `.codex/skills/` within the target project root
- **AND** shared files are written to the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Installs agents to categorized directory

- **GIVEN** a request to install an agent
- **WHEN** `install(config, options)` runs
- **THEN** it installs the agent files to `.codex/agents/`
- **AND** the files use the `.toml` extension
- **AND** the content contains the `developer_instructions` TOML key
- **AND** the instructions are wrapped in a multi-line string

#### Scenario: Fallback to shared location when agents capability is missing

- **GIVEN** a runtime that does not support `agents`
- **WHEN** an agent is installed
- **THEN** it is copied to the same directory as `shared.md`

### Requirement: Prompt Injection

#### Scenario: Install writes AGENTS.md prompt block

- **WHEN** `CodexAgentPlugin.install()` runs
- **THEN** `AGENTS.md` contains the shared specd base block referencing `codex`
- **AND** `AGENTS.md` does NOT contain any `<!-- <specd-plugin:codex> -->` marker block

#### Scenario: Uninstall keeps the shared block while another plugin references it

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `codex` and another agent plugin
- **WHEN** `CodexAgentPlugin.uninstall()` runs
- **THEN** the `codex` reference is removed
- **AND** the shared base block remains in `AGENTS.md`

#### Scenario: Uninstall removes the shared block when last reference is dropped

- **GIVEN** `AGENTS.md` contains the shared base block referenced only by `codex`
- **WHEN** `CodexAgentPlugin.uninstall()` runs
- **THEN** the base block is removed from `AGENTS.md`

#### Scenario: Filtered uninstall keeps the shared block

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `codex`
- **WHEN** `CodexAgentPlugin.uninstall()` runs with `options.skills`
- **THEN** the block remains in `AGENTS.md`

#### Scenario: Legacy plugin marker purged on uninstall

- **GIVEN** `AGENTS.md` contains a legacy `<!-- <specd-plugin:codex> -->` block from a previous install
- **WHEN** `CodexAgentPlugin.uninstall()` runs
- **THEN** the `<!-- <specd-plugin:codex> -->` block is removed

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.codex/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.codex/skills/`
- **WHEN** `uninstall({ config, options: {}, contributions: ['codex'] })` is executed
- **THEN** all specd-managed skill directories are removed, including legacy flat `<skill>.md` files
- **AND** unrelated user skill directories remain
- **AND** the shared folder is handled by the owners protocol (see "Shared folder ownership and agent placement")

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.codex/agents/specd-project-context-optimizer.toml` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.codex/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain

#### Scenario: Filtered uninstall keeps the prompt block and the owners marker

- **GIVEN** the plugin is installed and is an owner of the shared folder
- **WHEN** `uninstall` runs with `options.skills` or `options.agents`
- **THEN** the `codex` reference in `AGENTS.md` is kept
- **AND** `.owners.json` and every shared file are unchanged

### Requirement: Shared folder ownership and agent placement

#### Scenario: create rejects a manifest without name or version

- **GIVEN** the resolved `specd-plugin.json` has no non-empty string `name` or `version`
- **WHEN** `create` is called
- **THEN** `PluginValidationError` is thrown with the field `specd-plugin.json: name` or `specd-plugin.json: version`

#### Scenario: Install registers the plugin as shared-folder owner

- **WHEN** `install` writes files into the shared folder
- **THEN** `.owners.json` lists `codex`

#### Scenario: Filtered install also registers the owner

- **WHEN** `install` runs with a `skills` filter and writes a shared file
- **THEN** `.owners.json` lists `codex`

#### Scenario: Owner registered before the first shared write

- **GIVEN** the first write into the shared folder fails
- **WHEN** `install` rejects
- **THEN** `.owners.json` already lists `codex`
- **AND** a later full uninstall releases the owner and removes the shared folder when it was the last owner

#### Scenario: Filtered uninstall removes only the selected agent file in the shared folder

- **GIVEN** the runtime lacks the `agents` capability so agent files live in the shared folder
- **WHEN** `uninstall` runs with `options.agents` selecting one agent
- **THEN** only that `<agent-name>.agent.md` is removed from the shared folder
- **AND** every other shared file and `.owners.json` remain, and `removeSharedOwner` is not called

#### Scenario: Other owners keep the shared files

- **GIVEN** `codex` and another agent plugin are owners of the shared folder
- **WHEN** `codex` is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain
- **AND** `.owners.json` lists only the other plugin

#### Scenario: Last owner removes shared files and the empty folder

- **GIVEN** `codex` is the only owner and the folder holds only specd files and the marker
- **WHEN** `codex` is fully uninstalled
- **THEN** `shared.md`, the agent files and `.owners.json` are deleted
- **AND** the shared folder itself no longer exists

#### Scenario: Foreign file keeps the shared folder

- **GIVEN** `codex` is the only owner and the folder also contains `notes.txt`
- **WHEN** `codex` is fully uninstalled
- **THEN** the specd shared files and the marker are deleted
- **AND** `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes no shared file

- **GIVEN** a shared folder with `shared.md` and no `.owners.json`
- **WHEN** `codex` is fully uninstalled
- **THEN** `shared.md` still exists

#### Scenario: Agents go next to shared.md when agents capability is missing

- **GIVEN** the install is run with a capability list that does not include `agents`
- **WHEN** an agent is installed
- **THEN** the agent file is written to the shared folder next to `shared.md` and not to `.codex/agents/`

### Requirement: Fast-track skill installation

#### Scenario: Default Codex installation renders fast-track

- **GIVEN** no explicit skill filter
- **WHEN** Codex installs available standard skills
- **THEN** `.codex/skills/specd-fasttrack/SKILL.md` is written from `ResolveBundle`
- **AND** its frontmatter includes only `name` and `description`
- **AND** its content requires incremental journal updates for resumability

### Requirement: Manual-only fast-track routing

#### Scenario: Installing fast-track for Codex

- **WHEN** the Codex plugin renders fast-track frontmatter
- **THEN** the description states that explicit `/specd-fasttrack` invocation is required
