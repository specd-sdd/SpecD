# Verification: plugin-agent-standard:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes named create factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available
- **AND** it returns an `AgentPlugin` or a promise of one

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-standard"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-standard"` and `version === "1.0.0"`

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
- **THEN** `schemaVersion` is `2`, `pluginType` is absent and `contributes.agents` has the id `standard`

#### Scenario: Install receives the context

- **WHEN** `install({ config, options, contributions: ['standard'] })` is called
- **THEN** the plugin installs using `config` and `options`

### Requirement: Domain layer

#### Scenario: Domain contract defines runtime and frontmatter types

- **WHEN** domain types are inspected
- **THEN** a plugin runtime type implementing `AgentPlugin` is defined, receiving `name` and `version` via constructor
- **AND** an Agent Skills standard frontmatter type is defined with supported keys
- **AND** a per-skill frontmatter map keyed by skill name is defined

### Requirement: Frontmatter type contract

#### Scenario: Frontmatter value model enforces supported field set

- **WHEN** frontmatter values are generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, `metadata`, and `allowed-tools` are represented only when configured
- **AND** unknown fields are not represented

#### Scenario: allowed-tools uses hyphen not underscore

- **WHEN** frontmatter values are generated with pre-approved tools configured
- **THEN** the represented key is `allowed-tools`
- **AND** the value is a space-separated string per the agentskills.io specification

### Requirement: Frontmatter injection

#### Scenario: Install passes Agent Skills capability identifiers and frontmatter source values

- **WHEN** skill markdown files are written during install
- **THEN** the plugin supplies Agent Skills capability identifiers and structured frontmatter values to `@specd/skills`
- **AND** the rendered markdown includes only the Agent Skills standard-supported fields

#### Scenario: Shared files do not receive skill frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** install writes those files
- **THEN** shared files are written without Agent Skills standard frontmatter

### Requirement: Install location

#### Scenario: Skills install into agents directory and sharedFolder default

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install writes skill files
- **THEN** non-shared files are created under `.agents/skills/<skill-name>/`
- **AND** shared files are created under the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Fallback to shared location for agents

- **GIVEN** a request to install an agent
- **WHEN** `install(config, options)` runs
- **THEN** it copies the agent to the same directory as `shared.md` (since `agents` capability is not supported)

### Requirement: Prompt Injection

#### Scenario: Install writes AGENTS.md prompt block

- **WHEN** `StandardAgentPlugin.install()` runs
- **THEN** `AGENTS.md` contains the shared specd base block referencing `standard`
- **AND** `AGENTS.md` does NOT contain any `<!-- <specd-plugin:standard> -->` marker block

#### Scenario: Uninstall keeps the shared block while another plugin references it

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `standard` and another agent plugin
- **WHEN** `StandardAgentPlugin.uninstall()` runs
- **THEN** the `standard` reference is removed
- **AND** the shared base block remains in `AGENTS.md`

#### Scenario: Uninstall removes the shared block when last reference is dropped

- **GIVEN** `AGENTS.md` contains the shared base block referenced only by `standard`
- **WHEN** `StandardAgentPlugin.uninstall()` runs
- **THEN** the base block is removed from `AGENTS.md`

#### Scenario: Filtered uninstall keeps the shared block

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `standard`
- **WHEN** `StandardAgentPlugin.uninstall()` runs with `options.skills`
- **THEN** the block remains in `AGENTS.md`

#### Scenario: Legacy plugin marker purged on uninstall

- **GIVEN** `AGENTS.md` contains a legacy `<!-- <specd-plugin:standard> -->` block from a previous install
- **WHEN** `StandardAgentPlugin.uninstall()` runs
- **THEN** the `<!-- <specd-plugin:standard> -->` block is removed

### Requirement: allowed-tools configuration

#### Scenario: Each skill has appropriate tool declarations

- **WHEN** the per-skill frontmatter map is inspected
- **THEN** every skill entry that requires file or command operations has a non-empty `allowed-tools` string
- **AND** tool strings include at minimum `Read` and `Bash(node *)` where applicable
- **AND** every `Bash(...)` pattern uses the space style and none uses the colon style

#### Scenario: specd-compliance declares the command tools

- **WHEN** the `specd-compliance` entry is inspected
- **THEN** its `allowed-tools` contains `Bash(node *)`, `Bash(pnpm *)`, `Bash(git *)` and `Bash(gh *)`

### Requirement: Project init wizard integration

#### Scenario: Wizard exposes Agent Skills standard plugin option

- **WHEN** interactive `specd project init` renders plugin choices
- **THEN** `@specd/plugin-agent-standard` appears in the known agent plugin options

### Requirement: Meta package inclusion

#### Scenario: Meta package depends on Agent Skills standard plugin

- **WHEN** `packages/specd/package.json` dependencies are inspected
- **THEN** `@specd/plugin-agent-standard` is declared as a `workspace:*` dependency

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skills when filter is provided

- **GIVEN** a `SpecdConfig` and multiple skills installed under `.agents/skills/`
- **WHEN** `uninstall({ config, options: { skills: ['specd-design'] }, contributions })` is executed
- **THEN** only the selected specd-managed skill directories are removed
- **AND** the shared folder, the owners marker and the shared files remain

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.agents/skills/`
- **WHEN** `uninstall({ config, options: {}, contributions: ['standard'] })` is executed
- **THEN** all specd-managed skill directories are removed, including legacy flat `<skill>.md` files
- **AND** unrelated user skill directories remain
- **AND** the shared folder is handled by the owners protocol (see "Shared folder ownership and agent placement")

#### Scenario: Uninstall removes selected agent files from the shared folder

- **GIVEN** agent files `<shared>/a.agent.md` and `<shared>/b.agent.md` and `shared.md` are installed
- **WHEN** `uninstall` runs with `options.agents: ['a']`
- **THEN** only `<shared>/a.agent.md` is removed
- **AND** `shared.md`, `b.agent.md` and `.owners.json` remain

#### Scenario: Filtered uninstall keeps the prompt block and the owners marker

- **GIVEN** the plugin is installed and is an owner of the shared folder
- **WHEN** `uninstall` runs with `options.skills`
- **THEN** the `standard` reference in `AGENTS.md` is kept
- **AND** `.owners.json` and every shared file are unchanged

### Requirement: Shared folder ownership and agent placement

#### Scenario: create rejects a manifest without name or version

- **GIVEN** the resolved `specd-plugin.json` has no non-empty string `name` or `version`
- **WHEN** `create` is called
- **THEN** `PluginValidationError` is thrown with the field `specd-plugin.json: name` or `specd-plugin.json: version`

#### Scenario: Install registers the plugin as shared-folder owner

- **WHEN** `install` writes files into the shared folder
- **THEN** `.owners.json` lists `standard`

#### Scenario: Filtered install also registers the owner

- **WHEN** `install` runs with a `skills` filter and writes a shared file
- **THEN** `.owners.json` lists `standard`

#### Scenario: Owner registered before the first shared write

- **GIVEN** the first write into the shared folder fails
- **WHEN** `install` rejects
- **THEN** `.owners.json` already lists `standard`
- **AND** a later full uninstall releases the owner and removes the shared folder when it was the last owner

#### Scenario: Other owners keep the shared files

- **GIVEN** `standard` and another agent plugin are owners of the shared folder
- **WHEN** `standard` is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain
- **AND** `.owners.json` lists only the other plugin

#### Scenario: Last owner removes shared files and the empty folder

- **GIVEN** `standard` is the only owner and the folder holds only specd files and the marker
- **WHEN** `standard` is fully uninstalled
- **THEN** `shared.md`, the agent files and `.owners.json` are deleted
- **AND** the shared folder itself no longer exists

#### Scenario: Foreign file keeps the shared folder

- **GIVEN** `standard` is the only owner and the folder also contains `notes.txt`
- **WHEN** `standard` is fully uninstalled
- **THEN** the specd shared files and the marker are deleted
- **AND** `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes no shared file

- **GIVEN** a shared folder with `shared.md` and no `.owners.json`
- **WHEN** `standard` is fully uninstalled
- **THEN** `shared.md` still exists

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves capability identifiers and frontmatter source values, and passes them into `@specd/skills`
- **AND** shared-marked files are written to the rendered sharedFolder location under the project root
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Agent Skills standard application layer does not prepend YAML after resolution

- **WHEN** the Agent Skills standard install flow is reviewed
- **THEN** the plugin does not assemble a final YAML frontmatter block after bundle resolution

#### Scenario: Standard-agent install does not call repository bundle resolution directly

- **WHEN** the Agent Skills standard install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Fast-track skill installation

#### Scenario: Default Standard installation declares fast-track tools

- **GIVEN** no explicit skill filter
- **WHEN** the Agent Skills Standard plugin installs available standard skills
- **THEN** `.agents/skills/specd-fasttrack/SKILL.md` is written from `ResolveBundle`
- **AND** its frontmatter declares the required `allowed-tools` value
- **AND** instructions needing unsupported capabilities are absent

### Requirement: Manual-only fast-track routing

#### Scenario: Installing fast-track for an Agent Skills standard client

- **WHEN** the standard plugin renders fast-track frontmatter
- **THEN** the description states that explicit `/specd-fasttrack` invocation is required
