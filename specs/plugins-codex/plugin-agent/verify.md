# Verification: plugin-agent-codex:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes plugin factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available and returns an `AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-codex"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-codex"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Plugin runtime contract

#### Scenario: Created plugin satisfies runtime contract

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type: 'agent'`
- **AND** it exposes `install(config, options)` and `uninstall(config, options)`
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

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.codex/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.codex/skills/`
- **WHEN** `uninstall(config)` is executed without `skills`
- **THEN** all specd-managed skill directories are removed
- **AND** the resolved sharedFolder location is removed
- **AND** unrelated user skill directories remain

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.codex/agents/specd-project-context-optimizer.toml` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.codex/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain
