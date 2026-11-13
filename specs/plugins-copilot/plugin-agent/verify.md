# Verification: plugin-agent-copilot:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes plugin factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available
- **AND** it returns an `AgentPlugin` or a promise of one

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-copilot"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-copilot"` and `version === "1.0.0"`

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
- **THEN** `schemaVersion` is `2`, `pluginType` is absent and `contributes.agents` has the id `copilot`

#### Scenario: Install receives the context

- **WHEN** `install({ config, options, contributions: ['copilot'] })` is called
- **THEN** the plugin installs using `config` and `options`

### Requirement: Plugin runtime contract

#### Scenario: Created plugin satisfies runtime contract

- **WHEN** `create()` is called
- **THEN** the returned plugin has no `type` property
- **AND** it exposes `install(context)` and `uninstall(context)`
- **AND** it declares only Copilot-supported capability identifiers during install

#### Scenario: Copilot runtime does not pass capability objects

- **WHEN** the plugin prepares install-time rendering data
- **THEN** it passes capability identifiers rather than pre-normalized capability objects

### Requirement: Skill installation and frontmatter injection

#### Scenario: Install passes Copilot capability identifiers and frontmatter source values

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `install(config, options)` runs
- **THEN** the plugin passes Copilot capability identifiers and frontmatter source values into `@specd/skills`
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Install routes shared files to the rendered sharedFolder location

- **GIVEN** a resolved bundle contains files marked as shared and non-shared
- **WHEN** `install(config, options)` writes files
- **THEN** shared files are written to the rendered sharedFolder location under the project root
- **AND** non-shared files are written under the Copilot skill install directory
- **AND** shared files do not receive frontmatter

#### Scenario: Copilot install does not call repository bundle resolution directly

- **WHEN** the Copilot install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Frontmatter field contract

#### Scenario: Copilot value model supports full declared field set

- **WHEN** frontmatter values are generated for a skill file
- **THEN** `name` and `description` are always representable
- **AND** `license`, `allowed-tools`, `user-invocable`, and `disable-model-invocation` are represented only when configured
- **AND** unsupported keys are excluded

#### Scenario: Unsupported Copilot keys are absent from represented values

- **WHEN** a field outside the Copilot-supported set is considered
- **THEN** it is not included in the Copilot frontmatter value collection

### Requirement: Install location

#### Scenario: Skills are written under GitHub skills directory and sharedFolder default

- **WHEN** install writes skill files
- **THEN** files are created only under `.github/skills/` within the target project root
- **AND** shared files are written to the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Installs agent profiles to .github/agents/

- **GIVEN** a request to install an agent
- **WHEN** `install(config, options)` runs
- **THEN** it copies the agent to `.github/agents/` (since `agents` capability is supported)
- **AND** the file uses the `.agent.md` extension
- **AND** the YAML frontmatter contains `tools` as a list

### Requirement: Prompt Injection

#### Scenario: Install writes copilot-instructions.md prompt block

- **WHEN** `CopilotAgentPlugin.install()` runs
- **THEN** `.github/copilot-instructions.md` contains the reference-counted block `<!-- <specd agents="copilot"> -->`

#### Scenario: Uninstall cleans up copilot prompt block

- **GIVEN** `copilot` is the only plugin referencing the block
- **WHEN** a full `CopilotAgentPlugin.uninstall()` runs
- **THEN** the specd block is removed from `.github/copilot-instructions.md`

#### Scenario: Filtered uninstall keeps the copilot prompt block

- **WHEN** `CopilotAgentPlugin.uninstall()` runs with `options.skills`
- **THEN** the block in `.github/copilot-instructions.md` is kept

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.github/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.github/skills/`
- **WHEN** `uninstall({ config, options: {}, contributions: ['copilot'] })` is executed
- **THEN** all specd-managed skill directories are removed, including legacy flat `<skill>.md` files
- **AND** unrelated user skill directories remain
- **AND** the shared folder is handled by the owners protocol (see "Shared folder ownership and agent placement")

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.github/agents/specd-project-context-optimizer.agent.md` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.github/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain

#### Scenario: Filtered uninstall keeps the prompt block and the owners marker

- **GIVEN** the plugin is installed and is an owner of the shared folder
- **WHEN** `uninstall` runs with `options.skills` or `options.agents`
- **THEN** the `copilot` reference in `.github/copilot-instructions.md` is kept
- **AND** `.owners.json` and every shared file are unchanged

### Requirement: Shared folder ownership and agent placement

#### Scenario: create rejects a manifest without name or version

- **GIVEN** the resolved `specd-plugin.json` has no non-empty string `name` or `version`
- **WHEN** `create` is called
- **THEN** `PluginValidationError` is thrown with the field `specd-plugin.json: name` or `specd-plugin.json: version`

#### Scenario: Install registers the plugin as shared-folder owner

- **WHEN** `install` writes files into the shared folder
- **THEN** `.owners.json` lists `copilot`

#### Scenario: Filtered install also registers the owner

- **WHEN** `install` runs with a `skills` filter and writes a shared file
- **THEN** `.owners.json` lists `copilot`

#### Scenario: Owner registered before the first shared write

- **GIVEN** the first write into the shared folder fails
- **WHEN** `install` rejects
- **THEN** `.owners.json` already lists `copilot`
- **AND** a later full uninstall releases the owner and removes the shared folder when it was the last owner

#### Scenario: Filtered uninstall removes only the selected agent file in the shared folder

- **GIVEN** the runtime lacks the `agents` capability so agent files live in the shared folder
- **WHEN** `uninstall` runs with `options.agents` selecting one agent
- **THEN** only that `<agent-name>.agent.md` is removed from the shared folder
- **AND** every other shared file and `.owners.json` remain, and `removeSharedOwner` is not called

#### Scenario: Other owners keep the shared files

- **GIVEN** `copilot` and another agent plugin are owners of the shared folder
- **WHEN** `copilot` is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain
- **AND** `.owners.json` lists only the other plugin

#### Scenario: Last owner removes shared files and the empty folder

- **GIVEN** `copilot` is the only owner and the folder holds only specd files and the marker
- **WHEN** `copilot` is fully uninstalled
- **THEN** `shared.md`, the agent files and `.owners.json` are deleted
- **AND** the shared folder itself no longer exists

#### Scenario: Foreign file keeps the shared folder

- **GIVEN** `copilot` is the only owner and the folder also contains `notes.txt`
- **WHEN** `copilot` is fully uninstalled
- **THEN** the specd shared files and the marker are deleted
- **AND** `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes no shared file

- **GIVEN** a shared folder with `shared.md` and no `.owners.json`
- **WHEN** `copilot` is fully uninstalled
- **THEN** `shared.md` still exists

#### Scenario: Agents go next to shared.md when agents capability is missing

- **GIVEN** the install is run with a capability list that does not include `agents`
- **WHEN** an agent is installed
- **THEN** the agent file is written to the shared folder next to `shared.md` and not to `.github/agents/`

### Requirement: Fast-track skill installation

#### Scenario: Copilot omits unsupported fast-track branches

- **GIVEN** no explicit skill filter
- **WHEN** Copilot installs available standard skills
- **THEN** its fast-track skill is rendered and installed through `ResolveBundle`
- **AND** runtime-specific frontmatter contains no unsupported fields
- **AND** instructions requiring unavailable capabilities are absent

### Requirement: Manual-only fast-track routing

#### Scenario: Installing fast-track for Copilot

- **WHEN** the Copilot plugin renders fast-track frontmatter
- **THEN** the description states that explicit `/specd-fasttrack` invocation is required
- **AND** `disable-model-invocation` is true
