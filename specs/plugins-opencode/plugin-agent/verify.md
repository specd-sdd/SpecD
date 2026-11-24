# Verification: plugin-agent-opencode:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes named create factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available
- **AND** it returns an `AgentPlugin` or a promise of one

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-opencode"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-opencode"` and `version === "1.0.0"`

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
- **THEN** `schemaVersion` is `2`, `pluginType` is absent and `contributes.agents` has the id `opencode`

#### Scenario: Install receives the context

- **WHEN** `install({ config, options, contributions: ['opencode'] })` is called
- **THEN** the plugin installs using `config` and `options`

### Requirement: Domain layer

#### Scenario: Domain contract defines runtime and frontmatter types

- **WHEN** domain types are inspected
- **THEN** a plugin runtime type implementing `AgentPlugin` is defined, receiving `name` and `version` via constructor
- **AND** an Open Code frontmatter type is defined with supported keys
- **AND** a per-skill frontmatter map keyed by skill name is defined

### Requirement: Frontmatter type contract

#### Scenario: Frontmatter value model enforces supported field set

- **WHEN** frontmatter values are generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, and `metadata` are represented only when configured
- **AND** unknown fields are not represented

#### Scenario: Unsupported Open Code metadata keys stay out of the value collection

- **WHEN** unsupported metadata is proposed for Open Code frontmatter
- **THEN** it is not represented in the Open Code frontmatter value collection

### Requirement: Frontmatter injection

#### Scenario: Install passes Open Code capability identifiers and frontmatter source values

- **WHEN** skill markdown files are written during install
- **THEN** the plugin supplies Open Code capability identifiers and structured frontmatter values to `@specd/skills`
- **AND** the rendered markdown includes only the configured Open Code-supported fields

#### Scenario: Shared files do not receive skill frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** install writes those files
- **THEN** shared files are written without Open Code skill frontmatter

### Requirement: Install location

#### Scenario: Skills install into Open Code directory and sharedFolder default

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install writes skill files
- **THEN** non-shared files are created under `.opencode/skills/<skill-name>/`
- **AND** shared files are created under the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Installs agents to categorized directory

- **GIVEN** a request to install an agent
- **WHEN** `install({ config, options, contributions })` runs
- **THEN** it installs the agent files to `.opencode/agents/`
- **AND** the YAML frontmatter contains `mode: subagent`
- **AND** the YAML frontmatter contains the singular key `permission` as a map derived from `allowedTools`

#### Scenario: Bash pattern restrictions are preserved

- **GIVEN** an agent whose `allowedTools` contain `Bash(node *)` and `Bash(specd *)`
- **WHEN** the agent is installed
- **THEN** `permission.bash` is a map with the patterns `"node *"` and `"specd *"` set to `allow`
- **AND** no key is duplicated in `permission`

#### Scenario: Plain tools map to allow

- **GIVEN** an agent whose `allowedTools` contain `Read`
- **WHEN** the agent is installed
- **THEN** `permission.read` is `allow`

#### Scenario: Fallback to shared location when agents capability is missing

- **GIVEN** a runtime that does not support `agents`
- **WHEN** an agent is installed
- **THEN** it is copied to the same directory as `shared.md`

### Requirement: Prompt Injection

#### Scenario: Install writes AGENTS.md prompt block

- **WHEN** `OpenCodeAgentPlugin.install()` runs
- **THEN** `AGENTS.md` contains the shared specd base block referencing `opencode`
- **AND** `AGENTS.md` does NOT contain any `<!-- <specd-plugin:opencode> -->` marker block

#### Scenario: Uninstall keeps the shared block while another plugin references it

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `opencode` and another agent plugin
- **WHEN** `OpenCodeAgentPlugin.uninstall()` runs
- **THEN** the `opencode` reference is removed
- **AND** the shared base block remains in `AGENTS.md`

#### Scenario: Uninstall removes the shared block when last reference is dropped

- **GIVEN** `AGENTS.md` contains the shared base block referenced only by `opencode`
- **WHEN** `OpenCodeAgentPlugin.uninstall()` runs
- **THEN** the base block is removed from `AGENTS.md`

#### Scenario: Filtered uninstall keeps the shared block

- **GIVEN** `AGENTS.md` contains the shared base block referenced by `opencode`
- **WHEN** `OpenCodeAgentPlugin.uninstall()` runs with `options.skills`
- **THEN** the block remains in `AGENTS.md`

#### Scenario: Legacy plugin marker removed on install

- **GIVEN** `AGENTS.md` contains a legacy `<!-- <specd-plugin:opencode> -->` block from a previous install
- **WHEN** `OpenCodeAgentPlugin.install()` runs
- **THEN** the `<!-- <specd-plugin:opencode> -->` block is removed
- **AND** the shared base block is present

### Requirement: Project init wizard integration

#### Scenario: Wizard exposes Open Code plugin option

- **WHEN** interactive `specd project init` renders plugin choices
- **THEN** `@specd/plugin-agent-opencode` appears in the known agent plugin options

### Requirement: Meta package inclusion

#### Scenario: Meta package depends on Open Code plugin

- **WHEN** `packages/specd/package.json` dependencies are inspected
- **THEN** `@specd/plugin-agent-opencode` is declared as a `workspace:*` dependency

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skills when filter is provided

- **GIVEN** a `SpecdConfig` and multiple skills installed under `.opencode/skills/`
- **WHEN** `uninstall({ config, options: { skills: ['specd-design'] }, contributions })` is executed
- **THEN** only the selected specd-managed skill directories are removed
- **AND** the shared folder, the owners marker and the shared files remain

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.opencode/skills/`
- **WHEN** `uninstall({ config, options: {}, contributions: ['opencode'] })` is executed
- **THEN** all specd-managed skill directories are removed, including legacy flat `<skill>.md` files
- **AND** unrelated user skill directories remain
- **AND** the shared folder is handled by the owners protocol (see "Shared folder ownership and agent placement")

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.opencode/agents/specd-project-context-optimizer.md` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.opencode/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain

#### Scenario: Filtered uninstall keeps the prompt block and the owners marker

- **GIVEN** the plugin is installed and is an owner of the shared folder
- **WHEN** `uninstall` runs with `options.skills` or `options.agents`
- **THEN** the `opencode` reference in `AGENTS.md` is kept
- **AND** `.owners.json` and every shared file are unchanged

### Requirement: Shared folder ownership and agent placement

#### Scenario: create rejects a manifest without name or version

- **GIVEN** the resolved `specd-plugin.json` has no non-empty string `name` or `version`
- **WHEN** `create` is called
- **THEN** `PluginValidationError` is thrown with the field `specd-plugin.json: name` or `specd-plugin.json: version`

#### Scenario: Install registers the plugin as shared-folder owner

- **WHEN** `install` writes files into the shared folder
- **THEN** `.owners.json` lists `opencode`

#### Scenario: Filtered install also registers the owner

- **WHEN** `install` runs with a `skills` filter and writes a shared file
- **THEN** `.owners.json` lists `opencode`

#### Scenario: Owner registered before the first shared write

- **GIVEN** the first write into the shared folder fails
- **WHEN** `install` rejects
- **THEN** `.owners.json` already lists `opencode`
- **AND** a later full uninstall releases the owner and removes the shared folder when it was the last owner

#### Scenario: Filtered uninstall removes only the selected agent file in the shared folder

- **GIVEN** the runtime lacks the `agents` capability so agent files live in the shared folder
- **WHEN** `uninstall` runs with `options.agents` selecting one agent
- **THEN** only that `<agent-name>.agent.md` is removed from the shared folder
- **AND** every other shared file and `.owners.json` remain, and `removeSharedOwner` is not called

#### Scenario: Other owners keep the shared files

- **GIVEN** `opencode` and another agent plugin are owners of the shared folder
- **WHEN** `opencode` is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain
- **AND** `.owners.json` lists only the other plugin

#### Scenario: Last owner removes shared files and the empty folder

- **GIVEN** `opencode` is the only owner and the folder holds only specd files and the marker
- **WHEN** `opencode` is fully uninstalled
- **THEN** `shared.md`, the agent files and `.owners.json` are deleted
- **AND** the shared folder itself no longer exists

#### Scenario: Foreign file keeps the shared folder

- **GIVEN** `opencode` is the only owner and the folder also contains `notes.txt`
- **WHEN** `opencode` is fully uninstalled
- **THEN** the specd shared files and the marker are deleted
- **AND** `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes no shared file

- **GIVEN** a shared folder with `shared.md` and no `.owners.json`
- **WHEN** `opencode` is fully uninstalled
- **THEN** `shared.md` still exists

#### Scenario: Agents go next to shared.md when agents capability is missing

- **GIVEN** the install is run with a capability list that does not include `agents`
- **WHEN** an agent is installed
- **THEN** the agent file is written to the shared folder next to `shared.md` and not to `.opencode/agents/`

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves capability identifiers and frontmatter source values, and passes them into `@specd/skills`
- **AND** shared-marked files are written to the rendered sharedFolder location under the project root
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Open Code application layer does not prepend YAML after resolution

- **WHEN** the Open Code install flow is reviewed
- **THEN** the plugin does not assemble a final YAML frontmatter block after bundle resolution

#### Scenario: Open Code install does not call repository bundle resolution directly

- **WHEN** the Open Code install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Fast-track skill installation

#### Scenario: Default Open Code installation includes fast-track

- **GIVEN** no explicit skill filter
- **WHEN** Open Code installs available standard skills
- **THEN** its fast-track skill is rendered and installed through `ResolveBundle`
- **AND** the rendered frontmatter contains only Open Code-supported fields
- **AND** capability-aware workflow content is retained for supplied capabilities

### Requirement: Manual-only fast-track routing

#### Scenario: Installing fast-track for OpenCode

- **WHEN** the OpenCode plugin renders fast-track frontmatter
- **THEN** the description states that explicit `/specd-fasttrack` invocation is required
