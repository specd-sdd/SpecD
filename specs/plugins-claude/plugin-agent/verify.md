# Verification: plugin-agent-claude:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exports create function

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available
- **AND** it returns an `AgentPlugin` or a promise of one

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-claude"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-claude"` and `version === "1.0.0"`

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
- **THEN** `schemaVersion` is `2`, `pluginType` is absent and `contributes.agents` has the id `claude`

#### Scenario: Install receives the context

- **WHEN** `install({ config, options, contributions: ['claude'] })` is called
- **THEN** the plugin installs using `config` and `options`

### Requirement: Frontmatter injection

#### Scenario: Install emits Claude-compatible frontmatter through skills rendering

- **WHEN** `install()` is called
- **THEN** skill-local markdown files are written with Claude-compatible frontmatter already present in the rendered content

#### Scenario: Shared files do not receive Claude frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** `install()` writes those files
- **THEN** shared files are written without Claude skill frontmatter

### Requirement: Install location

#### Scenario: Installs to .claude/skills/ and sharedFolder default location

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install is called with that configuration
- **THEN** non-shared files are written to `{projectRoot}/.claude/skills/<skill-name>/`
- **AND** shared files are written to the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Installs agents to categorized directory

- **GIVEN** a request to install an agent
- **WHEN** `install({ config, options, contributions })` runs
- **THEN** it installs the agent as a flat file `.claude/agents/<agent-name>.md`
- **AND** the YAML frontmatter contains `tools` as a comma-separated string

#### Scenario: Agent model is read from agent metadata

- **GIVEN** `specd-agent.meta.json` defines a preferred model for an agent
- **WHEN** the agent is installed
- **THEN** the YAML frontmatter contains that `model`

#### Scenario: Agent without model omits the key

- **GIVEN** no model is defined for an agent
- **WHEN** the agent is installed
- **THEN** the YAML frontmatter has no `model` key

#### Scenario: Fallback to shared location when agents capability is missing

- **GIVEN** a runtime that does not support `agents`
- **WHEN** an agent is installed
- **THEN** it is copied to the same directory as `shared.md`

### Requirement: Prompt Injection

#### Scenario: Install writes CLAUDE.md prompt block

- **WHEN** `ClaudeAgentPlugin.install()` runs
- **THEN** `CLAUDE.md` contains the reference-counted block `<!-- <specd agents="claude"> -->` with standard specd agent instructions

#### Scenario: Uninstall removes CLAUDE.md prompt block

- **GIVEN** `claude` is the only plugin referencing the block
- **WHEN** a full `ClaudeAgentPlugin.uninstall()` runs
- **THEN** the specd block is removed from `CLAUDE.md`

#### Scenario: Filtered uninstall keeps the CLAUDE.md prompt block

- **WHEN** `ClaudeAgentPlugin.uninstall()` runs with `options.skills`
- **THEN** the block in `CLAUDE.md` is kept

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.claude/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.claude/skills/`
- **WHEN** `uninstall({ config, options: {}, contributions: ['claude'] })` is executed
- **THEN** all specd-managed skill directories are removed, including legacy flat `<skill>.md` files
- **AND** unrelated user skill directories remain
- **AND** the shared folder is handled by the owners protocol (see "Shared folder ownership and agent placement")

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.claude/agents/specd-project-context-optimizer.md` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.claude/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain

#### Scenario: Filtered uninstall keeps the prompt block and the owners marker

- **GIVEN** the plugin is installed and is an owner of the shared folder
- **WHEN** `uninstall` runs with `options.skills` or `options.agents`
- **THEN** the `claude` reference in `CLAUDE.md` is kept
- **AND** `.owners.json` and every shared file are unchanged

### Requirement: Shared folder ownership and agent placement

#### Scenario: create rejects a manifest without name or version

- **GIVEN** the resolved `specd-plugin.json` has no non-empty string `name` or `version`
- **WHEN** `create` is called
- **THEN** `PluginValidationError` is thrown with the field `specd-plugin.json: name` or `specd-plugin.json: version`

#### Scenario: Install registers the plugin as shared-folder owner

- **WHEN** `install` writes files into the shared folder
- **THEN** `.owners.json` lists `claude`

#### Scenario: Filtered install also registers the owner

- **WHEN** `install` runs with a `skills` filter and writes a shared file
- **THEN** `.owners.json` lists `claude`

#### Scenario: Owner registered before the first shared write

- **GIVEN** the first write into the shared folder fails
- **WHEN** `install` rejects
- **THEN** `.owners.json` already lists `claude`
- **AND** a later full uninstall releases the owner and removes the shared folder when it was the last owner

#### Scenario: Filtered uninstall removes only the selected agent file in the shared folder

- **GIVEN** the runtime lacks the `agents` capability so agent files live in the shared folder
- **WHEN** `uninstall` runs with `options.agents` selecting one agent
- **THEN** only that `<agent-name>.agent.md` is removed from the shared folder
- **AND** every other shared file and `.owners.json` remain, and `removeSharedOwner` is not called

#### Scenario: Other owners keep the shared files

- **GIVEN** `claude` and another agent plugin are owners of the shared folder
- **WHEN** `claude` is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain
- **AND** `.owners.json` lists only the other plugin

#### Scenario: Last owner removes shared files and the empty folder

- **GIVEN** `claude` is the only owner and the folder holds only specd files and the marker
- **WHEN** `claude` is fully uninstalled
- **THEN** `shared.md`, the agent files and `.owners.json` are deleted
- **AND** the shared folder itself no longer exists

#### Scenario: Foreign file keeps the shared folder

- **GIVEN** `claude` is the only owner and the folder also contains `notes.txt`
- **WHEN** `claude` is fully uninstalled
- **THEN** the specd shared files and the marker are deleted
- **AND** `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes no shared file

- **GIVEN** a shared folder with `shared.md` and no `.owners.json`
- **WHEN** `claude` is fully uninstalled
- **THEN** `shared.md` still exists

#### Scenario: Agents go next to shared.md when agents capability is missing

- **GIVEN** the install is run with a capability list that does not include `agents`
- **WHEN** an agent is installed
- **THEN** the agent file is written to the shared folder next to `shared.md` and not to `.claude/agents/`

### Requirement: Domain layer

#### Scenario: Domain layer contains claude-plugin.ts

- **WHEN** the domain layer is inspected
- **THEN** `domain/types/claude-plugin.ts` exists implementing the `AgentPlugin` interface

#### Scenario: Domain layer contains frontmatter.ts

- **WHEN** the domain layer is inspected
- **THEN** `domain/types/frontmatter.ts` exists with Frontmatter type definitions
- **AND** `domain/frontmatter/index.ts` exports `skillFrontmatter` and `agentFrontmatter`

### Requirement: Frontmatter type

#### Scenario: Frontmatter values cover Claude-supported metadata

- **WHEN** Claude frontmatter values are prepared for install
- **THEN** they can represent the Claude-supported metadata fields
- **AND** they are stored as structured values rather than a prebuilt YAML document

#### Scenario: Unsupported Claude metadata stays out of the value collection

- **WHEN** a non-Claude metadata key is proposed
- **THEN** it is excluded from the Claude frontmatter value collection

### Requirement: Application layer

#### Scenario: InstallSkills passes Claude values into skills rendering

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it resolves Claude frontmatter source values per skill
- **AND** it passes only Claude capability identifiers into `@specd/skills`
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Shared files are written to the rendered sharedFolder location

- **GIVEN** a resolved bundle contains files marked as shared
- **WHEN** `InstallSkills` writes those files
- **THEN** they are written to the resolved sharedFolder location under the project root

#### Scenario: Claude install does not call repository bundle resolution directly

- **WHEN** the Claude install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Fast-track skill installation

#### Scenario: Default Claude installation includes fast-track

- **GIVEN** no explicit skill filter
- **WHEN** Claude installs available standard skills
- **THEN** `.claude/skills/specd-fasttrack/SKILL.md` is written from `ResolveBundle`
- **AND** the rendered content includes the incremental journal-resumability contract

### Requirement: Manual-only fast-track routing

#### Scenario: Installing fast-track for Claude

- **WHEN** the Claude plugin renders fast-track frontmatter
- **THEN** the description states that explicit `/specd-fasttrack` invocation is required
- **AND** the rendered `SKILL.md` contains `disable-model-invocation: true`
- **AND** it contains no `disable_model_invocation` and no `allowed_tools` key
